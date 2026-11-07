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
const TEXT_BATCH_CHARS = 8 * 1024;
const TEXT_BATCH_FRAGMENTS = 16;
const MAX_PACKAGE_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_XML_DEPTH = 256;
const MAX_NAMESPACE_DECLARATIONS = 512;
const MAX_NAMESPACE_CHARS = 64 * 1024;
const MAX_SLIDES = 10_000;
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const NCNAME_START = /^[\p{L}_]/u;
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

interface ExpandedName {
  local: string;
  namespace: string;
}

interface XmlStackEntry extends ExpandedName {
  name: string;
  declarations?: Array<{ prefix: string; previous: string | undefined }>;
  namespaceChars: number;
  slideScope?: SlideScope;
}

interface XmlAttributes {
  get(local: string, namespace?: string): string | undefined;
}

interface XmlHandlers {
  start(
    element: XmlStackEntry,
    attributes: XmlAttributes,
    stack: readonly XmlStackEntry[],
  ): void | Promise<void>;
  text?(value: string, parent: XmlStackEntry | undefined): void | Promise<void>;
  end?(element: XmlStackEntry): void | Promise<void>;
}

const enum SlideScope {
  Ignored,
  Slide,
  CommonSlide,
  ShapeTree,
  Shape,
  GraphicFrame,
  Graphic,
  GraphicData,
  Table,
  Row,
  Cell,
  TextBody,
  Paragraph,
  Run,
  Text,
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
    "Themes, fonts, styling, positions, layouts, transitions, animations, charts, diagrams, equations, images, media, hyperlinks, comments, speaker notes, masters, embedded objects, and XML extension or compatibility branches are not represented in plain text.",
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
  const writer = createTextWriter(runtime);
  let hiddenSlides = 0;
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
    const hidden = await extractSlide(
      runtime,
      requiredEntry(byName, relationship.target),
      writer,
    );
    if (hidden || reference.hidden) hiddenSlides += 1;
    if (index + 1 < slideReferences.length) await writer.write("\n");
  }
  await writer.flush();
  if (hiddenSlides > 0) {
    runtime.warn(
      `${hiddenSlides.toLocaleString("en-US")} hidden PPTX ${hiddenSlides === 1 ? "slide is" : "slides are"} included in the text export in declared presentation order.`,
    );
  }
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
  await parseMetadataXml(runtime, entry, "content types", (element, attributes, stack) => {
    if (!stack.length && !isName(element, CONTENT_TYPES_NAMESPACE, "Types")) {
      throw new Error("PPTX content types have an invalid package root.");
    }
    if (stack.length !== 1 || !isName(element, CONTENT_TYPES_NAMESPACE, "Override")) return;
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
  await parseMetadataXml(runtime, entry, "root relationships", (element, attributes, stack) => {
    if (!stack.length && !isName(element, PACKAGE_RELATIONSHIP_NAMESPACE, "Relationships")) {
      throw new Error("PPTX root relationships have an invalid package root.");
    }
    if (stack.length !== 1 || !isName(element, PACKAGE_RELATIONSHIP_NAMESPACE, "Relationship")) return;
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
  await parseMetadataXml(
    runtime,
    entry,
    "presentation",
    (element, attributes, stack) => {
      if (!stack.length && !isName(element, PRESENTATION_NAMESPACE, "presentation")) {
        throw new Error("PPTX presentation has no PresentationML root.");
      }
      if (
        stack.length !== 2 ||
        !isName(stack[1], PRESENTATION_NAMESPACE, "sldIdLst") ||
        !isName(element, PRESENTATION_NAMESPACE, "sldId")
      ) return;
      const relationshipId = attributes.get("id", OFFICE_RELATIONSHIP_NAMESPACE);
      if (!relationshipId) {
        throw new Error("PPTX slide declaration lacks a relationship id.");
      }
      if (relationshipIds.has(relationshipId)) {
        throw new Error(`PPTX presentation duplicates slide relationship ${relationshipId}.`);
      }
      relationshipIds.add(relationshipId);
      slides.push({
        relationshipId,
        // Compatibility with older packages that put the hint on the list entry.
        hidden: isHidden(attributes.get("show"), "slide declaration"),
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
    (element, attributes, stack) => {
      if (!stack.length && !isName(element, PACKAGE_RELATIONSHIP_NAMESPACE, "Relationships")) {
        throw new Error("PPTX presentation relationships have an invalid root.");
      }
      if (stack.length !== 1 || !isName(element, PACKAGE_RELATIONSHIP_NAMESPACE, "Relationship")) return;
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
): Promise<boolean> {
  let hidden = false;
  await parseXml(runtime, entry, "slide", {
    start(element, attributes, stack) {
      const parent = stack.at(-1);
      if (!parent) {
        if (!isName(element, PRESENTATION_NAMESPACE, "sld")) {
          throw new Error("PPTX slide has no PresentationML slide root.");
        }
        element.slideScope = SlideScope.Slide;
        hidden = isHidden(attributes.get("show"), "slide");
        return;
      }
      element.slideScope = getSlideScope(element, parent.slideScope);
      if (parent.slideScope !== SlideScope.Paragraph || element.namespace !== DRAWING_NAMESPACE) return;
      if (element.local === "br") return writer.write("\n");
      if (element.local === "tab") return writer.write("\t");
    },
    text(value, parent) {
      if (parent?.slideScope === SlideScope.Text && value) return writer.write(value);
    },
    end(element) {
      if (element.slideScope === SlideScope.Paragraph) return writer.write("\n");
    },
  });
  return hidden;
}

// Follow the shape tree and table hierarchy, not all text-looking descendants.
// Unknown elements (including compatibility and extension branches) cannot
// regain a supported scope just by containing a DrawingML element.
function getSlideScope(element: ExpandedName, parent: SlideScope | undefined): SlideScope {
  const { namespace, local } = element;
  if (namespace === PRESENTATION_NAMESPACE) {
    switch (parent) {
      case SlideScope.Slide:
        if (local === "cSld") return SlideScope.CommonSlide;
        break;
      case SlideScope.CommonSlide:
        if (local === "spTree") return SlideScope.ShapeTree;
        break;
      case SlideScope.ShapeTree:
        if (local === "grpSp") return SlideScope.ShapeTree;
        if (local === "sp") return SlideScope.Shape;
        if (local === "graphicFrame") return SlideScope.GraphicFrame;
        break;
      case SlideScope.Shape:
        if (local === "txBody") return SlideScope.TextBody;
        break;
    }
  } else if (namespace === DRAWING_NAMESPACE) {
    switch (parent) {
      case SlideScope.GraphicFrame:
        if (local === "graphic") return SlideScope.Graphic;
        break;
      case SlideScope.Graphic:
        if (local === "graphicData") return SlideScope.GraphicData;
        break;
      case SlideScope.GraphicData:
        if (local === "tbl") return SlideScope.Table;
        break;
      case SlideScope.Table:
        if (local === "tr") return SlideScope.Row;
        break;
      case SlideScope.Row:
        if (local === "tc") return SlideScope.Cell;
        break;
      case SlideScope.Cell:
        if (local === "txBody") return SlideScope.TextBody;
        break;
      case SlideScope.TextBody:
        if (local === "p") return SlideScope.Paragraph;
        break;
      case SlideScope.Paragraph:
        if (local === "r" || local === "fld") return SlideScope.Run;
        if (local === "p") throw new Error("PPTX slide contains nested DrawingML paragraphs.");
        break;
      case SlideScope.Run:
        if (local === "t") return SlideScope.Text;
        break;
    }
  }
  return SlideScope.Ignored;
}

function isHidden(value: string | undefined, label: string): boolean {
  if (value === undefined || value === "1" || value === "true") return false;
  if (value === "0" || value === "false") return true;
  throw new Error(`PPTX ${label} has an invalid visibility value.`);
}

async function parseMetadataXml(
  runtime: PptxRuntime,
  entry: ZipEntry,
  label: string,
  start: XmlHandlers["start"],
): Promise<void> {
  if (entry.uncompressedSize > MAX_PACKAGE_METADATA_BYTES) {
    throw new Error(`PPTX ${label} exceed the 2 MiB metadata safety limit.`);
  }
  await parseXml(runtime, entry, label, { start });
}

const EMPTY_ATTRIBUTES: XmlAttributes = { get: () => undefined };

async function parseXml(
  runtime: PptxRuntime,
  entry: ZipEntry,
  label: string,
  handlers: XmlHandlers,
): Promise<void> {
  const context = `PPTX ${label}`;
  const textContext = `${context} text`;
  const source = await openZipEntryStream(runtime, entry);
  const stack: XmlStackEntry[] = [];
  const frames: XmlStackEntry[] = [];
  // Cache only short, attribute-free lexical tokens; namespace resolution must
  // still run on every start because the same prefix can be rebound.
  const bareTags = new Map<string, { parsed: ReturnType<typeof parseStartElement>; separator: number }>();
  const bindings = new Map<string, string>([["xml", XML_NAMESPACE]]);
  let activeDeclarations = 0;
  let activeNamespaceChars = 0;
  let rootClosed = false;

  function close(element: XmlStackEntry): void | Promise<void> {
    if (element.declarations) {
      for (const { prefix, previous } of element.declarations) {
        if (previous === undefined) bindings.delete(prefix);
        else bindings.set(prefix, previous);
      }
      activeDeclarations -= element.declarations.length;
      activeNamespaceChars -= element.namespaceChars;
    }
    if (!stack.length) rootClosed = true;
    const pending = handlers.end?.(element);
    // Frames are reused only after the handler has synchronously consumed their
    // metadata. Do not retain a large namespace after leaving its scope.
    element.name = element.local = element.namespace = "";
    element.declarations = undefined;
    element.slideScope = undefined;
    return pending;
  }

  for await (const token of readMarkupTokens(source, runtime, context)) {
    runtime.assertActive();
    if (token.kind === "text") {
      const normalized = normalizeXmlNewlines(token.value);
      const value = token.cdata ? normalized : decodeXmlEntities(normalized, textContext);
      assertXmlCharacters(value, textContext);
      if (!stack.length && (token.cdata || /[^ \t\n\r]/.test(value))) {
        throw new Error(`${context} contains text outside its root.`);
      }
      const pending = handlers.text?.(value, stack.at(-1));
      if (pending) await pending;
    } else if (token.kind === "start") {
      if (rootClosed) throw new Error(`${context} contains multiple roots.`);
      if (stack.length >= MAX_XML_DEPTH) {
        throw new Error(`${context} exceeds the ${MAX_XML_DEPTH}-element nesting limit.`);
      }
      const cacheable = token.value.length <= 96;
      const cached = cacheable ? bareTags.get(token.value) : undefined;
      const parsed = cached?.parsed ?? parseStartElement(token.value, context);
      const separator = cached?.separator ?? splitName(parsed.name, context);
      if (!cached && cacheable && !parsed.attributes.length && bareTags.size < 64) {
        // Do not keep tokenizer buffer slices alive for a full slide.
        bareTags.set(Array.from(token.value).join(""), {
          parsed: { ...parsed, name: Array.from(parsed.name).join("") }, separator,
        });
      }
      let declarations: XmlStackEntry["declarations"];
      let namespaceChars = 0;
      for (const { name, value } of parsed.attributes) {
        if (name !== "xmlns" && !name.startsWith("xmlns:")) continue;
        const prefix = name === "xmlns" ? "" : name.slice(splitName(name, context) + 1);
        if (
          prefix === "xmlns" || value === XMLNS_NAMESPACE ||
          (prefix === "xml") !== (value === XML_NAMESPACE)
        ) {
          throw new Error(`${context} has a reserved namespace binding.`);
        }
        if (prefix && !value) throw new Error(`${context} binds a prefix to an empty namespace.`);
        activeDeclarations += 1;
        namespaceChars += prefix.length + value.length;
        if (activeDeclarations > MAX_NAMESPACE_DECLARATIONS || activeNamespaceChars + namespaceChars > MAX_NAMESPACE_CHARS) {
          throw new Error(`${context} exceeds the namespace declaration safety limit.`);
        }
        (declarations ??= []).push({ prefix, previous: bindings.get(prefix) });
        bindings.set(prefix, value);
      }
      activeNamespaceChars += namespaceChars;
      const element = frames[stack.length] ??= { name: "", local: "", namespace: "", namespaceChars: 0 };
      element.name = parsed.name;
      element.local = separator < 0 ? parsed.name : parsed.name.slice(separator + 1);
      element.namespace = separator < 0
        ? bindings.get("") ?? ""
        : resolvePrefix(parsed.name.slice(0, separator), bindings, context);
      element.declarations = declarations;
      element.namespaceChars = namespaceChars;
      let attributes: Map<string, Map<string, string>> | undefined;
      for (const { name, value } of parsed.attributes) {
        if (name === "xmlns" || name.startsWith("xmlns:")) continue;
        const colon = splitName(name, context);
        // A default namespace applies to elements, not unprefixed attributes.
        const namespace = colon < 0 ? "" : resolvePrefix(name.slice(0, colon), bindings, context);
        const local = colon < 0 ? name : name.slice(colon + 1);
        attributes ??= new Map();
        let group = attributes.get(namespace);
        if (!group) attributes.set(namespace, group = new Map());
        if (group.has(local)) throw new Error(`${context} has a repeated expanded attribute.`);
        group.set(local, value);
      }
      const pending = handlers.start(element, attributes ? {
        get: (local, namespace = "") => attributes.get(namespace)?.get(local),
      } : EMPTY_ATTRIBUTES, stack);
      if (pending) await pending;
      if (parsed.selfClosing) {
        const closing = close(element);
        if (closing) await closing;
      } else {
        stack.push(element);
      }
    } else {
      const name = parseEndElement(token.value, context);
      const opened = stack.pop();
      if (!opened || opened.name !== name) {
        throw new Error(
          `${context} closing element </${name}> does not match ${opened ? `<${opened.name}>` : "an open element"}.`,
        );
      }
      const pending = close(opened);
      if (pending) await pending;
    }
  }
  if (!rootClosed) throw new Error(`${context} has no complete XML root.`);
}

function splitName(name: string, context: string): number {
  const separator = name.indexOf(":");
  // The shared XML tokenizer already checks name characters, but accepts colons.
  if (
    name.length > 1024 || separator === 0 ||
    (separator > 0 && (!NCNAME_START.test(name.slice(separator + 1)) || name.indexOf(":", separator + 1) >= 0))
  ) {
    throw new Error(`${context} has an invalid or oversized qualified name.`);
  }
  return separator;
}

function resolvePrefix(
  prefix: string,
  bindings: ReadonlyMap<string, string>,
  context: string,
): string {
  const uri = bindings.get(prefix);
  if (!uri) throw new Error(`${context} contains an undeclared namespace prefix.`);
  return uri;
}

function isName(
  element: ExpandedName,
  namespace: string,
  local: string,
): boolean {
  return element.namespace === namespace && element.local === local;
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
  let used = 0, batch = "", fragments = 0;
  const flushBytes = async () => {
    if (!used) return;
    await runtime.write(buffer.slice(0, used), "Writing PPTX text");
    used = 0;
  };
  const appendAndFlush = async (value: string) => {
    await flushBytes();
    let remaining = value;
    while (remaining.length) {
      const result = encoder.encodeInto(remaining, buffer.subarray(used));
      used += result.written;
      remaining = remaining.slice(result.read);
      if (used === buffer.byteLength || result.read === 0) await flushBytes();
    }
  };
  const encode = (value: string): void | Promise<void> => {
    const result = encoder.encodeInto(value, buffer.subarray(used));
    used += result.written;
    if (result.read < value.length || used === buffer.byteLength) {
      return appendAndFlush(value.slice(result.read));
    }
  };
  const write = (value: string): void | Promise<void> => {
    // Coalesce small runs/newlines before encodeInto to avoid allocating a new
    // buffer view per paragraph. Also bound the number of references to
    // tokenizer strings regardless of their individual lengths.
    if (fragments < TEXT_BATCH_FRAGMENTS && batch.length + value.length < TEXT_BATCH_CHARS) {
      batch += value;
      fragments += 1;
      return;
    }
    const pending = batch ? encode(batch + value) : encode(value);
    batch = "";
    fragments = 0;
    return pending;
  };
  const flush = async () => {
    const pending = batch ? encode(batch) : undefined;
    batch = "";
    fragments = 0;
    if (pending) await pending;
    await flushBytes();
  };
  return { write, flush };
}
