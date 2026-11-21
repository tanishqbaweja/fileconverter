import {
  assertXmlCharacters, decodeXmlEntities, normalizeXmlNewlines, openDocxMainDocument,
  parseEndElement, parseStartElement, readMarkupTokens, type DocxRuntime,
} from "./docx-conversion";
import { readDocxOutlineModel, parseDocxOutlineLevel, docxEmphasisKey, parseDocxEmphasisValue, type DocxOutlineModel, type DocxEmphasis } from "./docx-outline";
import { readDocxNumberingModel, parseDocxNumberingInteger, type DocxNumberingModel, type DocxNumberingReference, type DocxListMarker } from "./docx-numbering";
import { readDocxHyperlinkModel, docxBookmarkId, docxHtmlAttribute, type DocxHyperlinkModel } from "./docx-hyperlinks";
import { parseDocxColor, type DocxColor } from "./docx-colors";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML = "http://www.w3.org/XML/1998/namespace";
const OFFICE_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MAX_DEPTH = 256, MAX_NAMESPACE_BINDINGS = 512, MAX_NAMESPACE_CHARS = 65536;
const OUTPUT_CHUNK_BYTES = 65536;
const MAX_HTML_COLUMN_SPAN = 1000;
const MAX_HTML_ROW_SPAN = 65534, MAX_ACTIVE_MERGES = 1024, ROW_SPAN_DIGITS = 5;
type Block = "p" | "table" | "tr" | "td";
type Merge = { width: number; rows: number; position: number };
type Table = { previous?: Map<number, Merge>; current?: Map<number, Merge>;
  column: number; before?: number; after?: number; rowOpened: boolean; propertiesSeen: boolean };
type Run = { direct: Partial<DocxEmphasis>; color?: DocxColor; styleId?: string; propertiesSeen: boolean; contentStarted: boolean; opened: boolean; close: string };
type Paragraph = { opened: boolean; contentStarted: boolean; propertiesSeen: boolean; styleId?: string; outline?: number; tag: string; muted: boolean; numbering?: DocxNumberingReference };
type Cell = { opened: boolean; propertiesSeen: boolean; columnSpan?: number; vertical?: "restart" | "continue"; continued?: boolean };
type Frame = { name: string; local: string | null; declarations: Map<string, string>; namespaceChars: number;
  block?: Block; paragraph?: Paragraph; table?: Table; row?: Table; cell?: Cell; run?: Run; text?: boolean; hyperlinkClose?: string; suppress: boolean };
type DocxHtmlRuntime = DocxRuntime & { patch(position: number, chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void> };

/** Private candidate until complete production/browser/memory qualification.
 * Main-document structure and bounded supported style/direct emphasis only.
 * Source markup/CSS is never executed. Only explicitly validated navigation
 * targets become escaped attributes; output text is escaped after XML decoding.
 */
export async function runDocxToHtml(runtime: DocxHtmlRuntime): Promise<void> {
  runtime.warn("DOCX HTML preserves main-document paragraphs, table rows/cells, horizontal grid spans, and standard vertical merges with empty continuation cells. Omitted edge grid positions use empty HTML cells. Direct bold/italic/underline/strike, tabs, line breaks, Unicode and accepted tracked insertions are preserved. Tracked deletions and moved-from text are excluded.");
  runtime.warn("Named styles (referenced/default paragraph and character) preserve outline hierarchy and supported bold/italic/underline/strike emphasis and text colors with direct overrides. Text colors use bounded RGB and theme mapping; automatic color uses the browser text color, not Word's background-dependent choice. Underline patterns/colors are normalized to a single underline. Legacy horizontal merges, table-style effects, complex-script properties, fonts, shading, borders, page layout, fields, images/drawings, headers/footers, notes/comments and document properties are not reproduced. Field display text is retained when present; headings reflow in static HTML, not original Word layout.");
  let outlines: DocxOutlineModel, numbering: DocxNumberingModel, hyperlinks: DocxHyperlinkModel;
  const source = await openDocxMainDocument(runtime, async entries => {
    outlines = await readDocxOutlineModel(runtime, entries); numbering = await readDocxNumberingModel(runtime, entries);
    hyperlinks = await readDocxHyperlinkModel(runtime, entries);
  }), writer = htmlWriter(runtime);
  runtime.warn("Explicit DOCX HTTP/HTTPS/mailto hyperlinks and local bookmark positions are preserved without fetching targets; unsafe/relative/package links retain display text but are inactive. Frame targets, browsing history, document-location hints and field-code links are not reproduced; nested hyperlinks are rejected. Relationships are capped at1MiB/4096entries/1024links and bookmarks at4096names.");
  runtime.warn("Supported DOCX decimal, repeated-letter, Roman and Unicode-bullet list labels, instance continuation, level restarts and inherited paragraph-style numbering are preserved in streamed HTML lists. Marker fonts, original tab stops and indent geometry are normalized; picture/legacy markers, linked numbering styles and other numbering systems are rejected when used.");
  if (outlines!.definitionCount) runtime.warn(`DOCX outline metadata read ${outlines!.definitionCount} style definitions from a referenced internal package part.`);
  const stack: Frame[] = [], blocks: Block[] = [], cells: Cell[] = [], tables: Table[] = [];
  let rootSeen = false, rootClosed = false, bodySeen = false, bodyDepth = 0, textDepth = 0, suppressed = 0;
  let bindings = 0, namespaceChars = 0, run: Run | null = null, foreignWarning = false;
  let paragraph: Paragraph | null = null;
  let hyperlinkActive = false, unsafeLinkWarned = false;
  const bookmarkNames = new Set<string>(), bookmarkReferences = new Set<string>();
  const lists: { numId: number; level: number; tag: "ol" | "ul" }[] = [];
  const closeLists = async (keep = 0) => {
    while (lists.length > keep) { const list = lists.pop()!; await writer.markup(`</li></${list.tag}>\n`); }
  };
  const startListItem = async (marker?: DocxListMarker) => {
    if (!marker) { await closeLists(); return; }
    if (lists.length && lists[0].numId !== marker.numId) await closeLists();
    while (lists.length && lists.at(-1)!.level > marker.level) await closeLists(lists.length - 1);
    const previous = lists.at(-1), tag = marker.ordered ? "ol" : "ul";
    if (previous?.level === marker.level) await writer.markup("</li>");
    else {
      const gap = marker.level - (previous?.level ?? -1);
      await writer.markup(`<${tag} data-docx-list-level="${marker.level}" style="list-style:none;padding-left:${gap * 2}em">`);
      lists.push({ numId: marker.numId, level: marker.level, tag });
    }
    await writer.markup(`<li${marker.ordered ? ` value="${marker.value}"` : ""}>`);
  };
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
    if (!paragraph || paragraph.opened || paragraph.muted) return;
    const level = paragraph.outline ?? outlines.outline(paragraph.styleId);
    const inherited = outlines.numbering(paragraph.styleId);
    const marker = numbering.next({ numId: paragraph.numbering?.numId ?? inherited.numId, level: paragraph.numbering?.level }, inherited.styleIds);
    await startListItem(marker);
    paragraph.tag = level !== undefined && level < 6 ? `h${level + 1}` : "p";
    const attributes = level !== undefined && level < 9
      ? level >= 6 ? ` role="heading" aria-level="${level + 1}"` : ' style="white-space:pre-wrap"' : "";
    await writer.markup(`<${paragraph.tag}${attributes}>`); paragraph.opened = true;
    if (marker) {
      await writer.markup('<span class="docx-list-marker" style="white-space:pre-wrap">');
      await writer.text(marker.text + marker.suffix); await writer.markup("</span>");
    }
  };
  const openRun = async () => {
    if (!run || blocks.at(-1) !== "p") throw new Error("DOCX HTML text must belong to a paragraph run.");
    await openParagraph();
    if (run.opened || paragraph?.muted) return;
    run.opened = true;
    const emphasis = outlines.emphasis(paragraph?.styleId, run.styleId, run.direct);
    const color = outlines.color(paragraph?.styleId, run.styleId, run.color);
    if (color) { await writer.markup(`<span style="color:${color}">`); run.close = "</span>"; }
    for (const [enabled, tag] of [[emphasis.bold, "strong"], [emphasis.italic, "em"], [emphasis.underline, "u"], [emphasis.strike, "s"]] as const)
      if (enabled) { await writer.markup(`<${tag}>`); run.close = `</${tag}>` + run.close; }
  };
  const writeGridGap = async (width: number) => {
    if (width) await writer.markup(`<td${width > 1 ? ` colspan="${width}"` : ""} aria-hidden="true"></td>`);
  };
  const openRow = async (table: Table) => {
    if (table.rowOpened) return;
    await writer.markup("<tr>");
    if (table.before) await writeGridGap(table.before);
    table.column = table.before ?? 0;
    table.rowOpened = true;
  };
  const finishMerges = async (table: Table) => {
    if (table.previous) for (const [column, merge] of table.previous) {
      if (merge.rows > 1 && table.current?.get(column) !== merge)
        await writer.finishRowSpan(merge.position, merge.rows);
    }
    table.previous = table.current;
    table.current = undefined;
  };
  // Only opening tags and the previous/current rows' active merge metadata
  // are deferred. No XML, cell content, or complete row is retained.
  const openCell = async (cell: Cell) => {
    if (cell.opened) return;
    const table = tables.at(-1)!;
    if (!table.rowOpened) await openRow(table);
    const column = table.column;
    const span = cell.columnSpan ?? 1;
    table.column += span;
    if (!Number.isSafeInteger(table.column)) throw new Error("DOCX table grid exceeds the safe numeric range.");
    const tag = span > 1 ? `<td colspan="${span}"` : "<td";
    if (cell.vertical) {
      const current = table.current ??= new Map();
      if (current.size >= MAX_ACTIVE_MERGES) throw new Error("DOCX table exceeds the active vertical merge limit.");
      if (cell.vertical === "continue") {
        const merge = table.previous?.get(column);
        if (!merge || merge.width !== span) throw new Error("DOCX vertical merge continuation does not match the preceding row's grid columns.");
        if (merge.rows >= MAX_HTML_ROW_SPAN) throw new Error("DOCX vertical merge exceeds the HTML limit of 65534 rows.");
        merge.rows++;
        current.set(column, merge);
        cell.continued = true;
      } else {
        await writer.markup(`${tag} rowspan="`);
        const position = await writer.reserveRowSpan();
        await writer.markup('">');
        current.set(column, { width: span, rows: 1, position });
      }
    } else await writer.markup(`${tag}>`);
    cell.opened = true;
  };
  const close = async (frame: Frame) => {
    if (frame.text) textDepth--;
    if (frame.run) { await writer.markup(frame.run.close); run = null; }
    if (frame.hyperlinkClose) { if (run) throw new Error("DOCX hyperlink contains an unclosed run."); await writer.markup(frame.hyperlinkClose); hyperlinkActive = false; }
    if (frame.block) {
      if (blocks.pop() !== frame.block) throw new Error("DOCX HTML block state is inconsistent.");
      if (frame.paragraph) {
        if (frame.paragraph.muted && (frame.paragraph.numbering?.numId ?? outlines.numbering(frame.paragraph.styleId).numId ?? 0) !== 0)
          throw new Error("DOCX vertical merge continuation contains a visible list marker that cannot be preserved in place.");
        if (!frame.paragraph.muted) { await openParagraph(); await writer.markup(`</${frame.paragraph.tag}>\n`); }
        paragraph = null;
      }
      else {
        if (frame.cell) {
          await closeLists();
          if (!frame.cell.opened) await openCell(frame.cell);
          if (cells.pop() !== frame.cell) throw new Error("DOCX HTML table cell state is inconsistent.");
        }
        if (frame.row) {
          if (!frame.row.rowOpened) await openRow(frame.row);
          if (frame.row.after) await writeGridGap(frame.row.after);
          if (frame.row.previous || frame.row.current) await finishMerges(frame.row);
        }
        if (frame.table) {
          if (frame.table.previous) await finishMerges(frame.table);
          if (tables.pop() !== frame.table) throw new Error("DOCX HTML table state is inconsistent.");
        }
        if (!frame.cell?.continued) await writer.markup(`</${frame.block}>\n`);
      }
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
        assertXmlCharacters(value, "DOCX HTML text");
        if (paragraph?.muted) {
          if (value.length) throw new Error("DOCX vertical merge continuation contains text that cannot be preserved in place.");
        } else { await openRun(); await writer.text(value); }
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
      local === "object" || local === "rPrChange" || local === "tcPrChange" || local === null;
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
        if (hyperlinkActive) throw new Error("DOCX hyperlink cannot contain block structure.");
        const parent = blocks.at(-1);
        if ((block === "p" || block === "table") ? parent !== undefined && parent !== "td"
          : block === "tr" ? parent !== "table" : parent !== "tr")
          throw new Error("DOCX HTML cannot represent malformed or overlapping paragraph/table structure.");
        let muted = false;
        if (parent === "td") {
          const cell = cells.at(-1)!;
          if (!cell.opened) await openCell(cell);
          muted = cell.continued === true;
          if (muted && block === "table") throw new Error("DOCX vertical merge continuation contains a nested table that cannot be preserved in place.");
        }
        frame.block = block; blocks.push(block);
        if (block === "p") frame.paragraph = paragraph = { opened: false, contentStarted: false, propertiesSeen: false, tag: "p", muted };
        else if (block === "td") { frame.cell = { opened: false, propertiesSeen: false }; cells.push(frame.cell); }
        else if (block === "tr") {
          const table = frame.row = tables.at(-1)!;
          table.rowOpened = false; table.propertiesSeen = false; table.before = table.after = undefined;
        } else {
          await closeLists();
          frame.table = { column: 0, rowOpened: false, propertiesSeen: false }; tables.push(frame.table);
          await writer.markup("<table>");
        }
      }
      if (local === "trPr") {
        const table = stack.at(-1)?.row;
        if (table) {
          if (table.rowOpened || table.propertiesSeen) throw new Error("DOCX table row properties must occur once before cells.");
          table.propertiesSeen = true;
        }
      }
      if ((local === "gridBefore" || local === "gridAfter") && stack.at(-1)?.local === "trPr") {
        const table = stack.at(-2)?.row;
        if (table) {
          const field = local === "gridBefore" ? "before" : "after";
          if (table.rowOpened || table[field] !== undefined) throw new Error("DOCX table row grid offset is late or repeated.");
          table[field] = parseColumnCount(wordValue(element.attributes, declarations, resolve));
        }
      }
      if (local === "tcPr") {
        const cell = stack.at(-1)?.cell;
        if (cell) {
          if (cell.opened || cell.propertiesSeen) throw new Error("DOCX table cell properties must occur once before content.");
          cell.propertiesSeen = true;
        }
      }
      if ((local === "gridSpan" || local === "vMerge") && stack.at(-1)?.local === "tcPr") {
        const cell = stack.at(-2)?.cell;
        if (cell) {
          if (cell.opened) throw new Error("DOCX table cell merge properties must precede content.");
          const value = wordValue(element.attributes, declarations, resolve);
          if (local === "gridSpan") {
            if (cell.columnSpan !== undefined) throw new Error("DOCX table cell repeats its grid span.");
            cell.columnSpan = Math.max(1, parseColumnCount(value)); // Word treats zero as one column.
          } else {
            if (cell.vertical !== undefined) throw new Error("DOCX table cell repeats its vertical merge.");
            if (value !== undefined && value !== "restart" && value !== "continue") throw new Error("DOCX table cell has an invalid vertical merge.");
            cell.vertical = value ?? "continue";
          }
        }
      }
      if (local === "pPr" && stack.at(-1)?.paragraph) {
        if (!paragraph || paragraph.contentStarted || paragraph.propertiesSeen) throw new Error("DOCX paragraph properties must occur once before content.");
        paragraph.propertiesSeen = true;
      }
      if (local === "numPr" && stack.at(-1)?.local === "pPr" && stack.at(-2)?.paragraph === paragraph && paragraph) {
        if (paragraph.numbering) throw new Error("DOCX paragraph repeats numbering properties.");
        paragraph.numbering = {};
      }
      if ((local === "numId" || local === "ilvl") && stack.at(-1)?.local === "numPr" &&
          stack.at(-2)?.local === "pPr" && stack.at(-3)?.paragraph === paragraph && paragraph?.numbering) {
        const key = local === "numId" ? "numId" : "level";
        if (paragraph.numbering[key] !== undefined) throw new Error("DOCX paragraph repeats a numbering reference.");
        paragraph.numbering[key] = parseDocxNumberingInteger(wordValue(element.attributes, declarations, resolve), local === "ilvl" ? 8 : undefined);
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
      if (local === "hyperlink" || local === "bookmarkStart") {
        const attribute = (name: string, uri = WORD) => element.attributes.find(a => {
          if (a.name === "xmlns" || a.name.startsWith("xmlns:")) return false;
          const q = resolve(a.name, true, declarations); return q.uri === uri && q.local === name;
        })?.value;
        if (local === "hyperlink") {
          if (!paragraph || paragraph.muted || blocks.at(-1) !== "p" || run || hyperlinkActive)
            throw new Error("DOCX nested or non-paragraph hyperlink cannot be represented safely in HTML.");
          const id = attribute("id", OFFICE_RELS), anchor = attribute("anchor"), tooltip = attribute("tooltip");
          if (tooltip !== undefined && tooltip.length > 1024) throw new Error("DOCX hyperlink tooltip exceeds1024characters.");
          // OOXML relationship targets supersede anchor when both are present.
          const href = id !== undefined ? hyperlinks!.resolve(id).href : anchor ? "#" + docxBookmarkId(anchor) : "#";
          if (id === undefined && anchor) {
            if (!bookmarkReferences.has(anchor) && bookmarkReferences.size >= 4096) throw new Error("DOCX exceeds4096distinct bookmark link references.");
            bookmarkReferences.add(anchor);
          }
          paragraph.contentStarted = true; await openParagraph(); hyperlinkActive = true;
          if (href === null) {
            await writer.markup('<span data-docx-link-disabled="unsafe-target">'); frame.hyperlinkClose = "</span>";
            if (!unsafeLinkWarned) { runtime.warn("Unsafe or unsupported DOCX link targets were made inactive; their display text is retained. No target was fetched."); unsafeLinkWarned = true; }
          } else {
            await writer.markup(`<a href="${docxHtmlAttribute(href)}" rel="noreferrer noopener" referrerpolicy="no-referrer"${tooltip !== undefined ? ` title="${docxHtmlAttribute(tooltip)}"` : ""}>`);
            frame.hyperlinkClose = "</a>";
          }
        } else {
          const name = attribute("name");
          if (!name) throw new Error("DOCX bookmark start has no name.");
          const id = docxBookmarkId(name);
          if (bookmarkNames.has(name) || bookmarkNames.size >= 4096) throw new Error("DOCX bookmark names are duplicated or exceed4096entries.");
          if (paragraph?.muted || ["table", "tr"].includes(blocks.at(-1) ?? "")) throw new Error("DOCX bookmark position cannot be represented at this table location.");
          if (paragraph) { paragraph.contentStarted = true; if (run) await openRun(); else await openParagraph(); }
          else { await closeLists(); if (blocks.at(-1) === "td") await openCell(cells.at(-1)!); }
          bookmarkNames.add(name); await writer.markup(`<span id="${id}"></span>`);
        }
      }
      if (local === "rPr" && stack.at(-1)?.run === run && run) {
        if (run.contentStarted) throw new Error("DOCX HTML run properties must precede run text.");
        if (run.propertiesSeen) throw new Error("DOCX HTML run properties must occur once.");
        run.propertiesSeen = true;
      }
      const emphasisKey = docxEmphasisKey(local);
      if (run && local === "color" && stack.at(-1)?.local === "rPr" && stack.at(-2)?.run === run) {
        if (run.color !== undefined) throw new Error("DOCX run repeats a color property.");
        run.color = parseDocxColor(name => wordValue(element.attributes, declarations, resolve, name));
      }
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
        if (paragraph?.muted) throw new Error("DOCX vertical merge continuation contains a visible control that cannot be preserved in place.");
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
  if (!rootSeen || !rootClosed || !bodySeen || stack.length || blocks.length || cells.length || tables.length || run || paragraph || hyperlinkActive || bodyDepth || textDepth || suppressed)
    throw new Error("DOCX HTML main-document structure is incomplete.");
  if ([...bookmarkReferences].some(name => !bookmarkNames.has(name))) runtime.warn("Some DOCX local hyperlinks reference absent or excluded bookmarks. Their fragments remain unresolved rather than Word's fallback-to-start behavior.");
  await closeLists(); await writer.markup("</body></html>\n"); await writer.flush(); runtime.metrics.inputBytes = runtime.file.size;
}

function wordValue(attributes: { name: string; value: string }[], declarations: Map<string, string>,
  resolve: (name: string, attribute: boolean, current: Map<string, string>) => { uri: string; local: string }, local = "val") {
  return attributes.find(attr => {
    if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) return false;
    const name = resolve(attr.name, true, declarations); return name.uri === WORD && name.local === local;
  })?.value;
}

function parseColumnCount(value: string | undefined): number {
  if (value === undefined || !/^[\t\n\r ]*\+?[0-9]+[\t\n\r ]*$/.test(value))
    throw new Error("DOCX table cell has an invalid grid span.");
  const span = Number(value);
  if (!Number.isSafeInteger(span) || span > MAX_HTML_COLUMN_SPAN)
    throw new Error("DOCX table cell grid span exceeds the HTML limit of 1000 columns.");
  return span;
}

function htmlWriter(runtime: DocxHtmlRuntime) {
  const encoder = new TextEncoder(), buffer = new Uint8Array(OUTPUT_CHUNK_BYTES); let used = 0, flushed = 0;
  const flush = async () => {
    if (!used) return;
    runtime.assertActive(); await runtime.write(buffer.subarray(0, used), "Writing DOCX HTML"); flushed += used; used = 0; runtime.assertActive();
  };
  const markup = async (value: string) => {
    const bytes = encoder.encode(value);
    for (let offset = 0; offset < bytes.length;) {
      const size = Math.min(buffer.length - used, bytes.length - offset);
      buffer.set(bytes.subarray(offset, offset + size), used); used += size; offset += size;
      if (used === buffer.length) await flush();
    }
  };
  return { markup, flush, async reserveRowSpan() {
    // Keep the five bytes together even across an output-chunk boundary.
    if (buffer.length - used < ROW_SPAN_DIGITS) await flush();
    const position = flushed + used;
    buffer.set(encoder.encode("00001"), used); used += ROW_SPAN_DIGITS;
    return position;
  }, async finishRowSpan(position: number, rows: number) {
    const bytes = encoder.encode(String(rows).padStart(ROW_SPAN_DIGITS, "0"));
    runtime.assertActive();
    if (position >= flushed) buffer.set(bytes, position - flushed);
    else await runtime.patch(position, bytes, "Finalizing DOCX table row span");
    runtime.assertActive();
  }, async text(value: string) {
    for (let start = 0; start < value.length;) {
      let end = Math.min(start + 4096, value.length);
      if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff) end--;
      await markup(value.slice(start, end).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")); start = end;
    }
  } };
}
