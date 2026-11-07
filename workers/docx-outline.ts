import { openZipEntryStream, type ZipEntry } from "./archive-conversion";
import { assertXmlCharacters, decodeXmlEntities, parseEndElement, parseStartElement, readMarkupTokens, type DocxRuntime } from "./docx-conversion";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML = "http://www.w3.org/XML/1998/namespace";
const STYLE_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const METADATA_BYTES = 1048576, MAX_STYLES = 1024, MAX_CHAIN = 64;
type Element = { name: string; local: string; uri: string; attributes: Map<string, string>; parent?: Element;
  namespaces: Map<string, string>; namespaceChars: number; depth: number };
export type DocxEmphasis = { bold: boolean; italic: boolean; underline: boolean; strike: boolean };
type Style = { type: string; base?: string; outline?: number; emphasis: Partial<DocxEmphasis> };
type Resolved = { outline: number | undefined; levels: number; toggleMask: number; underline?: boolean };
export type DocxOutlineModel = { definitionCount: number; outline(styleId?: string): number | undefined;
  emphasis(paragraphStyleId?: string, characterStyleId?: string, direct?: Partial<DocxEmphasis>): DocxEmphasis };

export function docxEmphasisKey(local: string | null): keyof DocxEmphasis | undefined {
  switch (local) { case "b": return "bold"; case "i": return "italic"; case "u": return "underline"; case "strike": return "strike"; }
}
export function parseDocxEmphasisValue(local: string, value: string | undefined): boolean {
  if (local === "u") {
    if (value !== undefined && !["none", "single", "words", "double", "thick", "dotted", "dottedHeavy", "dash", "dashedHeavy",
      "dashLong", "dashLongHeavy", "dotDash", "dashDotHeavy", "dotDotDash", "dashDotDotHeavy", "wave", "wavyHeavy", "wavyDouble"].includes(value))
      throw new Error("DOCX underline has an unsupported or invalid pattern.");
    return value !== "none";
  }
  if (value !== undefined && !["0", "1", "true", "false", "on", "off"].includes(value)) throw new Error("DOCX emphasis has an invalid on/off value.");
  return value === undefined || !["0", "false", "off"].includes(value);
}
const toggleMask = (value: Partial<DocxEmphasis>) => (value.bold ? 1 : 0) | (value.italic ? 2 : 0) | (value.strike ? 8 : 0);

export function parseDocxOutlineLevel(value: string | undefined): number {
  if (value === undefined || !/^\+?\d{1,3}$/.test(value) || Number(value) > 9)
    throw new Error("DOCX outline level must be an integer from0 through9.");
  return Number(value);
}
const attribute = (element: Element, name: string, uri = WORD) => element.attributes.get(uri + "\0" + name);
const word = (element: Element | undefined, name: string) => element?.uri === WORD && element.local === name;
const identifier = (value: string | undefined) => {
  if (!value || value.length > 256) throw new Error("DOCX style identifiers require1 through256 characters.");
  return value;
};

// Fixed-size optional metadata only. The main Word document remains streamed;
// no DOM, complete-file buffer, external fetch or cross-job style cache.
export async function readDocxOutlineModel(runtime: DocxRuntime, entries: ReadonlyMap<string, ZipEntry>): Promise<DocxOutlineModel> {
  const relationships = entries.get("word/_rels/document.xml.rels");
  let stylePart: string | undefined;
  if (relationships) for await (const element of metadataElements(runtime, relationships, RELS, "Relationships")) {
    if (element.uri !== RELS || element.local !== "Relationship" || element.depth !== 2 ||
      attribute(element, "Type", "") !== STYLE_RELATIONSHIP) continue;
    if (stylePart !== undefined) throw new Error("DOCX has ambiguous multiple styles relationships.");
    const target = attribute(element, "Target", "");
    if (attribute(element, "TargetMode", "") === "External" || !target || target.length > 2048 ||
        /[\\\u0000]/.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//"))
      throw new Error("DOCX styles must reference a bounded internal package part.");
    const resolved = new URL(target, "https://within.invalid/word/document.xml");
    if (resolved.origin !== "https://within.invalid" || resolved.search || resolved.hash)
      throw new Error("DOCX styles relationship is not an internal package part.");
    try { stylePart = decodeURIComponent(resolved.pathname).slice(1); }
    catch { throw new Error("DOCX styles relationship has invalid URI encoding."); }
    if (!stylePart || stylePart.split("/").some(part => !part || part === "." || part === "..") || /[\\\u0000]/.test(stylePart))
      throw new Error("DOCX styles relationship has an unsafe part path.");
  }
  const styles = new Map<string, Style>(), defaults: Partial<DocxEmphasis> = {};
  let defaultStyle: string | undefined, documentOutline: number | undefined;
  if (stylePart !== undefined) {
    const entry = entries.get(stylePart);
    if (!entry || entry.directory) throw new Error("DOCX referenced styles part is missing.");
    let current: { element: Element; value: Style } | undefined;
    for await (const element of metadataElements(runtime, entry, WORD, "styles")) {
      if (word(element, "style") && element.depth === 2) {
        if (styles.size >= MAX_STYLES) throw new Error("DOCX styles exceed the1024-definition safety limit.");
        const id = identifier(attribute(element, "styleId")), type = attribute(element, "type") ?? "paragraph";
        if (styles.has(id)) throw new Error("DOCX contains duplicate style identifiers.");
        const value: Style = { type, emphasis: {} }; styles.set(id, value); current = { element, value };
        const isDefault = attribute(element, "default");
        if (type === "paragraph" && ["1", "true", "on"].includes(isDefault ?? "")) {
          if (defaultStyle !== undefined) throw new Error("DOCX has ambiguous default paragraph styles.");
          defaultStyle = id;
        }
      } else if (current && element.parent === current.element && word(element, "basedOn")) {
        if (current.value.base !== undefined) throw new Error("DOCX style repeats its base reference.");
        current.value.base = identifier(attribute(element, "val"));
      } else if (word(element.parent, "rPr")) {
        const key = element.uri === WORD ? docxEmphasisKey(element.local) : undefined;
        let properties: Partial<DocxEmphasis> | undefined;
        if (current && element.parent?.parent === current.element && ["paragraph", "character"].includes(current.value.type)) properties = current.value.emphasis;
        else if (word(element.parent?.parent, "rPrDefault") && word(element.parent?.parent?.parent, "docDefaults") && element.parent?.parent?.parent?.depth === 2) properties = defaults;
        if (key && properties) {
          if (properties[key] !== undefined) throw new Error("DOCX style/defaults repeats a supported run property.");
          properties[key] = parseDocxEmphasisValue(element.local, attribute(element, "val"));
        }
      } else if (word(element, "outlineLvl") && word(element.parent, "pPr")) {
        if (current && element.parent?.parent === current.element) {
          if (current.value.outline !== undefined) throw new Error("DOCX style repeats its outline level.");
          current.value.outline = parseDocxOutlineLevel(attribute(element, "val"));
        } else if (word(element.parent?.parent, "pPrDefault") && word(element.parent?.parent?.parent, "docDefaults")) {
          if (documentOutline !== undefined) throw new Error("DOCX document defaults repeat their outline level.");
          documentOutline = parseDocxOutlineLevel(attribute(element, "val"));
        }
      }
    }
  }
  const resolved = new Map<string, Resolved>(), visiting = new Set<string>();
  const resolve = (id: string, depth = 0): Resolved | undefined => {
    runtime.assertActive();
    if (depth >= MAX_CHAIN || visiting.has(id)) throw new Error("DOCX style inheritance is cyclic or exceeds64 levels.");
    if (resolved.has(id)) return resolved.get(id)!;
    const style = styles.get(id); if (!style || !["paragraph", "character"].includes(style.type)) return undefined;
    visiting.add(id);
    const parent = style.base ? styles.get(style.base) : undefined;
    const inherited = parent?.type === style.type ? resolve(style.base!, depth + 1) : undefined;
    const levels = 1 + (inherited?.levels ?? 0);
    if (levels > MAX_CHAIN) throw new Error("DOCX style inheritance is cyclic or exceeds64 levels.");
    const value: Resolved = { outline: style.outline ?? inherited?.outline, levels,
      toggleMask: (inherited?.toggleMask ?? 0) ^ toggleMask(style.emphasis), underline: style.emphasis.underline ?? inherited?.underline };
    visiting.delete(id); resolved.set(id, value); return value;
  };
  for (const [id, style] of styles) if (["paragraph", "character"].includes(style.type)) resolve(id);
  let missingWarning = false, missingCharacterWarning = false;
  const paragraphStyle = (id?: string) => {
    if (id !== undefined && styles.get(id)?.type !== "paragraph") {
      if (!missingWarning) { runtime.warn("A referenced paragraph style is missing or has another type; default paragraph outline is used."); missingWarning = true; }
      id = undefined;
    }
    return resolved.get(id ?? defaultStyle ?? "");
  };
  return { definitionCount: styles.size, outline: id => paragraphStyle(id)?.outline ?? documentOutline,
    emphasis(paragraphId, characterId, direct = {}) {
      const paragraph = paragraphStyle(paragraphId);
      if (characterId !== undefined && styles.get(characterId)?.type !== "character") {
        if (!missingCharacterWarning) { runtime.warn("A referenced character style is missing or has another type; no character style is applied."); missingCharacterWarning = true; }
        characterId = undefined;
      }
      const character = characterId !== undefined ? resolved.get(characterId) : undefined;
      const mask = toggleMask(defaults) ^ (paragraph?.toggleMask ?? 0) ^ (character?.toggleMask ?? 0);
      return { bold: Boolean(mask & 1), italic: Boolean(mask & 2), strike: Boolean(mask & 8),
        underline: character?.underline ?? paragraph?.underline ?? defaults.underline ?? false, ...direct };
    } };
}

// Stream namespace-aware start elements only; parents are bounded by XML depth.
// Closing names, expanded attribute uniqueness, entities and the root are still
// validated even in ignored metadata, so foreign namespaces cannot spoof styles.
async function* metadataElements(runtime: DocxRuntime, entry: ZipEntry, rootUri: string, rootName: string): AsyncGenerator<Element> {
  if (entry.directory || entry.uncompressedSize > METADATA_BYTES) throw new Error("DOCX optional metadata exceeds the1MiB safety limit.");
  const stack: Element[] = []; let rootSeen = false, rootClosed = false, bindings = 0, namespaceChars = 0;
  for await (const token of readMarkupTokens(await openZipEntryStream(runtime, entry), runtime, "DOCX metadata")) {
    runtime.assertActive();
    if (token.kind === "text") {
      assertXmlCharacters(token.cdata ? token.value : decodeXmlEntities(token.value, "DOCX metadata"), "DOCX metadata");
      if (!stack.length && token.value.trim()) throw new Error("DOCX metadata text is outside its root.");
      continue;
    }
    if (token.kind === "end") {
      const previous = stack.pop();
      if (!previous || previous.name !== parseEndElement(token.value, "DOCX metadata")) throw new Error("DOCX metadata elements are mismatched.");
      bindings -= previous.namespaces.size; namespaceChars -= previous.namespaceChars;
      if (!stack.length) rootClosed = true;
      continue;
    }
    if (rootClosed) throw new Error("DOCX metadata contains multiple roots.");
    const parsed = parseStartElement(token.value, "DOCX metadata"), namespaces = new Map<string, string>(); let chars = 0;
    for (const item of parsed.attributes) if (item.name === "xmlns" || item.name.startsWith("xmlns:")) {
      const prefix = item.name === "xmlns" ? "" : item.name.slice(6);
      if (prefix.includes(":") || prefix === "xmlns" || (prefix === "xml" && item.value !== XML) || (prefix && !item.value))
        throw new Error("DOCX metadata namespace declaration is invalid.");
      namespaces.set(prefix, item.value); chars += prefix.length + item.value.length;
    }
    bindings += namespaces.size; namespaceChars += chars;
    if (bindings > 512 || namespaceChars > 65536 || stack.length >= 256) throw new Error("DOCX metadata namespace/depth safety limit exceeded.");
    const qualify = (name: string, attribute = false) => {
      const parts = name.split(":"); if (parts.length > 2 || parts.some(part => !part)) throw new Error("DOCX metadata qualified name is invalid.");
      const prefix = parts.length === 2 ? parts[0] : "", local = parts.at(-1)!;
      if (prefix === "xml") return { uri: XML, local };
      if (!prefix && attribute) return { uri: "", local };
      let uri = namespaces.get(prefix);
      for (let n = stack.length - 1; uri === undefined && n >= 0; n--) uri = stack[n].namespaces.get(prefix);
      if (prefix && uri === undefined) throw new Error("DOCX metadata namespace prefix is undeclared.");
      return { uri: uri ?? "", local };
    };
    const element: Element = { ...qualify(parsed.name), name: parsed.name, attributes: new Map(), namespaces,
      namespaceChars: chars, parent: stack.at(-1), depth: stack.length + 1 };
    for (const item of parsed.attributes) if (item.name !== "xmlns" && !item.name.startsWith("xmlns:")) {
      const name = qualify(item.name, true), key = name.uri + "\0" + name.local;
      if (element.attributes.has(key)) throw new Error("DOCX metadata repeats an expanded attribute.");
      element.attributes.set(key, item.value);
    }
    if (!rootSeen) {
      if (element.uri !== rootUri || element.local !== rootName) throw new Error("DOCX optional metadata has the wrong root namespace or type.");
      rootSeen = true;
    }
    yield element;
    if (parsed.selfClosing) { bindings -= namespaces.size; namespaceChars -= chars; if (!stack.length) rootClosed = true; }
    else stack.push(element);
  }
  if (!rootSeen || !rootClosed || stack.length) throw new Error("DOCX optional metadata root is incomplete.");
}
