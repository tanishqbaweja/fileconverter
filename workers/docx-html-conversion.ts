import {
  assertXmlCharacters, decodeXmlEntities, normalizeXmlNewlines, openDocxMainDocument,
  parseEndElement, parseStartElement, readMarkupTokens, type DocxRuntime,
} from "./docx-conversion";
import { readDocxOutlineModel, parseDocxOutlineLevel, docxEmphasisKey, parseDocxEmphasisValue, type DocxOutlineModel, type DocxEmphasis } from "./docx-outline";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML = "http://www.w3.org/XML/1998/namespace";
const MAX_DEPTH = 256, MAX_NAMESPACE_BINDINGS = 512, MAX_NAMESPACE_CHARS = 65536;
const OUTPUT_CHUNK_BYTES = 65536;
type Block = "p" | "table" | "tr" | "td";
type Run = { direct: Partial<DocxEmphasis>; styleId?: string; propertiesSeen: boolean; contentStarted: boolean; opened: boolean; close: string };
type Paragraph = { opened: boolean; contentStarted: boolean; propertiesSeen: boolean; styleId?: string; outline?: number; tag: string };
type Frame = { name: string; local: string | null; declarations: Map<string, string>; namespaceChars: number;
  block?: Block; paragraph?: Paragraph; run?: Run; text?: boolean; suppress: boolean };

/** Private candidate until complete production/browser/memory qualification.
 * Main-document structure and bounded supported style/direct emphasis only.
 * User XML attributes, URLs, styles, markup and relationship targets are NEVER
 * copied into executable HTML/CSS. Output text is escaped after XML decoding.
 */
export async function runDocxToHtml(runtime: DocxRuntime): Promise<void> {
  runtime.warn("DOCX HTML preserves main-document paragraphs, simple table rows/cells, direct bold/italic/underline/strike runs, tabs, line breaks, Unicode and accepted tracked insertions. Tracked deletions and moved-from text are excluded.");
  runtime.warn("Named styles (referenced/default paragraph and character) preserve outline hierarchy and supported bold/italic/underline/strike emphasis with direct overrides. Underline patterns/colors are normalized to a single underline. Table/numbering style effects, complex-script properties, other font/run styling, list numbering, fonts, colors, borders, merged-cell layout, page layout, links, fields, images/drawings, headers/footers, notes/comments and document properties are not reproduced. Field display text is retained when present; headings reflow in static HTML, not original Word layout.");
  let outlines: DocxOutlineModel;
  const source = await openDocxMainDocument(runtime, async entries => { outlines = await readDocxOutlineModel(runtime, entries); }), writer = htmlWriter(runtime);
  if (outlines!.definitionCount) runtime.warn(`DOCX outline metadata read ${outlines!.definitionCount} style definitions from a referenced internal package part.`);
  const stack: Frame[] = [], blocks: Block[] = [];
  let rootSeen = false, rootClosed = false, bodySeen = false, bodyDepth = 0, textDepth = 0, suppressed = 0;
  let bindings = 0, namespaceChars = 0, run: Run | null = null, foreignWarning = false;
  let paragraph: Paragraph | null = null;
  const resolve = (name: string, attribute = false, current?: Map<string, string>): { uri: string; local: string } => {
    const parts = name.split(":");
    if (parts.length > 2 || parts.some(part => !part)) throw new Error("DOCX HTML encountered an invalid qualified XML name.");
    const prefix = parts.length === 2 ? parts[0] : "", local = parts.at(-1)!;
    if (prefix === "xml") return { uri: XML, local };
    if (!prefix && attribute) return { uri: "", local };
    if (current?.has(prefix)) return { uri: current.get(prefix)!, local };
    for (let index = stack.length - 1; index >= 0; index--)
      if (stack[index].declarations.has(prefix)) return { uri: stack[index].declarations.get(prefix)!, local };
    if (prefix) throw new Error("DOCX HTML encountered an undeclared XML namespace prefix.");
    return { uri: "", local };
  };
  const openParagraph = async () => {
    if (!paragraph || paragraph.opened) return;
    const level = paragraph.outline ?? outlines.outline(paragraph.styleId);
    paragraph.tag = level !== undefined && level < 6 ? `h${level + 1}` : "p";
    const attributes = level !== undefined && level < 9
      ? level >= 6 ? ` role="heading" aria-level="${level + 1}"` : ' style="white-space:pre-wrap"' : "";
    await writer.markup(`<${paragraph.tag}${attributes}>`); paragraph.opened = true;
  };
  const openRun = async () => {
    if (!run || blocks.at(-1) !== "p") throw new Error("DOCX HTML text must belong to a paragraph run.");
    await openParagraph();
    if (run.opened) return;
    run.opened = true;
    const emphasis = outlines.emphasis(paragraph?.styleId, run.styleId, run.direct);
    for (const [enabled, tag] of [[emphasis.bold, "strong"], [emphasis.italic, "em"], [emphasis.underline, "u"], [emphasis.strike, "s"]] as const)
      if (enabled) { await writer.markup(`<${tag}>`); run.close = `</${tag}>` + run.close; }
  };
  const close = async (frame: Frame) => {
    if (frame.text) textDepth--;
    if (frame.run) { await writer.markup(frame.run.close); run = null; }
    if (frame.block) {
      if (blocks.pop() !== frame.block) throw new Error("DOCX HTML block state is inconsistent.");
      if (frame.paragraph) { await openParagraph(); await writer.markup(`</${frame.paragraph.tag}>\n`); paragraph = null; }
      else await writer.markup(`</${frame.block}>\n`);
    }
    if (frame.local === "body") bodyDepth--;
    if (frame.local === "document") rootClosed = true;
    if (frame.suppress) suppressed--;
    bindings -= frame.declarations.size; namespaceChars -= frame.namespaceChars;
  };
  await writer.markup('<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
    '<title>Converted document</title><style>body{font-family:system-ui,sans-serif;line-height:1.5;max-width:80ch;margin:2rem auto;padding:0 1rem}p{white-space:pre-wrap}table{border-collapse:collapse}td{vertical-align:top;padding:.25rem .5rem}</style></head><body>\n');
  for await (const token of readMarkupTokens(source, runtime, "DOCX HTML")) {
    runtime.assertActive();
    if (token.kind === "text") {
      if (!stack.length && token.value.trim()) throw new Error("DOCX HTML contains text outside its document root.");
      if (bodyDepth && textDepth && !suppressed) {
        const normalized = normalizeXmlNewlines(token.value), value = token.cdata ? normalized : decodeXmlEntities(normalized, "DOCX HTML text");
        assertXmlCharacters(value, "DOCX HTML text"); await openRun(); await writer.text(value);
      }
      continue;
    }
    if (token.kind === "end") {
      const frame = stack.pop(), name = parseEndElement(token.value, "DOCX HTML");
      if (!frame || frame.name !== name) throw new Error("DOCX HTML contains mismatched XML elements.");
      await close(frame); continue;
    }
    const element = parseStartElement(token.value, "DOCX HTML");
    if (rootClosed) throw new Error("DOCX HTML contains more than one document root.");
    const declarations = new Map<string, string>(); let addedChars = 0;
    for (const attr of element.attributes) if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) {
      const prefix = attr.name === "xmlns" ? "" : attr.name.slice(6);
      if (prefix.includes(":") || prefix === "xmlns" || (prefix === "xml" && attr.value !== XML) ||
          (!attr.value && prefix)) throw new Error("DOCX HTML contains an invalid namespace declaration.");
      declarations.set(prefix, attr.value); addedChars += prefix.length + attr.value.length;
    }
    bindings += declarations.size; namespaceChars += addedChars;
    if (bindings > MAX_NAMESPACE_BINDINGS || namespaceChars > MAX_NAMESPACE_CHARS)
      throw new Error("DOCX HTML namespace metadata exceeds its bounded safety limit.");
    const qualified = resolve(element.name, false, declarations), local = qualified.uri === WORD ? qualified.local : null;
    const expandedAttributes = new Set<string>();
    for (const attr of element.attributes) if (attr.name !== "xmlns" && !attr.name.startsWith("xmlns:")) {
      const attrName = resolve(attr.name, true, declarations), key = `${attrName.uri}\u0000${attrName.local}`;
      if (expandedAttributes.has(key)) throw new Error("DOCX HTML contains repeated expanded XML attributes.");
      expandedAttributes.add(key);
    }
    if (!rootSeen) {
      if (local !== "document") throw new Error("DOCX HTML requires a WordprocessingML document root.");
      rootSeen = true;
    } else if (local === "document") throw new Error("DOCX HTML cannot contain nested Word document roots.");
    const frame: Frame = { name: element.name, local, declarations, namespaceChars: addedChars, suppress: false };
    // Deletions/graphics and foreign XML cannot inject their descendants as
    // visible Word text. Namespace bindings are still checked in skipped data.
    frame.suppress = local === "del" || local === "moveFrom" || local === "drawing" || local === "pict" ||
      local === "object" || local === "rPrChange" || local === null;
    if (local === null && bodyDepth && !suppressed && !foreignWarning) {
      runtime.warn("Foreign-namespace document content is omitted from this DOCX HTML profile."); foreignWarning = true;
    }
    if (frame.suppress) suppressed++;
    if (local === "body") {
      if (bodySeen || stack.length !== 1) throw new Error("DOCX HTML requires exactly one direct main-document body.");
      bodySeen = true; bodyDepth++;
    }
    if (bodyDepth && !suppressed) {
      const block: Block | null = local === "p" ? "p" : local === "tbl" ? "table" : local === "tr" ? "tr" : local === "tc" ? "td" : null;
      if (block) {
        const parent = blocks.at(-1);
        if ((block === "p" || block === "table") ? parent !== undefined && parent !== "td"
          : block === "tr" ? parent !== "table" : parent !== "tr")
          throw new Error("DOCX HTML cannot represent malformed or overlapping paragraph/table structure.");
        frame.block = block; blocks.push(block);
        if (block === "p") frame.paragraph = paragraph = { opened: false, contentStarted: false, propertiesSeen: false, tag: "p" };
        else await writer.markup(`<${block}>`);
      }
      if (local === "pPr" && stack.at(-1)?.paragraph) {
        if (!paragraph || paragraph.contentStarted || paragraph.propertiesSeen) throw new Error("DOCX paragraph properties must occur once before content.");
        paragraph.propertiesSeen = true;
      }
      if ((local === "pStyle" || local === "outlineLvl") && stack.at(-1)?.local === "pPr" && stack.at(-2)?.paragraph === paragraph && paragraph) {
        const value = element.attributes.find(attr => {
          if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) return false;
          const name = resolve(attr.name, true, declarations); return name.uri === WORD && name.local === "val";
        })?.value;
        if (local === "pStyle") {
          if (!value || value.length > 256 || paragraph.styleId !== undefined) throw new Error("DOCX paragraph style reference is invalid or repeated.");
          paragraph.styleId = value;
        } else {
          if (paragraph.outline !== undefined) throw new Error("DOCX paragraph repeats its outline level.");
          paragraph.outline = parseDocxOutlineLevel(value);
        }
      }
      if (local === "r") {
        if (run || blocks.at(-1) !== "p") throw new Error("DOCX HTML contains an invalid paragraph run.");
        if (paragraph) paragraph.contentStarted = true;
        frame.run = run = { direct: {}, propertiesSeen: false, contentStarted: false, opened: false, close: "" };
      }
      if (local === "rPr" && stack.at(-1)?.run === run && run) {
        if (run.contentStarted) throw new Error("DOCX HTML run properties must precede run text.");
        if (run.propertiesSeen) throw new Error("DOCX HTML run properties must occur once.");
        run.propertiesSeen = true;
      }
      const emphasisKey = docxEmphasisKey(local);
      if (run && stack.at(-1)?.local === "rPr" && stack.at(-2)?.run === run && (emphasisKey || local === "rStyle")) {
        const val = element.attributes.find(attr => {
          if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) return false;
          const name = resolve(attr.name, true, declarations); return name.uri === WORD && name.local === "val";
        })?.value;
        if (local === "rStyle") {
          if (!val || val.length > 256 || run.styleId !== undefined) throw new Error("DOCX character style reference is invalid or repeated.");
          run.styleId = val;
        } else if (emphasisKey) {
          if (run.direct[emphasisKey] !== undefined) throw new Error("DOCX run repeats a supported emphasis property.");
          run.direct[emphasisKey] = parseDocxEmphasisValue(local!, val);
        }
      }
      if (local === "t") {
        if (!run || textDepth) throw new Error("DOCX HTML contains text outside a supported run.");
        run.contentStarted = true;
        textDepth++; frame.text = true;
      }
      if (["tab", "br", "cr", "noBreakHyphen", "softHyphen"].includes(local ?? "")) {
        if (run) run.contentStarted = true;
        await openRun();
        if (local === "br" || local === "cr") await writer.markup("<br>");
        else await writer.text(local === "tab" ? "\t" : local === "noBreakHyphen" ? "\u2011" : "\u00ad");
      }
    }
    // Closing suppressed elements must not modify text/run/body state that was
    // never opened. Retain only the genuine visible state for this frame.
    if (suppressed && local !== "body" && local !== "document") frame.local = null;
    if (element.selfClosing) await close(frame);
    else {
      if (stack.length >= MAX_DEPTH) throw new Error("DOCX HTML XML nesting exceeds the256-element safety limit.");
      stack.push(frame);
    }
  }
  if (!rootSeen || !rootClosed || !bodySeen || stack.length || blocks.length || run || paragraph || bodyDepth || textDepth || suppressed)
    throw new Error("DOCX HTML main-document structure is incomplete.");
  await writer.markup("</body></html>\n"); await writer.flush(); runtime.metrics.inputBytes = runtime.file.size;
}

function htmlWriter(runtime: DocxRuntime) {
  const encoder = new TextEncoder(), buffer = new Uint8Array(OUTPUT_CHUNK_BYTES); let used = 0;
  const flush = async () => {
    if (!used) return;
    runtime.assertActive(); await runtime.write(buffer.subarray(0, used), "Writing DOCX HTML"); used = 0; runtime.assertActive();
  };
  const markup = async (value: string) => {
    const bytes = encoder.encode(value);
    for (let offset = 0; offset < bytes.length;) {
      const size = Math.min(buffer.length - used, bytes.length - offset);
      buffer.set(bytes.subarray(offset, offset + size), used); used += size; offset += size;
      if (used === buffer.length) await flush();
    }
  };
  return { markup, flush, async text(value: string) {
    for (let start = 0; start < value.length;) {
      let end = Math.min(start + 4096, value.length);
      if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff) end--;
      await markup(value.slice(start, end).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")); start = end;
    }
  } };
}
