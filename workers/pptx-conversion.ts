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
  type ParsedStartElement,
} from "./docx-conversion";

const IO_CHUNK_BYTES = 256 * 1024;
const MAX_PACKAGE_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_XML_DEPTH = 256;
const MAX_SLIDES = 10_000;
const CONTENT_TYPES_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const PACKAGE_RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const PRESENTATION_NAMESPACE =
  "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWING_NAMESPACE =
  "http://schemas.openxmlformats.org/drawingml/2006/main";
const OFFICE_RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const SLIDE_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const PRESENTATION_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";

interface PptxRuntime extends ArchiveReadRuntime {
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  warn(message: string): void;
}

interface XmlStackEntry {
  name: string;
  local: string;
}

interface SlideReference {
  relationshipId: string;
  hidden: boolean;
}

interface PackageRelationship {
  target: string;
  type: string;
}

export async function runPptxToText(runtime: PptxRuntime): Promise<void> {
  runtime.warn(
    "PPTX-to-TXT follows declared slide order and preserves DrawingML text-run order, paragraphs, tabs, line breaks, Unicode text, and hidden-slide text.",
  );
  runtime.warn(
    "Themes, fonts, styling, positions, layouts, transitions, animations, charts, diagrams, equations, images, media, hyperlinks, comments, speaker notes, masters, and embedded objects are not represented in plain text.",
  );

  runtime.progress("Inspecting PPTX package");
  const entries = await readZipDirectory(runtime);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  if ([...byName.keys()].some((name) => name.toLowerCase() === "ppt/vbaproject.bin")) {
    throw new Error("Macro-enabled presentation packages are not accepted.");
  }
  await validateContentTypes(runtime, requiredEntry(byName, "[Content_Types].xml"));
  const presentationPath = await readRootRelationships(
    runtime,
    requiredEntry(byName, "_rels/.rels"),
  );
  const slideReferences = await readPresentation(
    runtime,
    requiredEntry(byName, presentationPath),
  );
  const relationships = await readPresentationRelationships(
    runtime,
    requiredEntry(byName, relationshipPartPath(presentationPath)),
    presentationPath,
  );
  const hiddenSlides = slideReferences.filter((slide) => slide.hidden).length;
  if (hiddenSlides > 0) {
    runtime.warn(
      `${hiddenSlides.toLocaleString("en-US")} hidden PPTX ${hiddenSlides === 1 ? "slide is" : "slides are"} included in the text export in declared presentation order.`,
    );
  }

  const writer = createTextWriter(runtime);
  for (let index = 0; index < slideReferences.length; index += 1) {
    runtime.assertActive();
    const reference = slideReferences[index];
    const relationship = relationships.get(reference.relationshipId);
    if (!relationship || relationship.type !== SLIDE_RELATIONSHIP) {
      throw new Error(
        `PPTX slide ${index + 1} has no valid slide relationship.`,
      );
    }
    runtime.progress(
      `Extracting PPTX slide ${(index + 1).toLocaleString("en-US")} of ${slideReferences.length.toLocaleString("en-US")}`,
    );
    await extractSlide(
      runtime,
      requiredEntry(byName, relationship.target),
      writer,
    );
    if (index + 1 < slideReferences.length) await writer.write("\n");
  }
  await writer.flush();
  runtime.metrics.inputBytes = runtime.file.size;
}

function requiredEntry(
  entries: ReadonlyMap<string, ZipEntry>,
  name: string,
): ZipEntry {
  const entry = entries.get(name);
  if (!entry || entry.directory) {
    throw new Error(`PPTX package is missing required part ${name}.`);
  }
  return entry;
}

async function validateContentTypes(
  runtime: PptxRuntime,
  entry: ZipEntry,
): Promise<void> {
  let valid = false;
  await parseMetadataXml(runtime, entry, "content types", (element, _parent, root) => {
    const local = localName(element.name);
    if (root && (
      local !== "Types" ||
      !hasElementNamespace(element.name, element.attributes, CONTENT_TYPES_NAMESPACE)
    )) {
      throw new Error("PPTX content types have an invalid package root.");
    }
    if (local !== "Override") return;
    const attributes = attributeMap(element.attributes);
    if (
      attributes.get("PartName") === "/ppt/presentation.xml" &&
      attributes.get("ContentType") === PRESENTATION_CONTENT_TYPE
    ) {
      valid = true;
    }
  });
  if (!valid) {
    throw new Error(
      "PPTX content types do not identify ppt/presentation.xml as a standard presentation.",
    );
  }
}

async function readRootRelationships(
  runtime: PptxRuntime,
  entry: ZipEntry,
): Promise<string> {
  let presentationPath: string | null = null;
  await parseMetadataXml(runtime, entry, "root relationships", (element, _parent, root) => {
    const local = localName(element.name);
    if (root && (
      local !== "Relationships" ||
      !hasElementNamespace(
        element.name,
        element.attributes,
        PACKAGE_RELATIONSHIP_NAMESPACE,
      )
    )) {
      throw new Error("PPTX root relationships have an invalid package root.");
    }
    if (local !== "Relationship") return;
    const attributes = attributeMap(element.attributes);
    if (attributes.get("Type") !== OFFICE_DOCUMENT_RELATIONSHIP) return;
    if (attributes.get("TargetMode")?.toLowerCase() === "external") {
      throw new Error("PPTX presentation relationship cannot be external.");
    }
    const target = attributes.get("Target");
    if (!target) throw new Error("PPTX presentation relationship has no target.");
    const resolved = resolveOpcPath("", target);
    if (presentationPath && presentationPath !== resolved) {
      throw new Error("PPTX package has multiple presentation relationships.");
    }
    presentationPath = resolved;
  });
  if (presentationPath !== "ppt/presentation.xml") {
    throw new Error("PPTX root relationships do not target ppt/presentation.xml.");
  }
  return presentationPath;
}

async function readPresentation(
  runtime: PptxRuntime,
  entry: ZipEntry,
): Promise<SlideReference[]> {
  const slides: SlideReference[] = [];
  const relationshipIds = new Set<string>();
  let relationshipPrefix: string | null = null;
  await parseMetadataXml(
    runtime,
    entry,
    "presentation",
    (element, parent, root) => {
      const local = localName(element.name);
      if (root) {
        if (
          local !== "presentation" ||
          !hasElementNamespace(
            element.name,
            element.attributes,
            PRESENTATION_NAMESPACE,
          )
        ) {
          throw new Error("PPTX presentation has no PresentationML root.");
        }
        const relationshipNamespace = element.attributes.find(
          (attribute) => attribute.value === OFFICE_RELATIONSHIP_NAMESPACE,
        );
        if (!relationshipNamespace?.name.startsWith("xmlns:")) {
          throw new Error("PPTX presentation lacks its relationship namespace.");
        }
        relationshipPrefix = relationshipNamespace.name.slice(6);
      }
      if (local !== "sldId" || parent !== "sldIdLst") return;
      const attributes = new Map(
        element.attributes.map((attribute) => [attribute.name, attribute.value]),
      );
      const relationshipId = relationshipPrefix
        ? attributes.get(`${relationshipPrefix}:id`)
        : null;
      if (!relationshipId) {
        throw new Error("PPTX slide declaration lacks a relationship id.");
      }
      if (relationshipIds.has(relationshipId)) {
        throw new Error(`PPTX presentation duplicates slide relationship ${relationshipId}.`);
      }
      relationshipIds.add(relationshipId);
      const show = attributes.get("show") ?? "1";
      if (!["0", "1", "false", "true"].includes(show)) {
        throw new Error("PPTX slide declaration has an invalid visibility value.");
      }
      slides.push({
        relationshipId,
        hidden: show === "0" || show === "false",
      });
      if (slides.length > MAX_SLIDES) {
        throw new Error("PPTX presentation exceeds the 10,000-slide safety limit.");
      }
    },
  );
  if (!slides.length) throw new Error("PPTX presentation declares no slides.");
  return slides;
}

async function readPresentationRelationships(
  runtime: PptxRuntime,
  entry: ZipEntry,
  presentationPath: string,
): Promise<Map<string, PackageRelationship>> {
  const relationships = new Map<string, PackageRelationship>();
  const seenIds = new Set<string>();
  await parseMetadataXml(
    runtime,
    entry,
    "presentation relationships",
    (element, _parent, root) => {
      const local = localName(element.name);
      if (root && (
        local !== "Relationships" ||
        !hasElementNamespace(
          element.name,
          element.attributes,
          PACKAGE_RELATIONSHIP_NAMESPACE,
        )
      )) {
        throw new Error("PPTX presentation relationships have an invalid root.");
      }
      if (local !== "Relationship") return;
      const attributes = attributeMap(element.attributes);
      const id = attributes.get("Id");
      const type = attributes.get("Type");
      const target = attributes.get("Target");
      if (!id || !type || !target) {
        throw new Error("PPTX presentation relationship is incomplete.");
      }
      if (seenIds.has(id)) {
        throw new Error(`PPTX presentation relationships duplicate id ${id}.`);
      }
      seenIds.add(id);
      if (attributes.get("TargetMode")?.toLowerCase() === "external") return;
      relationships.set(id, {
        type,
        target: resolveOpcPath(presentationPath, target),
      });
    },
  );
  return relationships;
}

async function extractSlide(
  runtime: PptxRuntime,
  entry: ZipEntry,
  writer: ReturnType<typeof createTextWriter>,
): Promise<void> {
  const source = await openZipEntryStream(runtime, entry);
  const stack: XmlStackEntry[] = [];
  let rootSeen = false;
  let rootClosed = false;
  let drawingPrefix: string | null = null;
  let textDepth = 0;
  let paragraphDepth = 0;

  for await (const token of readMarkupTokens(source, runtime, "PPTX slide")) {
    runtime.assertActive();
    if (token.kind === "text") {
      const value = decodeTokenText(token.value, token.cdata, "PPTX slide text");
      if (!stack.length && value.trim()) {
        throw new Error("PPTX slide contains text outside its root.");
      }
      if (textDepth > 0) await writer.write(value);
      continue;
    }
    if (token.kind === "start") {
      if (rootClosed) throw new Error("PPTX slide has multiple XML roots.");
      const element = parseStartElement(token.value, "PPTX slide");
      if (!rootSeen) {
        if (
          localName(element.name) !== "sld" ||
          !hasElementNamespace(
            element.name,
            element.attributes,
            PRESENTATION_NAMESPACE,
          )
        ) {
          throw new Error("PPTX slide has no PresentationML slide root.");
        }
        const drawingNamespace = element.attributes.find(
          (attribute) => attribute.value === DRAWING_NAMESPACE,
        );
        if (!drawingNamespace?.name.startsWith("xmlns:")) {
          throw new Error("PPTX slide lacks its DrawingML namespace.");
        }
        drawingPrefix = drawingNamespace.name.slice(6);
        rootSeen = true;
      }
      const drawingName = drawingPrefix
        ? element.name === `${drawingPrefix}:${localName(element.name)}`
        : false;
      const local = localName(element.name);
      if (drawingName && local === "p") {
        if (paragraphDepth !== 0) {
          throw new Error("PPTX slide contains nested DrawingML paragraphs.");
        }
        paragraphDepth = 1;
      }
      if (drawingName && local === "t") textDepth += 1;
      if (drawingName && local === "br" && paragraphDepth > 0) {
        await writer.write("\n");
      }
      if (drawingName && local === "tab" && paragraphDepth > 0) {
        await writer.write("\t");
      }
      if (element.selfClosing) {
        if (drawingName && local === "t") textDepth -= 1;
        if (drawingName && local === "p") {
          await writer.write("\n");
          paragraphDepth = 0;
        }
        if (!stack.length) rootClosed = true;
      } else {
        pushElement(stack, element.name, local, "slide");
      }
      continue;
    }
    const opened = closeElement(
      stack,
      parseEndElement(token.value, "PPTX slide"),
      "slide",
    );
    const drawingName = drawingPrefix
      ? opened.name === `${drawingPrefix}:${opened.local}`
      : false;
    if (drawingName && opened.local === "t") textDepth -= 1;
    if (drawingName && opened.local === "p") {
      if (paragraphDepth !== 1) {
        throw new Error("PPTX slide paragraph state is invalid.");
      }
      await writer.write("\n");
      paragraphDepth = 0;
    }
    if (!stack.length) rootClosed = true;
  }
  assertCompleteXml(stack, rootSeen, rootClosed, "slide");
  if (textDepth !== 0 || paragraphDepth !== 0) {
    throw new Error("PPTX slide XML state is incomplete.");
  }
}

async function parseMetadataXml(
  runtime: PptxRuntime,
  entry: ZipEntry,
  label: string,
  onStart: (
    element: ParsedStartElement,
    parentLocal: string | null,
    root: boolean,
  ) => void,
): Promise<void> {
  if (entry.uncompressedSize > MAX_PACKAGE_METADATA_BYTES) {
    throw new Error(`PPTX ${label} exceed the 2 MiB metadata safety limit.`);
  }
  const source = await openZipEntryStream(runtime, entry);
  const stack: XmlStackEntry[] = [];
  let rootSeen = false;
  let rootClosed = false;
  for await (const token of readMarkupTokens(source, runtime, `PPTX ${label}`)) {
    runtime.assertActive();
    if (token.kind === "text") {
      const value = decodeTokenText(token.value, token.cdata, `PPTX ${label} text`);
      if (!stack.length && value.trim()) {
        throw new Error(`PPTX ${label} contain text outside the root.`);
      }
      continue;
    }
    if (token.kind === "start") {
      if (rootClosed) throw new Error(`PPTX ${label} contain multiple roots.`);
      const element = parseStartElement(token.value, `PPTX ${label}`);
      const root = !rootSeen;
      if (root) rootSeen = true;
      onStart(element, stack.at(-1)?.local ?? null, root);
      if (element.selfClosing) {
        if (!stack.length) rootClosed = true;
      } else {
        pushElement(stack, element.name, localName(element.name), label);
      }
      continue;
    }
    closeElement(
      stack,
      parseEndElement(token.value, `PPTX ${label}`),
      label,
    );
    if (!stack.length) rootClosed = true;
  }
  assertCompleteXml(stack, rootSeen, rootClosed, label);
}

function pushElement(
  stack: XmlStackEntry[],
  name: string,
  local: string,
  label: string,
): void {
  if (stack.length >= MAX_XML_DEPTH) {
    throw new Error(`PPTX ${label} exceed the ${MAX_XML_DEPTH}-element nesting limit.`);
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
      `PPTX ${label} closing element </${name}> does not match ${opened ? `<${opened.name}>` : "an open element"}.`,
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
  if (!rootSeen || !rootClosed) {
    throw new Error(`PPTX ${label} have no complete XML root.`);
  }
  if (stack.length) {
    throw new Error(`PPTX ${label} end before <${stack.at(-1)?.name}> closes.`);
  }
}

function decodeTokenText(value: string, cdata: boolean, context: string): string {
  const normalized = normalizeXmlNewlines(value);
  const decoded = cdata ? normalized : decodeXmlEntities(normalized, context);
  assertXmlCharacters(decoded, context);
  return decoded;
}

function attributeMap(
  attributes: readonly { name: string; value: string }[],
): ReadonlyMap<string, string> {
  const output = new Map<string, string>();
  for (const attribute of attributes) {
    const local = localName(attribute.name);
    if (output.has(local)) {
      throw new Error(`PPTX XML contains ambiguous attribute ${local}.`);
    }
    output.set(local, attribute.value);
  }
  return output;
}

function localName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1);
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

function relationshipPartPath(sourcePath: string): string {
  const separator = sourcePath.lastIndexOf("/");
  const directory = separator < 0 ? "" : sourcePath.slice(0, separator + 1);
  const filename = sourcePath.slice(separator + 1);
  return `${directory}_rels/${filename}.rels`;
}

function resolveOpcPath(baseFile: string, reference: string): string {
  if (
    !reference ||
    reference.includes("\\") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference) ||
    /[\u0000-\u001f\u007f]/.test(reference)
  ) {
    throw new Error(`Unsafe PPTX package reference: ${reference || "(empty)"}.`);
  }
  const withoutFragment = reference.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) {
    throw new Error(`Unsafe PPTX package reference: ${reference}.`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    throw new Error(`PPTX package reference has invalid percent encoding: ${reference}.`);
  }
  if (
    decoded.includes("\\") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded) ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    throw new Error(`Unsafe PPTX package reference: ${reference}.`);
  }
  const absolute = decoded.startsWith("/");
  const parts = (absolute ? decoded.slice(1) : decoded).split("/");
  if (parts.some((part) => part === "")) {
    throw new Error(`Unsafe PPTX package reference: ${reference}.`);
  }
  const output = absolute || !baseFile.includes("/")
    ? []
    : baseFile.slice(0, baseFile.lastIndexOf("/")).split("/");
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (!output.length) {
        throw new Error(`Unsafe PPTX package reference escapes its root: ${reference}.`);
      }
      output.pop();
    } else {
      output.push(part);
    }
  }
  if (!output.length) throw new Error(`Unsafe PPTX package reference: ${reference}.`);
  return output.join("/");
}

function createTextWriter(runtime: PptxRuntime) {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(IO_CHUNK_BYTES);
  let used = 0;
  const flush = async () => {
    if (!used) return;
    await runtime.write(buffer.slice(0, used), "Writing PPTX text");
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
  return { write, flush };
}
