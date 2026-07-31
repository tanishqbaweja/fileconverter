import type { ConversionMetrics } from "../lib/conversion-protocol";

const IO_CHUNK_BYTES = 256 * 1024;
const MAX_XML_TOKEN_CHARS = 256 * 1024;
const MAX_XML_DEPTH = 256;
const MAX_XML_ATTRIBUTES = 4_096;
const MAX_ENTITY_CHARS = 32;
const XML_NAME = /^[\p{L}_:][\p{L}\p{N}\p{M}_.:\-]*/u;
const XML_NAME_ONLY = /^[\p{L}_:][\p{L}\p{N}\p{M}_.:\-]*$/u;

interface XmlRuntime {
  file: File;
  metrics: ConversionMetrics;
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  warn(message: string): void;
  assertActive(): void;
  progress(phase: string): void;
}

type XmlEvent =
  | { type: "startDocument" }
  | {
      type: "declaration";
      version: "1.0";
      encoding: "UTF-8" | null;
      standalone: "yes" | "no" | null;
    }
  | {
      type: "startElement";
      name: string;
      attributes: Array<{ name: string; value: string }>;
      selfClosing: boolean;
    }
  | { type: "endElement"; name: string }
  | { type: "text"; value: string; cdata?: true }
  | { type: "comment"; value: string }
  | { type: "processingInstruction"; target: string; data: string }
  | { type: "endDocument" };

type RawToken =
  | { kind: "text"; value: string; cdata: boolean }
  | { kind: "start" | "end" | "comment" | "pi"; value: string };

export async function runXmlToNdjson(runtime: XmlRuntime): Promise<void> {
  runtime.warn(
    "XML is emitted as ordered NDJSON structural events. UTF-8 XML 1.0 names, attributes, text, CDATA, comments, and processing instructions are retained; DTDs and custom or external entities are rejected.",
  );
  runtime.warn(
    "Qualified names and namespace declarations are preserved lexically without namespace resolution; XML line endings and entity spellings are normalized to their character values.",
  );

  const writer = createEventWriter(runtime);
  const writeEvent = async (event: XmlEvent) => {
    runtime.assertActive();
    await writer.write(`${JSON.stringify(event)}\n`);
  };

  const stack: string[] = [];
  let rootSeen = false;
  let rootClosed = false;
  let declarationSeen = false;
  let declarationAllowed = true;

  await writeEvent({ type: "startDocument" });
  for await (const token of readXmlTokens(runtime)) {
    runtime.assertActive();
    if (token.kind === "text") {
      const normalized = normalizeXmlNewlines(token.value);
      const value = token.cdata
        ? normalized
        : decodeXmlEntities(normalized, "XML text");
      if (!token.cdata && normalized.includes("]]>")) {
        throw new Error("XML text cannot contain ']]>' outside a CDATA section.");
      }
      assertXmlCharacters(value, "XML text");
      if (!stack.length && value.trim()) {
        throw new Error("XML contains non-whitespace text outside the root element.");
      }
      if (value && stack.length) {
        await writeEvent({
          type: "text",
          value,
          ...(token.cdata ? { cdata: true as const } : {}),
        });
      }
      if (value) declarationAllowed = false;
      continue;
    }

    if (token.kind === "comment") {
      const value = normalizeXmlNewlines(token.value.slice(4, -3));
      if (value.includes("--") || value.endsWith("-")) {
        throw new Error("XML comments cannot contain consecutive hyphens.");
      }
      assertXmlCharacters(value, "XML comment");
      await writeEvent({ type: "comment", value });
      declarationAllowed = false;
      continue;
    }

    if (token.kind === "pi") {
      const instruction = parseProcessingInstruction(token.value);
      if (instruction.target.toLowerCase() === "xml") {
        if (!declarationAllowed || declarationSeen || rootSeen) {
          throw new Error("The XML declaration must be the first construct in the file.");
        }
        const declaration = parseXmlDeclaration(instruction.data);
        await writeEvent({ type: "declaration", ...declaration });
        declarationSeen = true;
      } else {
        assertXmlCharacters(instruction.data, "XML processing instruction");
        await writeEvent({ type: "processingInstruction", ...instruction });
      }
      declarationAllowed = false;
      continue;
    }

    declarationAllowed = false;
    if (token.kind === "start") {
      const element = parseStartElement(token.value);
      if (!stack.length) {
        if (rootClosed) throw new Error("XML contains more than one root element.");
        rootSeen = true;
      }
      await writeEvent({ type: "startElement", ...element });
      if (element.selfClosing) {
        if (!stack.length) rootClosed = true;
      } else {
        if (stack.length >= MAX_XML_DEPTH) {
          throw new Error(`XML nesting exceeds the ${MAX_XML_DEPTH}-element safety limit.`);
        }
        stack.push(element.name);
      }
      continue;
    }

    const name = parseEndElement(token.value);
    const expected = stack.at(-1);
    if (!expected || expected !== name) {
      throw new Error(
        `XML closing element </${name}> does not match ${expected ? `<${expected}>` : "an open element"}.`,
      );
    }
    stack.pop();
    await writeEvent({ type: "endElement", name });
    if (!stack.length) rootClosed = true;
  }

  if (!rootSeen) throw new Error("XML does not contain a root element.");
  if (stack.length) {
    throw new Error(`XML ends before <${stack.at(-1)}> is closed.`);
  }
  await writeEvent({ type: "endDocument" });
  await writer.flush();
  runtime.metrics.inputBytes = runtime.file.size;
}

async function* readXmlTokens(runtime: XmlRuntime): AsyncGenerator<RawToken> {
  const reader = runtime.file.stream().getReader({ mode: "byob" });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let readBuffer = new Uint8Array(IO_CHUNK_BYTES);
  let buffer = "";
  let first = true;
  let cdata = false;

  const takeToken = (final: boolean): RawToken | null => {
    for (;;) {
      if (cdata) {
        const end = buffer.indexOf("]]>");
        if (end === 0) {
          buffer = buffer.slice(3);
          cdata = false;
          continue;
        }
        if (end > 0) {
          const length = safeCharacterCut(
            buffer,
            Math.min(end, MAX_XML_TOKEN_CHARS),
            end <= MAX_XML_TOKEN_CHARS,
          );
          const value = buffer.slice(0, length);
          buffer = buffer.slice(length);
          return { kind: "text", value, cdata: true };
        }
        if (end < 0 && buffer.length > MAX_XML_TOKEN_CHARS + 2) {
          const length = safeCharacterCut(
            buffer,
            MAX_XML_TOKEN_CHARS,
            false,
          );
          const value = buffer.slice(0, length);
          buffer = buffer.slice(length);
          return { kind: "text", value, cdata: true };
        }
        if (final) throw new Error("XML ends inside a CDATA section.");
        return null;
      }

      if (!buffer) return null;
      if (!buffer.startsWith("<")) {
        const markup = buffer.indexOf("<");
        const available = markup < 0 ? buffer.length : markup;
        if (markup < 0 && !final && available <= MAX_XML_TOKEN_CHARS + MAX_ENTITY_CHARS) {
          return null;
        }
        const desired = Math.min(available, MAX_XML_TOKEN_CHARS);
        const length = safeXmlTextCut(
          buffer.slice(0, available),
          desired,
          desired === available,
        );
        if (!length) {
          if (buffer.length > MAX_XML_TOKEN_CHARS + MAX_ENTITY_CHARS) {
            throw new Error("An XML entity exceeds the bounded token limit.");
          }
          return null;
        }
        const value = buffer.slice(0, length);
        buffer = buffer.slice(length);
        return { kind: "text", value, cdata: false };
      }

      if (buffer.startsWith("<![CDATA[")) {
        buffer = buffer.slice(9);
        cdata = true;
        continue;
      }
      if (buffer.startsWith("<!--")) {
        const end = buffer.indexOf("-->", 4);
        if (end < 0) {
          assertPendingToken(buffer, final, "comment");
          return null;
        }
        if (end + 3 > MAX_XML_TOKEN_CHARS) {
          throw new Error("An XML comment exceeds the 256 KiB safety limit.");
        }
        const value = buffer.slice(0, end + 3);
        buffer = buffer.slice(end + 3);
        return { kind: "comment", value };
      }
      if (buffer.startsWith("<?")) {
        const end = buffer.indexOf("?>", 2);
        if (end < 0) {
          assertPendingToken(buffer, final, "processing instruction");
          return null;
        }
        if (end + 2 > MAX_XML_TOKEN_CHARS) {
          throw new Error(
            "An XML processing instruction exceeds the 256 KiB safety limit.",
          );
        }
        const value = buffer.slice(0, end + 2);
        buffer = buffer.slice(end + 2);
        return { kind: "pi", value };
      }
      if (buffer.startsWith("<!")) {
        if (/^<!DOCTYPE\b/i.test(buffer)) {
          throw new Error("XML DTDs and custom or external entities are not supported.");
        }
        if (buffer.length < 10 && !final) return null;
        throw new Error("Unsupported XML declaration markup was encountered.");
      }

      const end = findTagEnd(buffer);
      if (end < 0) {
        assertPendingToken(buffer, final, "element tag");
        return null;
      }
      if (end > MAX_XML_TOKEN_CHARS) {
        throw new Error("An XML element tag exceeds the 256 KiB safety limit.");
      }
      const value = buffer.slice(0, end);
      buffer = buffer.slice(end);
      return { kind: value.startsWith("</") ? "end" : "start", value };
    }
  };

  for (;;) {
    runtime.assertActive();
    const { done, value } = await reader.read(readBuffer);
    if (done) break;
    let text = decoder.decode(value, { stream: true });
    if (first) {
      text = text.replace(/^\uFEFF/, "");
      first = false;
    }
    buffer += text;
    runtime.metrics.inputBytes = Math.min(
      runtime.file.size,
      runtime.metrics.inputBytes + value.byteLength,
    );
    runtime.metrics.maxReadChunkBytes = Math.max(
      runtime.metrics.maxReadChunkBytes,
      value.byteLength,
    );
    readBuffer =
      value.buffer.byteLength === IO_CHUNK_BYTES
        ? new Uint8Array(value.buffer)
        : new Uint8Array(IO_CHUNK_BYTES);
    runtime.progress("Parsing XML");
    for (;;) {
      const token = takeToken(false);
      if (!token) break;
      yield token;
    }
  }

  buffer += decoder.decode();
  for (;;) {
    const token = takeToken(true);
    if (!token) break;
    yield token;
  }
  if (buffer || cdata) throw new Error("XML input ends inside markup.");
}

function parseStartElement(value: string): {
  name: string;
  attributes: Array<{ name: string; value: string }>;
  selfClosing: boolean;
} {
  if (!value.endsWith(">") || value.startsWith("</")) {
    throw new Error("XML contains an invalid start element.");
  }
  let inner = value.slice(1, -1);
  const selfClosing = /\/\s*$/.test(inner);
  if (selfClosing) inner = inner.replace(/\/\s*$/, "");
  const nameMatch = inner.match(XML_NAME);
  if (!nameMatch) throw new Error("XML contains an invalid element name.");
  const name = nameMatch[0];
  let index = name.length;
  if (index < inner.length && !isXmlSpace(inner[index])) {
    throw new Error(`XML element <${name}> has malformed attributes.`);
  }

  const attributes: Array<{ name: string; value: string }> = [];
  const names = new Set<string>();
  while (index < inner.length) {
    while (index < inner.length && isXmlSpace(inner[index])) index += 1;
    if (index === inner.length) break;
    const attributeMatch = inner.slice(index).match(XML_NAME);
    if (!attributeMatch) {
      throw new Error(`XML element <${name}> has an invalid attribute name.`);
    }
    const attributeName = attributeMatch[0];
    index += attributeName.length;
    while (index < inner.length && isXmlSpace(inner[index])) index += 1;
    if (inner[index] !== "=") {
      throw new Error(`XML attribute ${attributeName} is missing '='.`);
    }
    index += 1;
    while (index < inner.length && isXmlSpace(inner[index])) index += 1;
    const quote = inner[index];
    if (quote !== '"' && quote !== "'") {
      throw new Error(`XML attribute ${attributeName} must be quoted.`);
    }
    const end = inner.indexOf(quote, index + 1);
    if (end < 0) throw new Error(`XML attribute ${attributeName} is not closed.`);
    const raw = inner.slice(index + 1, end);
    if (raw.includes("<")) {
      throw new Error(`XML attribute ${attributeName} contains '<'.`);
    }
    if (names.has(attributeName)) {
      throw new Error(`XML element <${name}> repeats attribute ${attributeName}.`);
    }
    names.add(attributeName);
    const decoded = decodeXmlEntities(
      normalizeXmlNewlines(raw),
      `XML attribute ${attributeName}`,
    );
    assertXmlCharacters(decoded, `XML attribute ${attributeName}`);
    attributes.push({ name: attributeName, value: decoded });
    if (attributes.length > MAX_XML_ATTRIBUTES) {
      throw new Error(
        `XML element <${name}> exceeds the ${MAX_XML_ATTRIBUTES}-attribute safety limit.`,
      );
    }
    index = end + 1;
    if (index < inner.length && !isXmlSpace(inner[index])) {
      throw new Error(`XML element <${name}> has malformed attributes.`);
    }
  }
  return { name, attributes, selfClosing };
}

function parseEndElement(value: string): string {
  const inner = value.slice(2, -1);
  const trimmed = inner.trim();
  if (!XML_NAME_ONLY.test(trimmed) || inner !== inner.trimStart()) {
    throw new Error("XML contains an invalid closing element.");
  }
  return trimmed;
}

function parseProcessingInstruction(value: string): {
  target: string;
  data: string;
} {
  const inner = value.slice(2, -2);
  const match = inner.match(XML_NAME);
  if (!match) throw new Error("XML contains an invalid processing instruction.");
  const target = match[0];
  if (inner.length > target.length && !isXmlSpace(inner[target.length])) {
    throw new Error("XML processing instruction target is malformed.");
  }
  return {
    target,
    data: normalizeXmlNewlines(
      inner.slice(target.length).replace(/^[ \t\r\n]+/, ""),
    ),
  };
}

function parseXmlDeclaration(data: string): {
  version: "1.0";
  encoding: "UTF-8" | null;
  standalone: "yes" | "no" | null;
} {
  const normalized = data.trim();
  const match = normalized.match(
    /^version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])UTF-8\2)?(?:\s+standalone\s*=\s*(["'])(yes|no)\3)?$/i,
  );
  if (!match) {
    throw new Error(
      "Only a UTF-8 XML 1.0 declaration with optional yes/no standalone is supported.",
    );
  }
  return {
    version: "1.0",
    encoding: /\bencoding\s*=/i.test(normalized) ? "UTF-8" : null,
    standalone: (match[4] as "yes" | "no" | undefined) ?? null,
  };
}

function decodeXmlEntities(value: string, context: string): string {
  let output = "";
  let index = 0;
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
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

function assertXmlCharacters(value: string, context: string): void {
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

function normalizeXmlNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function findTagEnd(value: string): number {
  let quote = "";
  for (let index = 1; index < value.length; index += 1) {
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

function safeXmlTextCut(
  value: string,
  desired: number,
  segmentComplete: boolean,
): number {
  let cut = safeCharacterCut(value, desired, segmentComplete);
  if (cut < value.length) {
    const ampersand = value.lastIndexOf("&", cut - 1);
    const semicolon = ampersand < 0 ? -1 : value.indexOf(";", ampersand + 1);
    if (ampersand >= 0 && (semicolon < 0 || semicolon >= cut)) cut = ampersand;
  }
  return cut;
}

function safeCharacterCut(
  value: string,
  desired: number,
  segmentComplete: boolean,
): number {
  let cut = Math.min(desired, value.length);
  if (cut > 0 && cut < value.length) {
    const last = value.charCodeAt(cut - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
  }
  if (!segmentComplete && cut > 0 && value[cut - 1] === "\r") cut -= 1;
  return cut;
}

function assertPendingToken(value: string, final: boolean, label: string): void {
  if (value.length > MAX_XML_TOKEN_CHARS) {
    throw new Error(`An XML ${label} exceeds the 256 KiB safety limit.`);
  }
  if (final) throw new Error(`XML ends inside a ${label}.`);
}

function isXmlSpace(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "\r" || character === "\n";
}

function createEventWriter(runtime: XmlRuntime) {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(IO_CHUNK_BYTES);
  let used = 0;
  const flush = async () => {
    if (!used) return;
    await runtime.write(buffer.slice(0, used), "Writing XML events");
    used = 0;
  };
  return {
    async write(value: string) {
      let remaining = value;
      while (remaining) {
        const result = encoder.encodeInto(remaining, buffer.subarray(used));
        used += result.written;
        remaining = remaining.slice(result.read);
        if (used === buffer.byteLength) await flush();
        if (result.read === 0 && result.written === 0) await flush();
      }
    },
    flush,
  };
}
