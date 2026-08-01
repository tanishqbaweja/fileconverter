import {
  openZipEntryStream,
  readZipDirectory,
  type ArchiveReadRuntime,
  type ZipEntry,
} from "./archive-conversion";

const IO_CHUNK_BYTES = 256 * 1024;
const MAX_PACKAGE_METADATA_BYTES = 1024 * 1024;
const MAX_XML_TOKEN_CHARS = 256 * 1024;
const MAX_XML_DEPTH = 256;
const MAX_XML_ATTRIBUTES = 4_096;
const MAX_ENTITY_CHARS = 32;
const XML_NAME = /^[\p{L}_:][\p{L}\p{N}\p{M}_.:\-]*/u;
const XML_NAME_ONLY = /^[\p{L}_:][\p{L}\p{N}\p{M}_.:\-]*$/u;
const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const WORD_DOCUMENT_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

interface DocxRuntime extends ArchiveReadRuntime {
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  warn(message: string): void;
}

export type MarkupToken =
  | { kind: "text"; value: string; cdata: boolean }
  | { kind: "start" | "end"; value: string };

export interface ParsedStartElement {
  name: string;
  attributes: Array<{ name: string; value: string }>;
  selfClosing: boolean;
}

export async function runDocxToText(runtime: DocxRuntime): Promise<void> {
  runtime.warn(
    "DOCX text extraction preserves main-document paragraph order, tabs, line breaks, Unicode text, and accepted tracked insertions. Formatting, images, drawing text, fields, comments, headers, footers, notes, hyperlinks, styles, and page layout are not represented in plain text.",
  );
  runtime.warn(
    "Tracked deletions are excluded and tables are linearized as their contained paragraphs.",
  );

  runtime.progress("Inspecting DOCX package");
  const entries = await readZipDirectory(runtime);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  if ([...byName.keys()].some((name) => name.toLowerCase() === "word/vbaproject.bin")) {
    throw new Error("Macro-enabled Word packages are not accepted by the DOCX profile.");
  }
  const contentTypes = requiredEntry(byName, "[Content_Types].xml");
  const relationships = requiredEntry(byName, "_rels/.rels");
  const document = requiredEntry(byName, "word/document.xml");
  await validateContentTypes(runtime, contentTypes);
  await validateRelationships(runtime, relationships);

  runtime.progress("Extracting DOCX text");
  const source = await openZipEntryStream(runtime, document);
  await extractWordDocument(runtime, source);
  runtime.metrics.inputBytes = runtime.file.size;
}

function requiredEntry(
  entries: ReadonlyMap<string, ZipEntry>,
  name: string,
): ZipEntry {
  const entry = entries.get(name);
  if (!entry || entry.directory) {
    throw new Error(`DOCX package is missing required part ${name}.`);
  }
  return entry;
}

async function validateContentTypes(
  runtime: DocxRuntime,
  entry: ZipEntry,
): Promise<void> {
  const xml = await readSmallXmlEntry(runtime, entry, "content types");
  let valid = false;
  for (const raw of xml.match(/<Override\b[^>]*>/g) ?? []) {
    const element = parseStartElement(raw);
    const attributes = new Map(
      element.attributes.map((attribute) => [attribute.name, attribute.value]),
    );
    if (
      attributes.get("PartName") === "/word/document.xml" &&
      attributes.get("ContentType") === WORD_DOCUMENT_CONTENT_TYPE
    ) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    throw new Error(
      "DOCX content types do not identify word/document.xml as the main Word document.",
    );
  }
}

async function validateRelationships(
  runtime: DocxRuntime,
  entry: ZipEntry,
): Promise<void> {
  const xml = await readSmallXmlEntry(runtime, entry, "root relationships");
  let valid = false;
  for (const raw of xml.match(/<Relationship\b[^>]*>/g) ?? []) {
    const element = parseStartElement(raw);
    const attributes = new Map(
      element.attributes.map((attribute) => [attribute.name, attribute.value]),
    );
    const target = attributes.get("Target")?.replace(/^\//, "");
    if (
      attributes.get("Type") === OFFICE_DOCUMENT_RELATIONSHIP &&
      target === "word/document.xml" &&
      attributes.get("TargetMode") !== "External"
    ) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    throw new Error(
      "DOCX root relationships do not point to word/document.xml.",
    );
  }
}

async function readSmallXmlEntry(
  runtime: DocxRuntime,
  entry: ZipEntry,
  label: string,
): Promise<string> {
  if (entry.uncompressedSize > MAX_PACKAGE_METADATA_BYTES) {
    throw new Error(`DOCX ${label} exceed the 1 MiB metadata safety limit.`);
  }
  const reader = (await openZipEntryStream(runtime, entry)).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let output = "";
  for (;;) {
    runtime.assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
    if (output.length > MAX_PACKAGE_METADATA_BYTES) {
      throw new Error(`DOCX ${label} exceed the 1 MiB metadata safety limit.`);
    }
  }
  output = `${output}${decoder.decode()}`.replace(/^\uFEFF/, "");
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(output)) {
    throw new Error(`DOCX ${label} contain a forbidden DTD or entity declaration.`);
  }
  return output;
}

async function extractWordDocument(
  runtime: DocxRuntime,
  source: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<void> {
  const writer = createTextWriter(runtime);
  const stack: Array<{ name: string; wordLocal: string | null }> = [];
  let wordPrefix: string | null = null;
  let rootSeen = false;
  let rootClosed = false;
  let bodySeen = false;
  let bodyDepth = 0;
  let textDepth = 0;
  let deletionDepth = 0;
  let excludedDepth = 0;

  const localName = (name: string): string | null => {
    if (wordPrefix === null) return null;
    if (!wordPrefix) return name.includes(":") ? null : name;
    const prefix = `${wordPrefix}:`;
    return name.startsWith(prefix) ? name.slice(prefix.length) : null;
  };

  for await (const token of readMarkupTokens(source, runtime)) {
    runtime.assertActive();
    if (token.kind === "text") {
      if (!stack.length && token.value.trim()) {
        throw new Error("DOCX XML contains text outside its document root.");
      }
      if (
        bodyDepth > 0 &&
        textDepth > 0 &&
        deletionDepth === 0 &&
        excludedDepth === 0
      ) {
        const normalized = normalizeXmlNewlines(token.value);
        const value = token.cdata
          ? normalized
          : decodeXmlEntities(normalized, "DOCX text");
        assertXmlCharacters(value, "DOCX text");
        await writer.write(value);
      }
      continue;
    }

    if (token.kind === "start") {
      const element = parseStartElement(token.value);
      if (rootClosed) {
        throw new Error("DOCX XML contains more than one document root.");
      }
      if (!rootSeen) {
        const namespace = element.attributes.find(
          (attribute) => attribute.value === WORD_NAMESPACE,
        );
        if (!namespace || (namespace.name !== "xmlns" && !namespace.name.startsWith("xmlns:"))) {
          throw new Error("DOCX main document is missing the WordprocessingML namespace.");
        }
        wordPrefix = namespace.name === "xmlns" ? "" : namespace.name.slice(6);
        if (localName(element.name) !== "document") {
          throw new Error("DOCX main part does not contain a Word document root.");
        }
        rootSeen = true;
      }

      const wordLocal = localName(element.name);
      if (wordLocal === "body") {
        bodySeen = true;
        bodyDepth += 1;
      }
      if (wordLocal === "del") deletionDepth += 1;
      if (wordLocal === "t") textDepth += 1;
      if (
        wordLocal === "drawing" ||
        wordLocal === "pict" ||
        wordLocal === "object"
      ) {
        excludedDepth += 1;
      }

      if (
        bodyDepth > 0 &&
        deletionDepth === 0 &&
        excludedDepth === 0 &&
        element.selfClosing
      ) {
        if (wordLocal === "tab") await writer.write("\t");
        else if (wordLocal === "br" || wordLocal === "cr") {
          await writer.lineBreak();
        } else if (wordLocal === "noBreakHyphen") {
          await writer.write("\u2011");
        } else if (wordLocal === "softHyphen") {
          await writer.write("\u00ad");
        }
      }

      if (element.selfClosing) {
        if (wordLocal === "t") textDepth -= 1;
        if (wordLocal === "del") deletionDepth -= 1;
        if (
          wordLocal === "drawing" ||
          wordLocal === "pict" ||
          wordLocal === "object"
        ) {
          excludedDepth -= 1;
        }
        if (wordLocal === "body") bodyDepth -= 1;
      } else {
        if (stack.length >= MAX_XML_DEPTH) {
          throw new Error(
            `DOCX XML nesting exceeds the ${MAX_XML_DEPTH}-element safety limit.`,
          );
        }
        stack.push({ name: element.name, wordLocal });
      }
      continue;
    }

    const name = parseEndElement(token.value);
    const opened = stack.pop();
    if (!opened || opened.name !== name) {
      throw new Error(
        `DOCX XML closing element </${name}> does not match ${opened ? `<${opened.name}>` : "an open element"}.`,
      );
    }
    if (opened.wordLocal === "t") textDepth -= 1;
    if (opened.wordLocal === "del") deletionDepth -= 1;
    if (
      opened.wordLocal === "drawing" ||
      opened.wordLocal === "pict" ||
      opened.wordLocal === "object"
    ) {
      excludedDepth -= 1;
    }
    if (
      opened.wordLocal === "p" &&
      bodyDepth > 0 &&
      deletionDepth === 0
    ) {
      await writer.lineBreak();
    }
    if (opened.wordLocal === "body") bodyDepth -= 1;
    if (opened.wordLocal === "document") rootClosed = true;
  }

  if (!rootSeen || !rootClosed || !bodySeen) {
    throw new Error("DOCX main document is missing its document or body element.");
  }
  if (stack.length) {
    throw new Error(`DOCX XML ends before <${stack.at(-1)?.name}> is closed.`);
  }
  if (
    textDepth !== 0 ||
    deletionDepth !== 0 ||
    excludedDepth !== 0 ||
    bodyDepth !== 0
  ) {
    throw new Error("DOCX XML element state is incomplete.");
  }
  await writer.flush();
}

export async function* readMarkupTokens(
  source: ReadableStream<Uint8Array<ArrayBuffer>>,
  runtime: DocxRuntime,
  formatLabel = "DOCX",
): AsyncGenerator<MarkupToken> {
  const reader = source.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let offset = 0;
  let cdata = false;
  let first = true;
  let declarationAllowed = true;
  let declarationSeen = false;

  const compact = () => {
    if (!offset) return;
    buffer = offset === buffer.length ? "" : buffer.slice(offset);
    offset = 0;
  };

  const take = (final: boolean): MarkupToken | null => {
    for (;;) {
      if (cdata) {
        const end = buffer.indexOf("]]>", offset);
        if (end === offset) {
          offset += 3;
          cdata = false;
          continue;
        }
        if (end > offset) {
          const available = end - offset;
          const length = safeCharacterCut(
            buffer.slice(offset, end),
            Math.min(available, MAX_XML_TOKEN_CHARS),
          );
          const value = buffer.slice(offset, offset + length);
          offset += length;
          return { kind: "text", value, cdata: true };
        }
        if (buffer.length - offset > MAX_XML_TOKEN_CHARS + 2) {
          const length = safeCharacterCut(
            buffer.slice(offset),
            MAX_XML_TOKEN_CHARS,
          );
          const value = buffer.slice(offset, offset + length);
          offset += length;
          return { kind: "text", value, cdata: true };
        }
        if (final) throw new Error(`${formatLabel} XML ends inside a CDATA section.`);
        return null;
      }

      if (offset === buffer.length) {
        buffer = "";
        offset = 0;
        return null;
      }
      if (buffer[offset] !== "<") {
        const markup = buffer.indexOf("<", offset);
        const available =
          (markup < 0 ? buffer.length : markup) - offset;
        if (
          markup < 0 &&
          !final &&
          available <= MAX_XML_TOKEN_CHARS + MAX_ENTITY_CHARS
        ) {
          return null;
        }
        const desired = Math.min(available, MAX_XML_TOKEN_CHARS);
        const length = safeXmlTextCut(
          buffer.slice(offset, offset + available),
          desired,
        );
        if (!length) {
          if (buffer.length - offset > MAX_XML_TOKEN_CHARS + MAX_ENTITY_CHARS) {
            throw new Error(`A ${formatLabel} XML entity exceeds the bounded token limit.`);
          }
          return null;
        }
        const value = buffer.slice(offset, offset + length);
        offset += length;
        if (value.includes("]]>")) {
          throw new Error(
            `${formatLabel} XML text cannot contain ']]>' outside CDATA.`,
          );
        }
        declarationAllowed = false;
        return { kind: "text", value, cdata: false };
      }

      if (buffer.startsWith("<![CDATA[", offset)) {
        offset += 9;
        cdata = true;
        declarationAllowed = false;
        continue;
      }
      if (buffer.startsWith("<!--", offset)) {
        const end = buffer.indexOf("-->", offset + 4);
        if (end < 0) {
          assertPendingToken(
            buffer.slice(offset),
            final,
            "comment",
            formatLabel,
          );
          return null;
        }
        const comment = buffer.slice(offset + 4, end);
        if (comment.includes("--") || comment.endsWith("-")) {
          throw new Error(`${formatLabel} XML contains a malformed comment.`);
        }
        offset = end + 3;
        declarationAllowed = false;
        continue;
      }
      if (buffer.startsWith("<?", offset)) {
        const end = buffer.indexOf("?>", offset + 2);
        if (end < 0) {
          assertPendingToken(
            buffer.slice(offset),
            final,
            "processing instruction",
            formatLabel,
          );
          return null;
        }
        const instruction = buffer.slice(offset, end + 2);
        if (/^<\?xml(?:\s|\?)/.test(instruction)) {
          if (!declarationAllowed || declarationSeen) {
            throw new Error(
              `${formatLabel} XML declaration must be the first construct.`,
            );
          }
          validateXmlDeclaration(instruction, formatLabel);
          declarationSeen = true;
        } else if (/^<\?[xX][mM][lL](?:\s|\?)/.test(instruction)) {
          throw new Error(`${formatLabel} XML declaration target must be lowercase xml.`);
        }
        offset = end + 2;
        declarationAllowed = false;
        continue;
      }
      if (buffer.startsWith("<!", offset)) {
        if (/^<!DOCTYPE\b/i.test(buffer.slice(offset, offset + 10))) {
          throw new Error(`${formatLabel} XML DTDs and custom or external entities are not supported.`);
        }
        if (buffer.length - offset < 10 && !final) return null;
        throw new Error(`Unsupported ${formatLabel} XML declaration markup was encountered.`);
      }

      const end = findTagEnd(buffer, offset);
      if (end < 0) {
        assertPendingToken(
          buffer.slice(offset),
          final,
          "element tag",
          formatLabel,
        );
        return null;
      }
      if (end - offset > MAX_XML_TOKEN_CHARS) {
        throw new Error(`A ${formatLabel} XML element tag exceeds the 256 KiB safety limit.`);
      }
      const value = buffer.slice(offset, end);
      offset = end;
      declarationAllowed = false;
      return { kind: value.startsWith("</") ? "end" : "start", value };
    }
  };

  for (;;) {
    runtime.assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    let text = decoder.decode(value, { stream: true });
    if (first) {
      text = text.replace(/^\uFEFF/, "");
      first = false;
    }
    compact();
    buffer += text;
    runtime.progress(`Parsing ${formatLabel} XML`);
    for (;;) {
      const token = take(false);
      if (!token) break;
      yield token;
    }
  }
  compact();
  buffer += decoder.decode();
  for (;;) {
    const token = take(true);
    if (!token) break;
    yield token;
  }
  if (offset !== buffer.length || cdata) {
    throw new Error(`${formatLabel} XML input ends inside markup.`);
  }
}

function validateXmlDeclaration(value: string, formatLabel: string): void {
  const match = value.match(
    /^<\?xml\s+version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])[Uu][Tt][Ff]-8\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*\?>$/,
  );
  if (!match) {
    throw new Error(
      `${formatLabel} XML declaration must specify XML 1.0 and optional UTF-8 encoding.`,
    );
  }
}

export function parseStartElement(
  value: string,
  formatLabel = "DOCX",
): ParsedStartElement {
  if (!value.endsWith(">") || value.startsWith("</")) {
    throw new Error(`${formatLabel} XML contains an invalid start element.`);
  }
  let inner = value.slice(1, -1);
  const selfClosing = /\/\s*$/.test(inner);
  if (selfClosing) inner = inner.replace(/\/\s*$/, "");
  const nameMatch = inner.match(XML_NAME);
  if (!nameMatch) {
    throw new Error(`${formatLabel} XML contains an invalid element name.`);
  }
  const name = nameMatch[0];
  let index = name.length;
  if (index < inner.length && !isXmlSpace(inner[index])) {
    throw new Error(`${formatLabel} XML element <${name}> has malformed attributes.`);
  }
  const attributes: Array<{ name: string; value: string }> = [];
  const names = new Set<string>();
  while (index < inner.length) {
    while (index < inner.length && isXmlSpace(inner[index])) index += 1;
    if (index === inner.length) break;
    const attributeMatch = inner.slice(index).match(XML_NAME);
    if (!attributeMatch) {
      throw new Error(`${formatLabel} XML element <${name}> has an invalid attribute name.`);
    }
    const attributeName = attributeMatch[0];
    index += attributeName.length;
    while (index < inner.length && isXmlSpace(inner[index])) index += 1;
    if (inner[index] !== "=") {
      throw new Error(`${formatLabel} XML attribute ${attributeName} is missing '='.`);
    }
    index += 1;
    while (index < inner.length && isXmlSpace(inner[index])) index += 1;
    const quote = inner[index];
    if (quote !== '"' && quote !== "'") {
      throw new Error(`${formatLabel} XML attribute ${attributeName} must be quoted.`);
    }
    const end = inner.indexOf(quote, index + 1);
    if (end < 0) {
      throw new Error(`${formatLabel} XML attribute ${attributeName} is not closed.`);
    }
    const raw = inner.slice(index + 1, end);
    if (raw.includes("<") || names.has(attributeName)) {
      throw new Error(`${formatLabel} XML element <${name}> has invalid repeated attributes.`);
    }
    names.add(attributeName);
    const decoded = decodeXmlEntities(
      normalizeXmlNewlines(raw),
      `${formatLabel} XML attribute ${attributeName}`,
    );
    assertXmlCharacters(decoded, `${formatLabel} XML attribute ${attributeName}`);
    attributes.push({ name: attributeName, value: decoded });
    if (attributes.length > MAX_XML_ATTRIBUTES) {
      throw new Error(
        `${formatLabel} XML element <${name}> exceeds the ${MAX_XML_ATTRIBUTES}-attribute safety limit.`,
      );
    }
    index = end + 1;
    if (index < inner.length && !isXmlSpace(inner[index])) {
      throw new Error(`${formatLabel} XML element <${name}> has malformed attributes.`);
    }
  }
  return { name, attributes, selfClosing };
}

export function parseEndElement(value: string, formatLabel = "DOCX"): string {
  const inner = value.slice(2, -1);
  const trimmed = inner.trim();
  if (!XML_NAME_ONLY.test(trimmed) || inner !== inner.trimStart()) {
    throw new Error(`${formatLabel} XML contains an invalid closing element.`);
  }
  return trimmed;
}

export function decodeXmlEntities(value: string, context: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
  let output = "";
  let index = 0;
  while (index < value.length) {
    const ampersand = value.indexOf("&", index);
    if (ampersand < 0) return output + value.slice(index);
    output += value.slice(index, ampersand);
    const semicolon = value.indexOf(";", ampersand + 1);
    if (semicolon < 0 || semicolon - ampersand > MAX_ENTITY_CHARS) {
      throw new Error(`${context} contains an unterminated or oversized entity.`);
    }
    const body = value.slice(ampersand + 1, semicolon);
    if (Object.hasOwn(named, body)) {
      output += named[body];
    } else {
      const numeric = /^#x[0-9a-f]+$/i.test(body)
        ? Number.parseInt(body.slice(2), 16)
        : /^#[0-9]+$/.test(body)
          ? Number.parseInt(body.slice(1), 10)
          : Number.NaN;
      if (!Number.isInteger(numeric) || !isXmlCharacter(numeric)) {
        throw new Error(`${context} contains unsupported entity &${body};.`);
      }
      output += String.fromCodePoint(numeric);
    }
    index = semicolon + 1;
  }
  return output;
}

export function assertXmlCharacters(value: string, context: string): void {
  for (const character of value) {
    if (!isXmlCharacter(character.codePointAt(0) ?? 0)) {
      throw new Error(`${context} contains a character forbidden by XML 1.0.`);
    }
  }
}

function isXmlCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

export function normalizeXmlNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function findTagEnd(value: string, start = 0): number {
  let quote = "";
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }
  return -1;
}

function safeXmlTextCut(value: string, desired: number): number {
  let cut = safeCharacterCut(value, desired);
  if (cut < value.length) {
    const ampersand = value.lastIndexOf("&", cut - 1);
    const semicolon = ampersand < 0 ? -1 : value.indexOf(";", ampersand + 1);
    if (ampersand >= 0 && (semicolon < 0 || semicolon >= cut)) cut = ampersand;
  }
  return cut;
}

function safeCharacterCut(value: string, desired: number): number {
  let cut = Math.min(desired, value.length);
  if (cut > 0 && cut < value.length) {
    const last = value.charCodeAt(cut - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
  }
  return cut;
}

function assertPendingToken(
  value: string,
  final: boolean,
  label: string,
  formatLabel: string,
): void {
  if (value.length > MAX_XML_TOKEN_CHARS) {
    throw new Error(
      `A ${formatLabel} XML ${label} exceeds the 256 KiB safety limit.`,
    );
  }
  if (final) throw new Error(`${formatLabel} XML ends inside a ${label}.`);
}

function isXmlSpace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\r" ||
    character === "\n"
  );
}

function createTextWriter(runtime: DocxRuntime) {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(IO_CHUNK_BYTES);
  let used = 0;
  let lastCharacter = "";
  const flush = async () => {
    if (!used) return;
    await runtime.write(buffer.slice(0, used), "Writing DOCX text");
    used = 0;
  };
  const write = async (value: string) => {
    if (!value) return;
    lastCharacter = value.at(-1) ?? lastCharacter;
    let remaining = value;
    while (remaining) {
      const result = encoder.encodeInto(remaining, buffer.subarray(used));
      used += result.written;
      remaining = remaining.slice(result.read);
      if (used === buffer.byteLength) await flush();
      if (result.read === 0 && result.written === 0) await flush();
    }
  };
  return {
    write,
    async lineBreak() {
      if (lastCharacter !== "\n") await write("\n");
    },
    flush,
  };
}
