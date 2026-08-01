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
const MAX_ODP_PAGES = 10_000;
const MAX_ODS_ROWS = 1_048_576;
const MAX_ODS_COLUMNS = 16_384;
const MAX_CELL_CHARS = 1024 * 1024;
const MAX_ROW_CHARS = 1024 * 1024;
const MAX_REPEATED_SPACES = 1024 * 1024;
const ODF_MIMETYPES = {
  "odt-to-txt": "application/vnd.oasis.opendocument.text",
  "ods-to-csv": "application/vnd.oasis.opendocument.spreadsheet",
  "odp-to-txt": "application/vnd.oasis.opendocument.presentation",
} as const;
const MANIFEST_NAMESPACE =
  "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";
const OFFICE_NAMESPACE =
  "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const TEXT_NAMESPACE =
  "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const TABLE_NAMESPACE =
  "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
const DRAW_NAMESPACE =
  "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0";
const PRESENTATION_NAMESPACE =
  "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0";

type OdfProfileId = keyof typeof ODF_MIMETYPES;

interface OdfRuntime extends ArchiveReadRuntime {
  profileId: OdfProfileId;
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  warn(message: string): void;
}

interface XmlStackEntry {
  name: string;
  local: string;
}

interface NamespacePrefixes {
  office: string;
  text: string;
  table: string | null;
  draw: string | null;
  presentation: string | null;
}

interface OdsCell {
  text: string;
  repeat: number;
  paragraphs: number;
  paragraphDepth: number;
  covered: boolean;
  formula: boolean;
  cachedValue: string;
}

interface OdsRow {
  cells: Array<{ value: string; repeat: number }>;
  repeat: number;
  columns: number;
  characters: number;
  missingFormulaValues: number;
}

export async function runOdfConversion(runtime: OdfRuntime): Promise<void> {
  discloseLimitations(runtime);
  runtime.progress("Inspecting OpenDocument package");
  const entries = await readZipDirectory(runtime);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  if (
    [...byName.keys()].some((name) => {
      const lower = name.toLowerCase();
      return lower.startsWith("basic/") ||
        lower.startsWith("scripts/") ||
        lower === "meta-inf/macrosignatures.xml";
    })
  ) {
    throw new Error("OpenDocument packages containing macros or scripts are not accepted.");
  }
  const expectedMimetype = ODF_MIMETYPES[runtime.profileId];
  await validateMimetype(
    runtime,
    requiredEntry(byName, "mimetype"),
    expectedMimetype,
  );
  await validateManifest(
    runtime,
    requiredEntry(byName, "META-INF/manifest.xml"),
    expectedMimetype,
  );
  const content = requiredEntry(byName, "content.xml");
  const writer = createOutputWriter(runtime);
  switch (runtime.profileId) {
    case "odt-to-txt":
      runtime.progress("Extracting OpenDocument text");
      await extractOdt(runtime, content, writer);
      break;
    case "odp-to-txt":
      runtime.progress("Extracting OpenDocument presentation text");
      await extractOdp(runtime, content, writer);
      break;
    case "ods-to-csv":
      runtime.progress("Exporting OpenDocument spreadsheet");
      await extractOds(runtime, content, writer);
      break;
  }
  await writer.flush();
  runtime.metrics.inputBytes = runtime.file.size;
}

function discloseLimitations(runtime: OdfRuntime): void {
  if (runtime.profileId === "odt-to-txt") {
    runtime.warn(
      "ODT-to-TXT preserves body paragraph and heading order, tabs, explicit spaces, line breaks, Unicode text, and table-cell paragraphs.",
    );
    runtime.warn(
      "Styles, page layout, headers, footers, fields, annotations, tracked-change history, drawings, images, equations, links, indexes, and embedded objects are not represented in plain text.",
    );
    return;
  }
  if (runtime.profileId === "odp-to-txt") {
    runtime.warn(
      "ODP-to-TXT follows declared page order and preserves text paragraphs, tabs, explicit spaces, line breaks, Unicode, and hidden-page text.",
    );
    runtime.warn(
      "Speaker notes, masters, styles, positions, transitions, animations, charts, drawings, images, media, links, equations, and embedded objects are not represented in plain text.",
    );
    return;
  }
  runtime.warn(
    "ODS-to-CSV exports only the first visible sheet. Additional visible and hidden sheets, named ranges, validation, annotations, drawings, charts, images, styles, and print layout are omitted.",
  );
  runtime.warn(
    "Cell order, repeated rows and columns, text, numbers, Booleans, dates, times, and cached formula values are preserved. Formulas are not recalculated and number formats are not rendered.",
  );
}

function requiredEntry(
  entries: ReadonlyMap<string, ZipEntry>,
  name: string,
): ZipEntry {
  const entry = entries.get(name);
  if (!entry || entry.directory) {
    throw new Error(`OpenDocument package is missing required part ${name}.`);
  }
  return entry;
}

async function validateMimetype(
  runtime: OdfRuntime,
  entry: ZipEntry,
  expected: string,
): Promise<void> {
  if (
    entry.localHeaderOffset !== 0 ||
    entry.method !== 0 ||
    entry.uncompressedSize !== expected.length
  ) {
    throw new Error(
      "OpenDocument mimetype must be the first local ZIP entry and stored without compression.",
    );
  }
  const source = await openZipEntryStream(runtime, entry);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const reader = source.getReader();
  let value = "";
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      value += decoder.decode(result.value, { stream: true });
      if (value.length > expected.length) {
        throw new Error("OpenDocument mimetype entry is oversized.");
      }
    }
    value += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  if (value !== expected) throw new Error("OpenDocument mimetype entry is invalid.");
}

async function validateManifest(
  runtime: OdfRuntime,
  entry: ZipEntry,
  expectedMimetype: string,
): Promise<void> {
  let rootEntry = false;
  let contentEntry = false;
  let rootEntrySeen = false;
  let contentEntrySeen = false;
  await parseMetadataXml(
    runtime,
    entry,
    "manifest",
    (element, _parent, root) => {
      const local = localName(element.name);
      if (root && (
        local !== "manifest" ||
        !hasElementNamespace(element.name, element.attributes, MANIFEST_NAMESPACE)
      )) {
        throw new Error("OpenDocument manifest has an invalid root.");
      }
      if (local === "encryption-data") {
        throw new Error("Encrypted OpenDocument package parts are not accepted.");
      }
      if (local !== "file-entry") return;
      const attributes = attributeMap(element.attributes);
      const path = attributes.get("full-path");
      const mediaType = attributes.get("media-type") ?? "";
      if (path === "/") {
        if (rootEntrySeen) throw new Error("OpenDocument manifest duplicates its root entry.");
        rootEntrySeen = true;
        rootEntry = mediaType === expectedMimetype;
      }
      if (path === "content.xml") {
        if (contentEntrySeen) throw new Error("OpenDocument manifest duplicates content.xml.");
        contentEntrySeen = true;
        contentEntry = mediaType === "text/xml" || mediaType === "";
      }
    },
  );
  if (!rootEntry || !contentEntry) {
    throw new Error(
      "OpenDocument manifest does not identify the package root and content.xml correctly.",
    );
  }
}

async function extractOdt(
  runtime: OdfRuntime,
  entry: ZipEntry,
  writer: ReturnType<typeof createOutputWriter>,
): Promise<void> {
  const source = await openZipEntryStream(runtime, entry);
  const state = createContentXmlState();
  let prefixes: NamespacePrefixes | null = null;
  let textBodyOpen = false;
  let paragraphDepth = 0;
  let ignoreDepth = 0;

  for await (const token of readMarkupTokens(source, runtime, "ODT content")) {
    runtime.assertActive();
    if (token.kind === "text") {
      const value = decodeTokenText(token.value, token.cdata, "ODT content text");
      if (!state.stack.length && value.trim()) {
        throw new Error("ODT content contains text outside its root.");
      }
      if (textBodyOpen && ignoreDepth === 0 && paragraphDepth > 0) {
        await writer.write(value);
      }
      continue;
    }
    if (token.kind === "start") {
      const element = parseContentStart(token.value, "ODT content", state);
      if (!prefixes) prefixes = contentPrefixes(element);
      const parentName = state.stack.at(-1)?.name;
      const officeText = isNs(element.name, prefixes.office, "text");
      const trackedChanges = isNs(element.name, prefixes.text, "tracked-changes");
      const annotation = isNs(element.name, prefixes.office, "annotation");
      if (officeText && parentName === `${prefixes.office}:body`) {
        if (textBodyOpen) throw new Error("ODT content contains nested office:text bodies.");
        textBodyOpen = !element.selfClosing;
      }
      const ignoredStart =
        ignoreDepth === 0 && textBodyOpen && (trackedChanges || annotation);
      if (ignoreDepth > 0 && !element.selfClosing) ignoreDepth += 1;
      else if (ignoredStart && !element.selfClosing) ignoreDepth = 1;
      if (textBodyOpen && ignoreDepth === 0) {
        paragraphDepth = await handleTextStart(
          writer,
          element,
          prefixes,
          paragraphDepth,
          "ODT",
        );
      }
      pushContentElement(state, element, "ODT content");
      if (element.selfClosing && !state.stack.length) state.rootClosed = true;
      continue;
    }
    const opened = closeContentElement(state, token.value, "ODT content");
    if (ignoreDepth > 0) {
      ignoreDepth -= 1;
    } else if (prefixes && textBodyOpen) {
      paragraphDepth = await handleTextEnd(
        writer,
        opened,
        prefixes,
        paragraphDepth,
        "ODT",
      );
    }
    if (prefixes && opened.name === `${prefixes.office}:text`) textBodyOpen = false;
    if (!state.stack.length) state.rootClosed = true;
  }
  assertContentComplete(state, "ODT content");
  if (textBodyOpen || paragraphDepth !== 0 || ignoreDepth !== 0) {
    throw new Error("ODT content XML state is incomplete.");
  }
}

async function extractOdp(
  runtime: OdfRuntime,
  entry: ZipEntry,
  writer: ReturnType<typeof createOutputWriter>,
): Promise<void> {
  const source = await openZipEntryStream(runtime, entry);
  const state = createContentXmlState();
  let prefixes: NamespacePrefixes | null = null;
  let presentationBodyOpen = false;
  let pageActive = false;
  let pageCount = 0;
  let hiddenPages = 0;
  let paragraphDepth = 0;
  let ignoredDepth = 0;

  for await (const token of readMarkupTokens(source, runtime, "ODP content")) {
    runtime.assertActive();
    if (token.kind === "text") {
      const value = decodeTokenText(token.value, token.cdata, "ODP content text");
      if (!state.stack.length && value.trim()) {
        throw new Error("ODP content contains text outside its root.");
      }
      if (pageActive && ignoredDepth === 0 && paragraphDepth > 0) {
        await writer.write(value);
      }
      continue;
    }
    if (token.kind === "start") {
      const element = parseContentStart(token.value, "ODP content", state);
      if (!prefixes) prefixes = contentPrefixes(element);
      if (!prefixes.draw || !prefixes.presentation) {
        throw new Error("ODP content lacks drawing or presentation namespaces.");
      }
      const parentName = state.stack.at(-1)?.name;
      const officePresentation = isNs(
        element.name,
        prefixes.office,
        "presentation",
      );
      if (officePresentation && parentName === `${prefixes.office}:body`) {
        if (presentationBodyOpen) {
          throw new Error("ODP content contains nested office:presentation bodies.");
        }
        presentationBodyOpen = !element.selfClosing;
      }
      const page = isNs(element.name, prefixes.draw, "page");
      if (page && pageActive) {
        throw new Error("ODP content contains nested drawing pages.");
      }
      if (page && presentationBodyOpen) {
        pageCount += 1;
        if (pageCount > MAX_ODP_PAGES) {
          throw new Error("ODP presentation exceeds the 10,000-page safety limit.");
        }
        const visibility = attributeMap(element.attributes).get("visibility") ?? "visible";
        if (visibility !== "visible" && visibility !== "hidden") {
          throw new Error("ODP page has an invalid presentation visibility value.");
        }
        if (visibility === "hidden") hiddenPages += 1;
        if (pageCount > 1) await writer.write("\n");
        pageActive = !element.selfClosing;
        runtime.progress(
          `Extracting ODP page ${pageCount.toLocaleString("en-US")}`,
        );
      }
      const notes = isNs(element.name, prefixes.presentation, "notes");
      const annotation = isNs(element.name, prefixes.office, "annotation");
      if (pageActive && ignoredDepth > 0 && !element.selfClosing) ignoredDepth += 1;
      else if (pageActive && (notes || annotation) && !element.selfClosing) {
        ignoredDepth = 1;
      }
      if (pageActive && ignoredDepth === 0) {
        paragraphDepth = await handleTextStart(
          writer,
          element,
          prefixes,
          paragraphDepth,
          "ODP",
        );
      }
      pushContentElement(state, element, "ODP content");
      if (element.selfClosing && !state.stack.length) state.rootClosed = true;
      continue;
    }
    const opened = closeContentElement(state, token.value, "ODP content");
    if (ignoredDepth > 0) ignoredDepth -= 1;
    else if (prefixes && pageActive) {
      paragraphDepth = await handleTextEnd(
        writer,
        opened,
        prefixes,
        paragraphDepth,
        "ODP",
      );
    }
    if (prefixes?.draw && opened.name === `${prefixes.draw}:page`) pageActive = false;
    if (
      prefixes &&
      opened.name === `${prefixes.office}:presentation`
    ) {
      presentationBodyOpen = false;
    }
    if (!state.stack.length) state.rootClosed = true;
  }
  assertContentComplete(state, "ODP content");
  if (!pageCount) throw new Error("ODP presentation declares no pages.");
  if (hiddenPages > 0) {
    runtime.warn(
      `${hiddenPages.toLocaleString("en-US")} hidden ODP ${hiddenPages === 1 ? "page is" : "pages are"} included in the text export.`,
    );
  }
  if (presentationBodyOpen || pageActive || paragraphDepth !== 0 || ignoredDepth !== 0) {
    throw new Error("ODP content XML state is incomplete.");
  }
}

async function extractOds(
  runtime: OdfRuntime,
  entry: ZipEntry,
  writer: ReturnType<typeof createOutputWriter>,
): Promise<void> {
  const source = await openZipEntryStream(runtime, entry);
  const state = createContentXmlState();
  let prefixes: NamespacePrefixes | null = null;
  let spreadsheetBodyOpen = false;
  let tableDepth = 0;
  let selectedTable = false;
  let selectedFound = false;
  let visibleTables = 0;
  let hiddenTables = 0;
  let outputRows = 0;
  let row: OdsRow | null = null;
  let cell: OdsCell | null = null;
  let annotationDepth = 0;
  let formulasWithoutValues = 0;

  for await (const token of readMarkupTokens(source, runtime, "ODS content")) {
    runtime.assertActive();
    if (token.kind === "text") {
      const value = decodeTokenText(token.value, token.cdata, "ODS content text");
      if (!state.stack.length && value.trim()) {
        throw new Error("ODS content contains text outside its root.");
      }
      if (cell && annotationDepth === 0 && cell.paragraphDepth > 0) {
        appendCellText(cell, row, value);
      }
      continue;
    }
    if (token.kind === "start") {
      const element = parseContentStart(token.value, "ODS content", state);
      if (!prefixes) prefixes = contentPrefixes(element);
      if (!prefixes.table) throw new Error("ODS content lacks its table namespace.");
      const parentName = state.stack.at(-1)?.name;
      const officeSpreadsheet = isNs(
        element.name,
        prefixes.office,
        "spreadsheet",
      );
      if (officeSpreadsheet && parentName === `${prefixes.office}:body`) {
        if (spreadsheetBodyOpen) {
          throw new Error("ODS content contains nested office:spreadsheet bodies.");
        }
        spreadsheetBodyOpen = !element.selfClosing;
      }
      const tableElement = isNs(element.name, prefixes.table, "table");
      if (tableElement && spreadsheetBodyOpen) {
        if (tableDepth === 0) {
          const display = attributeMap(element.attributes).get("display") ?? "true";
          if (display !== "true" && display !== "false") {
            throw new Error("ODS sheet has an invalid table:display value.");
          }
          const visible = display === "true";
          if (visible) visibleTables += 1;
          else hiddenTables += 1;
          selectedTable = visible && !selectedFound;
          if (selectedTable) selectedFound = true;
        }
        if (!element.selfClosing) tableDepth += 1;
        else if (tableDepth === 0) selectedTable = false;
      } else if (
        cell &&
        (annotationDepth > 0 || isNs(element.name, prefixes.office, "annotation"))
      ) {
        if (!element.selfClosing) annotationDepth += 1;
      } else if (
        selectedTable &&
        tableDepth === 1 &&
        isNs(element.name, prefixes.table, "table-row")
      ) {
        if (row) throw new Error("ODS sheet contains nested table rows.");
        const repeat = repeatedCount(
          attributeMap(element.attributes).get("number-rows-repeated"),
          "row",
        );
        if (outputRows + repeat > MAX_ODS_ROWS) {
          throw new Error("ODS sheet rows exceed the 1,048,576-row safety limit.");
        }
        row = {
          cells: [],
          repeat,
          columns: 0,
          characters: 0,
          missingFormulaValues: 0,
        };
      } else if (
        row &&
        tableDepth === 1 &&
        (isNs(element.name, prefixes.table, "table-cell") ||
          isNs(element.name, prefixes.table, "covered-table-cell"))
      ) {
        if (cell) throw new Error("ODS row contains nested table cells.");
        cell = createOdsCell(element, prefixes);
        if (row.columns + cell.repeat > MAX_ODS_COLUMNS) {
          throw new Error("ODS sheet columns exceed the 16,384-column safety limit.");
        }
      } else if (cell && isNs(element.name, prefixes.text, "p")) {
        if (cell.paragraphDepth !== 0) {
          throw new Error("ODS cell contains nested text paragraphs.");
        }
        if (cell.paragraphs > 0) appendCellText(cell, row, "\n");
        cell.paragraphs += 1;
        cell.paragraphDepth = element.selfClosing ? 0 : 1;
      } else if (cell && cell.paragraphDepth > 0) {
        if (isNs(element.name, prefixes.text, "tab")) {
          appendCellText(cell, row, "\t");
        } else if (isNs(element.name, prefixes.text, "line-break")) {
          appendCellText(cell, row, "\n");
        } else if (isNs(element.name, prefixes.text, "s")) {
          appendCellSpaces(
            cell,
            row,
            repeatedSpaces(attributeMap(element.attributes).get("c")),
          );
        }
      }

      if (element.selfClosing) {
        if (cell && tableDepth === 1 && prefixes && (
          isNs(element.name, prefixes.table!, "table-cell") ||
          isNs(element.name, prefixes.table!, "covered-table-cell")
        )) {
          finishCell(row, cell);
          cell = null;
        }
        if (
          row &&
          tableDepth === 1 &&
          prefixes &&
          isNs(element.name, prefixes.table!, "table-row")
        ) {
          formulasWithoutValues += row.missingFormulaValues * row.repeat;
          outputRows = await writeOdsRow(writer, row, outputRows);
          row = null;
        }
      }
      pushContentElement(state, element, "ODS content");
      if (element.selfClosing && !state.stack.length) state.rootClosed = true;
      continue;
    }
    const opened = closeContentElement(state, token.value, "ODS content");
    if (annotationDepth > 0) {
      annotationDepth -= 1;
      if (!state.stack.length) state.rootClosed = true;
      continue;
    }
    if (cell && prefixes && isNs(opened.name, prefixes.text, "p")) {
      if (cell.paragraphDepth !== 1) throw new Error("ODS cell paragraph state is invalid.");
      cell.paragraphDepth = 0;
    }
    if (cell && tableDepth === 1 && prefixes?.table && (
      isNs(opened.name, prefixes.table, "table-cell") ||
      isNs(opened.name, prefixes.table, "covered-table-cell")
    )) {
      finishCell(row, cell);
      cell = null;
    }
    if (
      row &&
      tableDepth === 1 &&
      prefixes?.table &&
      isNs(opened.name, prefixes.table, "table-row")
    ) {
      formulasWithoutValues += row.missingFormulaValues * row.repeat;
      outputRows = await writeOdsRow(writer, row, outputRows);
      row = null;
    }
    if (prefixes?.table && isNs(opened.name, prefixes.table, "table")) {
      tableDepth -= 1;
      if (tableDepth < 0) throw new Error("ODS table nesting state is invalid.");
      if (tableDepth === 0) selectedTable = false;
    }
    if (
      prefixes &&
      opened.name === `${prefixes.office}:spreadsheet`
    ) {
      spreadsheetBodyOpen = false;
    }
    if (!state.stack.length) state.rootClosed = true;
  }
  assertContentComplete(state, "ODS content");
  if (!selectedFound) throw new Error("ODS document has no visible sheet.");
  if (visibleTables > 1) {
    runtime.warn(
      `${(visibleTables - 1).toLocaleString("en-US")} additional visible ODS ${(visibleTables - 1) === 1 ? "sheet was" : "sheets were"} omitted; CSV represents one sheet.`,
    );
  }
  if (hiddenTables > 0) {
    runtime.warn(
      `${hiddenTables.toLocaleString("en-US")} hidden ODS ${hiddenTables === 1 ? "sheet was" : "sheets were"} omitted.`,
    );
  }
  if (formulasWithoutValues > 0) {
    runtime.warn(
      `${formulasWithoutValues.toLocaleString("en-US")} ODS ${formulasWithoutValues === 1 ? "formula had" : "formulas had"} no cached result and ${formulasWithoutValues === 1 ? "was" : "were"} exported as an empty field.`,
    );
  }
  if (spreadsheetBodyOpen || tableDepth !== 0 || row || cell || annotationDepth !== 0) {
    throw new Error("ODS content XML state is incomplete.");
  }
}

function createOdsCell(
  element: ParsedStartElement,
  prefixes: NamespacePrefixes,
): OdsCell {
  const attributes = attributeMap(element.attributes);
  const repeat = repeatedCount(attributes.get("number-columns-repeated"), "column");
  const covered = isNs(element.name, prefixes.table!, "covered-table-cell");
  const formula = attributes.has("formula");
  const valueType = attributes.get("value-type") ?? "";
  let cachedValue = "";
  if (!covered) {
    switch (valueType) {
      case "float":
      case "percentage":
      case "currency":
        cachedValue = attributes.get("value") ?? "";
        break;
      case "boolean": {
        const value = attributes.get("boolean-value");
        if (value && !["true", "false", "0", "1"].includes(value)) {
          throw new Error("ODS Boolean cell has an invalid cached value.");
        }
        cachedValue = value === "true" || value === "1"
          ? "TRUE"
          : value === "false" || value === "0"
            ? "FALSE"
            : "";
        break;
      }
      case "date":
        cachedValue = attributes.get("date-value") ?? "";
        break;
      case "time":
        cachedValue = attributes.get("time-value") ?? "";
        break;
      case "string":
        cachedValue = attributes.get("string-value") ?? "";
        break;
      case "":
        break;
      default:
        throw new Error(`Unsupported ODS cell value type: ${valueType}.`);
    }
  }
  if (cachedValue.length > MAX_CELL_CHARS) {
    throw new Error("An ODS cached cell value exceeds the 1 MiB safety limit.");
  }
  return {
    text: "",
    repeat,
    paragraphs: 0,
    paragraphDepth: 0,
    covered,
    formula,
    cachedValue,
  };
}

function appendCellText(cell: OdsCell, row: OdsRow | null, value: string): void {
  if (!row) throw new Error("ODS cell appears outside a row.");
  cell.text += value;
  row.characters += value.length;
  if (cell.text.length > MAX_CELL_CHARS || row.characters > MAX_ROW_CHARS) {
    throw new Error("ODS cell or row text exceeds the 1 MiB memory safety limit.");
  }
}

function appendCellSpaces(cell: OdsCell, row: OdsRow | null, count: number): void {
  for (let remaining = count; remaining > 0;) {
    const chunk = Math.min(remaining, 8192);
    appendCellText(cell, row, " ".repeat(chunk));
    remaining -= chunk;
  }
}

function finishCell(row: OdsRow | null, cell: OdsCell): void {
  if (!row) throw new Error("ODS cell closes outside a row.");
  if (cell.paragraphDepth !== 0) {
    throw new Error("ODS cell closes before its text paragraph.");
  }
  const value = cell.covered ? "" : cell.text || cell.cachedValue;
  if (!cell.text) row.characters += value.length;
  if (row.characters > MAX_ROW_CHARS) {
    throw new Error("ODS row text exceeds the 1 MiB memory safety limit.");
  }
  if (cell.formula && !value) row.missingFormulaValues += cell.repeat;
  row.cells.push({ value, repeat: cell.repeat });
  row.columns += cell.repeat;
}

async function writeOdsRow(
  writer: ReturnType<typeof createOutputWriter>,
  row: OdsRow,
  outputRows: number,
): Promise<number> {
  for (let repeated = 0; repeated < row.repeat; repeated += 1) {
    let column = 0;
    for (const cell of row.cells) {
      for (let cellRepeat = 0; cellRepeat < cell.repeat; cellRepeat += 1) {
        await writer.write(`${column > 0 ? "," : ""}${escapeCsv(cell.value)}`);
        column += 1;
      }
    }
    await writer.write("\r\n");
    outputRows += 1;
  }
  return outputRows;
}

function repeatedCount(value: string | undefined, label: string): number {
  if (value === undefined) return 1;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`ODS repeated ${label} count is invalid.`);
  }
  const count = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(count)) {
    throw new Error(`ODS repeated ${label} count is too large.`);
  }
  return count;
}

function repeatedSpaces(value: string | undefined): number {
  const count = repeatedCount(value, "space");
  if (count > MAX_REPEATED_SPACES) {
    throw new Error("OpenDocument explicit spaces exceed the 1 MiB safety limit.");
  }
  return count;
}

async function handleTextStart(
  writer: ReturnType<typeof createOutputWriter>,
  element: ParsedStartElement,
  prefixes: NamespacePrefixes,
  paragraphDepth: number,
  label: string,
): Promise<number> {
  const paragraph =
    isNs(element.name, prefixes.text, "p") ||
    isNs(element.name, prefixes.text, "h");
  if (paragraph) {
    if (paragraphDepth !== 0) {
      throw new Error(`${label} contains nested text paragraphs.`);
    }
    if (element.selfClosing) {
      await writer.write("\n");
      return 0;
    }
    return 1;
  }
  if (paragraphDepth > 0) {
    if (isNs(element.name, prefixes.text, "tab")) {
      await writer.write("\t");
    } else if (isNs(element.name, prefixes.text, "line-break")) {
      await writer.write("\n");
    } else if (isNs(element.name, prefixes.text, "s")) {
      let spaces = repeatedSpaces(attributeMap(element.attributes).get("c"));
      while (spaces > 0) {
        const chunk = Math.min(spaces, 8192);
        await writer.write(" ".repeat(chunk));
        spaces -= chunk;
      }
    }
  }
  return paragraphDepth;
}

async function handleTextEnd(
  writer: ReturnType<typeof createOutputWriter>,
  opened: XmlStackEntry,
  prefixes: NamespacePrefixes,
  paragraphDepth: number,
  label: string,
): Promise<number> {
  if (
    isNs(opened.name, prefixes.text, "p") ||
    isNs(opened.name, prefixes.text, "h")
  ) {
    if (paragraphDepth !== 1) {
      throw new Error(`${label} text paragraph state is invalid.`);
    }
    await writer.write("\n");
    return 0;
  }
  return paragraphDepth;
}

function createContentXmlState() {
  return {
    stack: [] as XmlStackEntry[],
    rootSeen: false,
    rootClosed: false,
  };
}

function parseContentStart(
  value: string,
  label: string,
  state: ReturnType<typeof createContentXmlState>,
): ParsedStartElement {
  if (state.rootClosed) throw new Error(`${label} has multiple XML roots.`);
  const element = parseStartElement(value, label);
  if (!state.rootSeen) {
    if (
      localName(element.name) !== "document-content" ||
      !hasElementNamespace(element.name, element.attributes, OFFICE_NAMESPACE)
    ) {
      throw new Error(`${label} has no office:document-content root.`);
    }
    state.rootSeen = true;
  }
  return element;
}

function pushContentElement(
  state: ReturnType<typeof createContentXmlState>,
  element: ParsedStartElement,
  label: string,
): void {
  if (element.selfClosing) return;
  if (state.stack.length >= MAX_XML_DEPTH) {
    throw new Error(`${label} exceeds the ${MAX_XML_DEPTH}-element nesting limit.`);
  }
  state.stack.push({ name: element.name, local: localName(element.name) });
}

function closeContentElement(
  state: ReturnType<typeof createContentXmlState>,
  value: string,
  label: string,
): XmlStackEntry {
  const name = parseEndElement(value, label);
  const opened = state.stack.pop();
  if (!opened || opened.name !== name) {
    throw new Error(
      `${label} closing element </${name}> does not match ${opened ? `<${opened.name}>` : "an open element"}.`,
    );
  }
  return opened;
}

function assertContentComplete(
  state: ReturnType<typeof createContentXmlState>,
  label: string,
): void {
  if (!state.rootSeen || !state.rootClosed || state.stack.length) {
    throw new Error(`${label} has no complete XML root.`);
  }
}

function contentPrefixes(element: ParsedStartElement): NamespacePrefixes {
  const office = namespacePrefix(element.attributes, OFFICE_NAMESPACE);
  const text = namespacePrefix(element.attributes, TEXT_NAMESPACE);
  if (!office || !text) {
    throw new Error("OpenDocument content lacks office or text namespaces.");
  }
  return {
    office,
    text,
    table: namespacePrefix(element.attributes, TABLE_NAMESPACE),
    draw: namespacePrefix(element.attributes, DRAW_NAMESPACE),
    presentation: namespacePrefix(element.attributes, PRESENTATION_NAMESPACE),
  };
}

function namespacePrefix(
  attributes: readonly { name: string; value: string }[],
  namespace: string,
): string | null {
  const declaration = attributes.find(
    (attribute) =>
      attribute.name.startsWith("xmlns:") && attribute.value === namespace,
  );
  return declaration ? declaration.name.slice(6) : null;
}

function isNs(name: string, prefix: string, local: string): boolean {
  return name === `${prefix}:${local}`;
}

async function parseMetadataXml(
  runtime: OdfRuntime,
  entry: ZipEntry,
  label: string,
  onStart: (
    element: ParsedStartElement,
    parentLocal: string | null,
    root: boolean,
  ) => void,
): Promise<void> {
  if (entry.uncompressedSize > MAX_PACKAGE_METADATA_BYTES) {
    throw new Error(`OpenDocument ${label} exceeds the 2 MiB safety limit.`);
  }
  const source = await openZipEntryStream(runtime, entry);
  const stack: XmlStackEntry[] = [];
  let rootSeen = false;
  let rootClosed = false;
  for await (const token of readMarkupTokens(source, runtime, `OpenDocument ${label}`)) {
    runtime.assertActive();
    if (token.kind === "text") {
      const value = decodeTokenText(
        token.value,
        token.cdata,
        `OpenDocument ${label} text`,
      );
      if (!stack.length && value.trim()) {
        throw new Error(`OpenDocument ${label} contains text outside its root.`);
      }
      continue;
    }
    if (token.kind === "start") {
      if (rootClosed) throw new Error(`OpenDocument ${label} has multiple roots.`);
      const element = parseStartElement(token.value, `OpenDocument ${label}`);
      const root = !rootSeen;
      if (root) rootSeen = true;
      onStart(element, stack.at(-1)?.local ?? null, root);
      if (element.selfClosing) {
        if (!stack.length) rootClosed = true;
      } else {
        if (stack.length >= MAX_XML_DEPTH) {
          throw new Error(
            `OpenDocument ${label} exceeds the ${MAX_XML_DEPTH}-element nesting limit.`,
          );
        }
        stack.push({ name: element.name, local: localName(element.name) });
      }
      continue;
    }
    const name = parseEndElement(token.value, `OpenDocument ${label}`);
    const opened = stack.pop();
    if (!opened || opened.name !== name) {
      throw new Error(`OpenDocument ${label} has mismatched XML elements.`);
    }
    if (!stack.length) rootClosed = true;
  }
  if (!rootSeen || !rootClosed || stack.length) {
    throw new Error(`OpenDocument ${label} has no complete XML root.`);
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
      throw new Error(`OpenDocument XML contains ambiguous attribute ${local}.`);
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

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function createOutputWriter(runtime: OdfRuntime) {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(IO_CHUNK_BYTES);
  let used = 0;
  const flush = async () => {
    if (!used) return;
    await runtime.write(buffer.slice(0, used), "Writing OpenDocument output");
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
