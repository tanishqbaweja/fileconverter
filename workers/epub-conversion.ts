import {
  openZipEntryStream,
  readZipDirectory,
  type ArchiveReadRuntime,
  type ZipEntry,
} from "./archive-conversion";
import {
  assertXmlCharacters,
  decodeXmlEntities,
  normalizeXmlNewlines,
  parseEndElement,
  parseStartElement,
  readMarkupTokens,
} from "./docx-conversion";

const IO_CHUNK_BYTES = 256 * 1024;
const MAX_PACKAGE_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_XML_DEPTH = 256;
const MAX_SPINE_ITEMS = 10_000;
const EPUB_MIMETYPE = "application/epub+zip";
const OPF_MEDIA_TYPE = "application/oebps-package+xml";
const XHTML_MEDIA_TYPE = "application/xhtml+xml";
const CONTAINER_NAMESPACE =
  "urn:oasis:names:tc:opendocument:xmlns:container";
const OPF_NAMESPACE = "http://www.idpf.org/2007/opf";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

interface EpubRuntime extends ArchiveReadRuntime {
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  warn(message: string): void;
}

interface ManifestItem {
  path: string;
  mediaType: string;
}

interface XmlStackEntry {
  name: string;
  local: string;
}

export async function runEpubToText(runtime: EpubRuntime): Promise<void> {
  runtime.warn(
    "EPUB text extraction follows the package spine and preserves visible chapter order, paragraphs, headings, lists, table-cell boundaries, and Unicode text.",
  );
  runtime.warn(
    "Cover art, images, audio, video, MathML, SVG, scripts, CSS, fonts, navigation controls, page layout, links, annotations, and non-linear resources are not represented in plain text.",
  );
  runtime.warn(
    "Only UTF-8 XML/XHTML and predefined XML entities plus nbsp, copy, and reg are accepted by this bounded profile.",
  );

  runtime.progress("Inspecting EPUB package");
  const entries = await readZipDirectory(runtime);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  if (byName.has("META-INF/encryption.xml")) {
    throw new Error("Encrypted or obfuscated EPUB resources are not accepted.");
  }
  await validateMimetype(runtime, requiredEntry(byName, "mimetype"));
  const packagePath = await readContainer(
    runtime,
    requiredEntry(byName, "META-INF/container.xml"),
  );
  const packageEntry = requiredEntry(byName, packagePath);
  if (packageEntry.uncompressedSize > MAX_PACKAGE_METADATA_BYTES) {
    throw new Error("EPUB package metadata exceeds the 2 MiB safety limit.");
  }
  const spine = await readPackageDocument(runtime, packageEntry, packagePath);
  const writer = createTextWriter(runtime);

  for (let index = 0; index < spine.length; index += 1) {
    const item = spine[index];
    const entry = requiredEntry(byName, item.path);
    runtime.progress(`Extracting EPUB chapter ${index + 1} of ${spine.length}`);
    if (index > 0) await writer.lineBreak();
    await extractXhtml(
      runtime,
      await openZipEntryStream(runtime, entry),
      writer,
      item.path,
    );
  }
  await writer.lineBreak();
  await writer.flush();
  runtime.metrics.inputBytes = runtime.file.size;
}

function requiredEntry(
  entries: ReadonlyMap<string, ZipEntry>,
  name: string,
): ZipEntry {
  const entry = entries.get(name);
  if (!entry || entry.directory) {
    throw new Error(`EPUB package is missing required file ${name}.`);
  }
  return entry;
}

async function validateMimetype(
  runtime: EpubRuntime,
  entry: ZipEntry,
): Promise<void> {
  if (
    entry.localHeaderOffset !== 0 ||
    entry.method !== 0 ||
    entry.uncompressedSize !== EPUB_MIMETYPE.length
  ) {
    throw new Error(
      "EPUB mimetype must be the first local ZIP entry, stored without compression.",
    );
  }
  const value = await readSmallEntry(runtime, entry, EPUB_MIMETYPE.length);
  if (value !== EPUB_MIMETYPE) {
    throw new Error("EPUB mimetype entry is invalid.");
  }
}

async function readContainer(
  runtime: EpubRuntime,
  entry: ZipEntry,
): Promise<string> {
  if (entry.uncompressedSize > MAX_PACKAGE_METADATA_BYTES) {
    throw new Error("EPUB container metadata exceeds the 2 MiB safety limit.");
  }
  const source = await openZipEntryStream(runtime, entry);
  const stack: XmlStackEntry[] = [];
  let rootSeen = false;
  let rootClosed = false;
  let packagePath: string | null = null;

  for await (const token of readMarkupTokens(source, runtime, "EPUB container")) {
    runtime.assertActive();
    if (token.kind === "text") {
      validateMetadataText(token.value, token.cdata, stack.length, "container");
      continue;
    }
    if (token.kind === "start") {
      if (rootClosed) throw new Error("EPUB container XML has multiple roots.");
      const element = parseStartElement(token.value, "EPUB container");
      const local = localName(element.name);
      if (!rootSeen) {
        if (
          local !== "container" ||
          !hasElementNamespace(element.name, element.attributes, CONTAINER_NAMESPACE)
        ) {
          throw new Error("EPUB container XML has no container root.");
        }
        rootSeen = true;
      }
      if (local === "rootfile" && stack.at(-1)?.local === "rootfiles") {
        const attributes = attributeMap(element.attributes);
        if (
          !packagePath &&
          attributes.get("media-type") === OPF_MEDIA_TYPE
        ) {
          const fullPath = attributes.get("full-path");
          if (fullPath) packagePath = resolvePackagePath("", fullPath);
        }
      }
      pushElement(stack, element.name, local, element.selfClosing, "container");
      if (element.selfClosing && stack.length === 0) rootClosed = true;
      continue;
    }
    closeElement(stack, parseEndElement(token.value, "EPUB container"), "container");
    if (!stack.length) rootClosed = true;
  }
  assertCompleteXml(stack, rootSeen, rootClosed, "container");
  if (!packagePath) {
    throw new Error("EPUB container does not identify an OPF package document.");
  }
  return packagePath;
}

async function readPackageDocument(
  runtime: EpubRuntime,
  entry: ZipEntry,
  packagePath: string,
): Promise<ManifestItem[]> {
  const source = await openZipEntryStream(runtime, entry);
  const stack: XmlStackEntry[] = [];
  const manifest = new Map<string, ManifestItem>();
  const spineIds: string[] = [];
  let rootSeen = false;
  let rootClosed = false;
  let nonLinearItems = 0;

  for await (const token of readMarkupTokens(source, runtime, "EPUB package")) {
    runtime.assertActive();
    if (token.kind === "text") {
      validateMetadataText(token.value, token.cdata, stack.length, "package");
      continue;
    }
    if (token.kind === "start") {
      if (rootClosed) throw new Error("EPUB package XML has multiple roots.");
      const element = parseStartElement(token.value, "EPUB package");
      const local = localName(element.name);
      if (!rootSeen) {
        if (
          local !== "package" ||
          !hasElementNamespace(element.name, element.attributes, OPF_NAMESPACE)
        ) {
          throw new Error("EPUB OPF does not contain a package root.");
        }
        rootSeen = true;
      }
      const parent = stack.at(-1)?.local;
      const attributes = attributeMap(element.attributes);
      if (local === "item" && parent === "manifest") {
        const id = attributes.get("id");
        const href = attributes.get("href");
        const mediaType = attributes.get("media-type");
        if (!id || !href || !mediaType) {
          throw new Error("EPUB manifest item lacks id, href, or media-type.");
        }
        if (manifest.has(id)) {
          throw new Error(`EPUB manifest contains duplicate id ${id}.`);
        }
        manifest.set(id, {
          path: resolvePackagePath(packagePath, href),
          mediaType,
        });
      } else if (local === "itemref" && parent === "spine") {
        const idref = attributes.get("idref");
        if (!idref) throw new Error("EPUB spine item lacks idref.");
        if (attributes.get("linear")?.toLowerCase() === "no") {
          nonLinearItems += 1;
        } else {
          spineIds.push(idref);
          if (spineIds.length > MAX_SPINE_ITEMS) {
            throw new Error(
              `EPUB spine exceeds the ${MAX_SPINE_ITEMS.toLocaleString("en-US")}-item safety limit.`,
            );
          }
        }
      }
      pushElement(stack, element.name, local, element.selfClosing, "package");
      if (element.selfClosing && stack.length === 0) rootClosed = true;
      continue;
    }
    closeElement(stack, parseEndElement(token.value, "EPUB package"), "package");
    if (!stack.length) rootClosed = true;
  }
  assertCompleteXml(stack, rootSeen, rootClosed, "package");
  if (!spineIds.length) throw new Error("EPUB package has no linear spine items.");
  if (nonLinearItems) {
    runtime.warn(
      `${nonLinearItems.toLocaleString("en-US")} non-linear EPUB spine ${nonLinearItems === 1 ? "item was" : "items were"} omitted from the plain-text reading order.`,
    );
  }
  return spineIds.map((idref) => {
    const item = manifest.get(idref);
    if (!item) throw new Error(`EPUB spine references missing manifest id ${idref}.`);
    if (item.mediaType !== XHTML_MEDIA_TYPE) {
      throw new Error(
        `EPUB spine item ${idref} uses unsupported media type ${item.mediaType}.`,
      );
    }
    return item;
  });
}

async function extractXhtml(
  runtime: EpubRuntime,
  source: ReadableStream<Uint8Array<ArrayBuffer>>,
  writer: ReturnType<typeof createTextWriter>,
  path: string,
): Promise<void> {
  const stack: XmlStackEntry[] = [];
  let rootSeen = false;
  let rootClosed = false;
  let bodySeen = false;
  let bodyDepth = 0;
  let hiddenDepth = 0;
  const hidden = new Set([
    "head",
    "script",
    "style",
    "template",
    "noscript",
    "svg",
    "math",
    "canvas",
  ]);
  const blocks = new Set([
    "address",
    "article",
    "aside",
    "blockquote",
    "div",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "main",
    "nav",
    "p",
    "pre",
    "section",
    "tr",
  ]);

  for await (const token of readMarkupTokens(source, runtime, "EPUB XHTML")) {
    runtime.assertActive();
    if (token.kind === "text") {
      const normalized = normalizeXmlNewlines(token.value);
      const value = token.cdata
        ? normalized
        : decodeEpubEntities(normalized, `EPUB XHTML text in ${path}`);
      assertXmlCharacters(value, `EPUB XHTML text in ${path}`);
      if (!stack.length && value.trim()) {
        throw new Error(`EPUB XHTML ${path} has text outside its root.`);
      }
      if (bodyDepth > 0 && hiddenDepth === 0) await writer.appendText(value);
      continue;
    }
    if (token.kind === "start") {
      if (rootClosed) throw new Error(`EPUB XHTML ${path} has multiple roots.`);
      const element = parseStartElement(token.value, "EPUB XHTML");
      const local = localName(element.name).toLowerCase();
      if (!rootSeen) {
        if (
          local !== "html" ||
          !hasElementNamespace(element.name, element.attributes, XHTML_NAMESPACE)
        ) {
          throw new Error(`EPUB spine file ${path} has no XHTML root.`);
        }
        rootSeen = true;
      }
      if (local === "body") {
        if (bodySeen || stack.at(-1)?.local !== "html") {
          throw new Error(`EPUB spine file ${path} has an invalid body element.`);
        }
        bodySeen = true;
        bodyDepth += 1;
      }
      if (hidden.has(local)) hiddenDepth += 1;
      if (bodyDepth > 0 && hiddenDepth === 0) {
        if (local === "br") await writer.lineBreak();
        else if (local === "li") {
          await writer.lineBreak();
          await writer.writeLiteral("- ");
        } else if (local === "td" || local === "th") {
          await writer.cellBoundary();
        } else if (blocks.has(local)) {
          await writer.lineBreak();
        }
      }
      if (element.selfClosing) {
        if (hidden.has(local)) hiddenDepth -= 1;
        if (local === "body") bodyDepth -= 1;
        if (!stack.length) rootClosed = true;
      } else {
        pushElement(stack, element.name, local, false, `XHTML ${path}`);
      }
      continue;
    }
    const name = parseEndElement(token.value, "EPUB XHTML");
    const opened = closeElement(stack, name, `XHTML ${path}`);
    if (bodyDepth > 0 && hiddenDepth === 0 && blocks.has(opened.local)) {
      await writer.lineBreak();
    }
    if (hidden.has(opened.local)) hiddenDepth -= 1;
    if (opened.local === "body") bodyDepth -= 1;
    if (!stack.length) rootClosed = true;
  }
  assertCompleteXml(stack, rootSeen, rootClosed, `XHTML ${path}`);
  if (!bodySeen || bodyDepth !== 0 || hiddenDepth !== 0) {
    throw new Error(`EPUB spine file ${path} has an incomplete body.`);
  }
}

function pushElement(
  stack: XmlStackEntry[],
  name: string,
  local: string,
  selfClosing: boolean,
  label: string,
): void {
  if (selfClosing) return;
  if (stack.length >= MAX_XML_DEPTH) {
    throw new Error(`${label} XML exceeds the ${MAX_XML_DEPTH}-element nesting limit.`);
  }
  stack.push({ name, local });
}

function closeElement(
  stack: XmlStackEntry[],
  name: string,
  label: string,
): XmlStackEntry {
  const opened = stack.pop();
  if (!opened || opened.name !== name) {
    throw new Error(
      `${label} XML closing element </${name}> does not match ${opened ? `<${opened.name}>` : "an open element"}.`,
    );
  }
  return opened;
}

function assertCompleteXml(
  stack: readonly XmlStackEntry[],
  rootSeen: boolean,
  rootClosed: boolean,
  label: string,
): void {
  if (!rootSeen || !rootClosed) throw new Error(`EPUB ${label} XML has no complete root.`);
  if (stack.length) {
    throw new Error(`EPUB ${label} XML ends before <${stack.at(-1)?.name}> closes.`);
  }
}

function validateMetadataText(
  value: string,
  cdata: boolean,
  depth: number,
  label: string,
): void {
  const normalized = normalizeXmlNewlines(value);
  const decoded = cdata
    ? normalized
    : decodeXmlEntities(normalized, `EPUB ${label} text`);
  assertXmlCharacters(decoded, `EPUB ${label} text`);
  if (!depth && decoded.trim()) {
    throw new Error(`EPUB ${label} XML has text outside its root.`);
  }
}

function attributeMap(
  attributes: readonly { name: string; value: string }[],
): ReadonlyMap<string, string> {
  const output = new Map<string, string>();
  for (const attribute of attributes) {
    const local = localName(attribute.name);
    if (output.has(local)) {
      throw new Error(`EPUB XML contains ambiguous attribute ${local}.`);
    }
    output.set(local, attribute.value);
  }
  return output;
}

function hasElementNamespace(
  name: string,
  attributes: readonly { name: string; value: string }[],
  expected: string,
): boolean {
  const separator = name.indexOf(":");
  const namespaceAttribute =
    separator < 0 ? "xmlns" : `xmlns:${name.slice(0, separator)}`;
  return attributes.some(
    (attribute) =>
      attribute.name === namespaceAttribute && attribute.value === expected,
  );
}

function localName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1);
}

function resolvePackagePath(baseFile: string, reference: string): string {
  if (
    !reference ||
    reference.includes("\\") ||
    reference.startsWith("/") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference) ||
    /[\u0000-\u001f\u007f]/.test(reference)
  ) {
    throw new Error(`Unsafe EPUB package reference: ${reference || "(empty)"}.`);
  }
  const withoutFragment = reference.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) {
    throw new Error(`Unsafe EPUB package reference: ${reference}.`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    throw new Error(`EPUB package reference has invalid percent encoding: ${reference}.`);
  }
  if (
    decoded.includes("\\") ||
    decoded.startsWith("/") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded) ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    throw new Error(`Unsafe EPUB package reference: ${reference}.`);
  }
  if (decoded.split("/").some((part) => part === "")) {
    throw new Error(`Unsafe EPUB package reference: ${reference}.`);
  }
  const output = baseFile.includes("/")
    ? baseFile.slice(0, baseFile.lastIndexOf("/")).split("/")
    : [];
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!output.length) {
        throw new Error(`Unsafe EPUB package reference escapes its root: ${reference}.`);
      }
      output.pop();
      continue;
    }
    if (part.includes("\0") || /[\u0000-\u001f\u007f]/.test(part)) {
      throw new Error(`Unsafe EPUB package reference: ${reference}.`);
    }
    output.push(part);
  }
  if (!output.length) throw new Error(`Unsafe EPUB package reference: ${reference}.`);
  return output.join("/");
}

function decodeEpubEntities(value: string, context: string): string {
  const normalized = value.replace(
    /&(nbsp|copy|reg);/g,
    (_entity, name: string) =>
      ({ nbsp: "&#160;", copy: "&#169;", reg: "&#174;" })[name] ?? "",
  );
  return decodeXmlEntities(normalized, context);
}

async function readSmallEntry(
  runtime: EpubRuntime,
  entry: ZipEntry,
  maximumBytes: number,
): Promise<string> {
  if (entry.uncompressedSize > maximumBytes) {
    throw new Error(`EPUB ${entry.name} exceeds its ${maximumBytes}-byte safety limit.`);
  }
  const reader = (await openZipEntryStream(runtime, entry)).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let output = "";
  for (;;) {
    runtime.assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
    if (output.length > maximumBytes) {
      throw new Error(`EPUB ${entry.name} exceeds its bounded size.`);
    }
  }
  return `${output}${decoder.decode()}`.replace(/^\uFEFF/, "");
}

function createTextWriter(runtime: EpubRuntime) {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(IO_CHUNK_BYTES);
  let used = 0;
  let lineStart = true;
  let pendingSpace = false;
  const flush = async () => {
    if (!used) return;
    await runtime.write(buffer.slice(0, used), "Writing EPUB text");
    used = 0;
  };
  const write = async (value: string) => {
    let remaining = value;
    while (remaining) {
      const result = encoder.encodeInto(remaining, buffer.subarray(used));
      used += result.written;
      remaining = remaining.slice(result.read);
      if (used === buffer.byteLength) await flush();
      if (result.read === 0 && result.written === 0) await flush();
    }
  };
  const lineBreak = async () => {
    if (!lineStart) await write("\n");
    lineStart = true;
    pendingSpace = false;
  };
  return {
    async appendText(value: string) {
      const leadingSpace = /^\s/.test(value);
      const trailingSpace = /\s$/.test(value);
      const normalized = value.replace(/\s+/g, " ").trim();
      if (!normalized) {
        if (!lineStart) pendingSpace = true;
        return;
      }
      if ((pendingSpace || leadingSpace) && !lineStart) await write(" ");
      await write(normalized);
      lineStart = false;
      pendingSpace = trailingSpace;
    },
    async writeLiteral(value: string) {
      await write(value);
      lineStart = false;
      pendingSpace = false;
    },
    async cellBoundary() {
      if (!lineStart) await write("\t");
      pendingSpace = false;
    },
    lineBreak,
    flush,
  };
}
