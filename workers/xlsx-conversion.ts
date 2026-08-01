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
const MAX_SHARED_STRINGS_XML_BYTES = 64 * 1024 * 1024;
const MAX_SHARED_STRINGS = 262_144;
const MAX_SHARED_STRING_CHARS = 8 * 1024 * 1024;
const MAX_CELL_CHARS = 1024 * 1024;
const MAX_XML_DEPTH = 256;
const MAX_WORKBOOK_SHEETS = 16_384;
const MAX_WORKSHEET_ROWS = 1_048_576;
const MAX_WORKSHEET_COLUMNS = 16_384;
const CONTENT_TYPES_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const SPREADSHEET_NAMESPACE =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const WORKSHEET_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const SHARED_STRINGS_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings";
const WORKBOOK_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";

interface XlsxRuntime extends ArchiveReadRuntime {
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  warn(message: string): void;
}

interface XmlStackEntry {
  name: string;
  local: string;
}

interface WorkbookSheet {
  name: string;
  relationshipId: string;
  visible: boolean;
}

interface PackageRelationship {
  target: string;
  type: string;
}

interface ActiveCell {
  column: number;
  type: string;
  value: string;
  inline: string;
  valueDepth: number;
  inlineTextDepth: number;
  phoneticDepth: number;
  formulaSeen: boolean;
}

export async function runXlsxToCsv(runtime: XlsxRuntime): Promise<void> {
  runtime.warn(
    "XLSX-to-CSV exports only the first visible worksheet. Additional visible sheets, hidden sheets, workbook metadata, charts, drawings, comments, hyperlinks, images, macros, and print layout are omitted.",
  );
  runtime.warn(
    "Cell coordinates, empty gaps, numbers, Booleans, errors, inline strings, and bounded rich shared strings are preserved. Formulas are not recalculated; only stored cached results are exported.",
  );
  runtime.warn(
    "Excel number formats and styles are not rendered, so dates and formatted numbers are emitted as their stored values.",
  );

  runtime.progress("Inspecting XLSX package");
  const entries = await readZipDirectory(runtime);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  if ([...byName.keys()].some((name) => name.toLowerCase() === "xl/vbaproject.bin")) {
    throw new Error("Macro-enabled spreadsheet packages are not accepted.");
  }
  await validateContentTypes(runtime, requiredEntry(byName, "[Content_Types].xml"));
  const workbookPath = await readRootRelationships(
    runtime,
    requiredEntry(byName, "_rels/.rels"),
  );
  const workbookEntry = requiredEntry(byName, workbookPath);
  const sheets = await readWorkbook(runtime, workbookEntry);
  const selected = sheets.find((sheet) => sheet.visible);
  if (!selected) throw new Error("XLSX workbook has no visible worksheet.");
  const additionalVisible = sheets.filter((sheet) => sheet.visible).length - 1;
  const hidden = sheets.filter((sheet) => !sheet.visible).length;
  if (additionalVisible > 0) {
    runtime.warn(
      `${additionalVisible.toLocaleString("en-US")} additional visible XLSX ${additionalVisible === 1 ? "worksheet was" : "worksheets were"} omitted; CSV represents one sheet.`,
    );
  }
  if (hidden > 0) {
    runtime.warn(
      `${hidden.toLocaleString("en-US")} hidden XLSX ${hidden === 1 ? "worksheet was" : "worksheets were"} omitted.`,
    );
  }

  const relationshipPath = relationshipPartPath(workbookPath);
  const relationships = await readWorkbookRelationships(
    runtime,
    requiredEntry(byName, relationshipPath),
    workbookPath,
  );
  const worksheetRelationship = relationships.get(selected.relationshipId);
  if (!worksheetRelationship || worksheetRelationship.type !== WORKSHEET_RELATIONSHIP) {
    throw new Error(
      `XLSX worksheet ${selected.name} has no valid worksheet relationship.`,
    );
  }
  const worksheetEntry = requiredEntry(byName, worksheetRelationship.target);
  const sharedRelationship = [...relationships.values()].find(
    (relationship) => relationship.type === SHARED_STRINGS_RELATIONSHIP,
  );
  const sharedStrings = sharedRelationship
    ? await readSharedStrings(
        runtime,
        requiredEntry(byName, sharedRelationship.target),
      )
    : [];

  runtime.progress(`Exporting XLSX worksheet ${selected.name}`);
  const result = await writeWorksheetCsv(
    runtime,
    worksheetEntry,
    sharedStrings,
  );
  if (result.formulasWithoutValues > 0) {
    runtime.warn(
      `${result.formulasWithoutValues.toLocaleString("en-US")} XLSX ${result.formulasWithoutValues === 1 ? "formula had" : "formulas had"} no cached result and ${result.formulasWithoutValues === 1 ? "was" : "were"} exported as an empty field.`,
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
    throw new Error(`XLSX package is missing required part ${name}.`);
  }
  return entry;
}

async function validateContentTypes(
  runtime: XlsxRuntime,
  entry: ZipEntry,
): Promise<void> {
  let valid = false;
  await parseMetadataXml(runtime, entry, "content types", (element, _parent, root) => {
    const local = localName(element.name);
    if (root && (
      local !== "Types" ||
      !hasElementNamespace(element.name, element.attributes, CONTENT_TYPES_NAMESPACE)
    )) {
      throw new Error("XLSX content types have an invalid package root.");
    }
    if (local !== "Override") return;
    const attributes = attributeMap(element.attributes);
    if (
      attributes.get("PartName") === "/xl/workbook.xml" &&
      attributes.get("ContentType") === WORKBOOK_CONTENT_TYPE
    ) {
      valid = true;
    }
  });
  if (!valid) {
    throw new Error(
      "XLSX content types do not identify xl/workbook.xml as a standard workbook.",
    );
  }
}

async function readRootRelationships(
  runtime: XlsxRuntime,
  entry: ZipEntry,
): Promise<string> {
  let workbookPath: string | null = null;
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
      throw new Error("XLSX root relationships have an invalid package root.");
    }
    if (local !== "Relationship") return;
    const attributes = attributeMap(element.attributes);
    if (attributes.get("Type") !== OFFICE_DOCUMENT_RELATIONSHIP) return;
    if (attributes.get("TargetMode")?.toLowerCase() === "external") {
      throw new Error("XLSX workbook relationship cannot be external.");
    }
    const target = attributes.get("Target");
    if (!target) throw new Error("XLSX workbook relationship has no target.");
    const resolved = resolveOpcPath("", target);
    if (workbookPath && workbookPath !== resolved) {
      throw new Error("XLSX package has multiple workbook relationships.");
    }
    workbookPath = resolved;
  });
  if (workbookPath !== "xl/workbook.xml") {
    throw new Error("XLSX root relationships do not target xl/workbook.xml.");
  }
  return workbookPath;
}

async function readWorkbook(
  runtime: XlsxRuntime,
  entry: ZipEntry,
): Promise<WorkbookSheet[]> {
  const sheets: WorkbookSheet[] = [];
  const sheetNames = new Set<string>();
  const relationshipIds = new Set<string>();
  let relationshipPrefix: string | null = null;
  await parseMetadataXml(
    runtime,
    entry,
    "workbook",
    (element, parent, root) => {
      const local = localName(element.name);
      if (root) {
        if (
          local !== "workbook" ||
          !hasElementNamespace(
            element.name,
            element.attributes,
            SPREADSHEET_NAMESPACE,
          )
        ) {
          throw new Error("XLSX workbook has no SpreadsheetML workbook root.");
        }
        const namespace = element.attributes.find(
          (attribute) => attribute.value === OFFICE_RELATIONSHIP_NAMESPACE,
        );
        if (!namespace?.name.startsWith("xmlns:")) {
          throw new Error("XLSX workbook lacks its relationship namespace.");
        }
        relationshipPrefix = namespace.name.slice(6);
      }
      if (local !== "sheet" || parent !== "sheets") return;
      const attributes = new Map(
        element.attributes.map((attribute) => [attribute.name, attribute.value]),
      );
      const name = attributes.get("name");
      const relationshipId = relationshipPrefix
        ? attributes.get(`${relationshipPrefix}:id`)
        : null;
      if (!name || !relationshipId) {
        throw new Error("XLSX workbook sheet lacks a name or relationship id.");
      }
      const state = attributes.get("state") ?? "visible";
      if (state !== "visible" && state !== "hidden" && state !== "veryHidden") {
        throw new Error(`XLSX worksheet ${name} has an invalid visibility state.`);
      }
      if (sheetNames.has(name) || relationshipIds.has(relationshipId)) {
        throw new Error("XLSX workbook has duplicate sheet names or relationship ids.");
      }
      sheetNames.add(name);
      relationshipIds.add(relationshipId);
      sheets.push({
        name,
        relationshipId,
        visible: state === "visible",
      });
      if (sheets.length > MAX_WORKBOOK_SHEETS) {
        throw new Error("XLSX workbook contains too many sheet declarations.");
      }
    },
  );
  if (!sheets.length) throw new Error("XLSX workbook declares no worksheets.");
  return sheets;
}

async function readWorkbookRelationships(
  runtime: XlsxRuntime,
  entry: ZipEntry,
  workbookPath: string,
): Promise<Map<string, PackageRelationship>> {
  const relationships = new Map<string, PackageRelationship>();
  const seenIds = new Set<string>();
  await parseMetadataXml(
    runtime,
    entry,
    "workbook relationships",
    (element, _parent, root) => {
      const local = localName(element.name);
      if (root) {
        if (
          local !== "Relationships" ||
          !hasElementNamespace(
            element.name,
            element.attributes,
            PACKAGE_RELATIONSHIP_NAMESPACE,
          )
        ) {
          throw new Error("XLSX workbook relationships have an invalid root.");
        }
      }
      if (local !== "Relationship") return;
      const attributes = attributeMap(element.attributes);
      const id = attributes.get("Id");
      const type = attributes.get("Type");
      const target = attributes.get("Target");
      if (!id || !type || !target) {
        throw new Error("XLSX workbook relationship is incomplete.");
      }
      if (seenIds.has(id)) {
        throw new Error(`XLSX workbook relationships duplicate id ${id}.`);
      }
      seenIds.add(id);
      if (attributes.get("TargetMode")?.toLowerCase() === "external") return;
      relationships.set(id, {
        type,
        target: resolveOpcPath(workbookPath, target),
      });
    },
  );
  return relationships;
}

async function readSharedStrings(
  runtime: XlsxRuntime,
  entry: ZipEntry,
): Promise<string[]> {
  if (entry.uncompressedSize > MAX_SHARED_STRINGS_XML_BYTES) {
    throw new Error("XLSX sharedStrings.xml exceeds the 64 MiB safety limit.");
  }
  const source = await openZipEntryStream(runtime, entry);
  const stack: XmlStackEntry[] = [];
  const output: string[] = [];
  let rootSeen = false;
  let rootClosed = false;
  let current: string | null = null;
  let textDepth = 0;
  let phoneticDepth = 0;
  let totalCharacters = 0;
  const pushSharedString = (value: string) => {
    totalCharacters += value.length;
    if (
      output.length >= MAX_SHARED_STRINGS ||
      totalCharacters > MAX_SHARED_STRING_CHARS
    ) {
      throw new Error(
        "XLSX shared strings exceed the 262,144-item or 8 MiB character memory limit.",
      );
    }
    output.push(value);
  };

  for await (const token of readMarkupTokens(source, runtime, "XLSX shared strings")) {
    runtime.assertActive();
    if (token.kind === "text") {
      const value = decodeTokenText(token.value, token.cdata, "XLSX shared string");
      if (!stack.length && value.trim()) {
        throw new Error("XLSX shared strings contain text outside their root.");
      }
      if (current !== null && textDepth > 0 && phoneticDepth === 0) {
        current += value;
        if (current.length > MAX_CELL_CHARS) {
          throw new Error("An XLSX shared string exceeds the 1 MiB cell limit.");
        }
      }
      continue;
    }
    if (token.kind === "start") {
      if (rootClosed) throw new Error("XLSX shared strings have multiple roots.");
      const element = parseStartElement(token.value, "XLSX shared strings");
      const local = localName(element.name);
      if (!rootSeen) {
        if (
          local !== "sst" ||
          !hasElementNamespace(
            element.name,
            element.attributes,
            SPREADSHEET_NAMESPACE,
          )
        ) {
          throw new Error("XLSX shared strings have no SpreadsheetML sst root.");
        }
        rootSeen = true;
      }
      if (local === "si") {
        if (stack.at(-1)?.local !== "sst") {
          throw new Error("XLSX shared strings contain an si outside the sst root.");
        }
        if (current !== null) throw new Error("XLSX shared strings contain nested si elements.");
        current = "";
      }
      if (local === "rPh") phoneticDepth += 1;
      if (local === "t" && current !== null) textDepth += 1;
      if (element.selfClosing) {
        if (local === "t" && current !== null) textDepth -= 1;
        if (local === "rPh") phoneticDepth -= 1;
        if (local === "si") {
          pushSharedString("");
          current = null;
        }
        if (!stack.length) rootClosed = true;
      } else {
        pushElement(stack, element.name, local, "shared strings");
      }
      continue;
    }
    const opened = closeElement(
      stack,
      parseEndElement(token.value, "XLSX shared strings"),
      "shared strings",
    );
    if (opened.local === "t" && current !== null) textDepth -= 1;
    if (opened.local === "rPh") phoneticDepth -= 1;
    if (opened.local === "si") {
      if (current === null) throw new Error("XLSX shared string state is invalid.");
      pushSharedString(current);
      current = null;
    }
    if (!stack.length) rootClosed = true;
  }
  assertCompleteXml(stack, rootSeen, rootClosed, "shared strings");
  if (current !== null || textDepth !== 0 || phoneticDepth !== 0) {
    throw new Error("XLSX shared string XML state is incomplete.");
  }
  return output;
}

async function writeWorksheetCsv(
  runtime: XlsxRuntime,
  entry: ZipEntry,
  sharedStrings: readonly string[],
): Promise<{ formulasWithoutValues: number }> {
  const writer = createCsvWriter(runtime);
  const source = await openZipEntryStream(runtime, entry);
  const stack: XmlStackEntry[] = [];
  let rootSeen = false;
  let rootClosed = false;
  let sheetDataDepth = 0;
  let sheetDataSeen = false;
  let rowActive = false;
  let rowNumber = 0;
  let lastRow = 0;
  let lastColumn = 0;
  let cell: ActiveCell | null = null;
  let formulasWithoutValues = 0;

  for await (const token of readMarkupTokens(source, runtime, "XLSX worksheet")) {
    runtime.assertActive();
    if (token.kind === "text") {
      const value = decodeTokenText(token.value, token.cdata, "XLSX worksheet text");
      if (!stack.length && value.trim()) {
        throw new Error("XLSX worksheet contains text outside its root.");
      }
      if (cell) {
        if (cell.valueDepth > 0) cell.value += value;
        if (cell.inlineTextDepth > 0 && cell.phoneticDepth === 0) {
          cell.inline += value;
        }
        if (
          cell.value.length > MAX_CELL_CHARS ||
          cell.inline.length > MAX_CELL_CHARS
        ) {
          throw new Error("An XLSX cell exceeds the 1 MiB text safety limit.");
        }
      }
      continue;
    }
    if (token.kind === "start") {
      if (rootClosed) throw new Error("XLSX worksheet has multiple XML roots.");
      const element = parseStartElement(token.value, "XLSX worksheet");
      const local = localName(element.name);
      const parent = stack.at(-1)?.local;
      if (!rootSeen) {
        if (
          local !== "worksheet" ||
          !hasElementNamespace(
            element.name,
            element.attributes,
            SPREADSHEET_NAMESPACE,
          )
        ) {
          throw new Error("XLSX worksheet has no SpreadsheetML worksheet root.");
        }
        rootSeen = true;
      }
      if (local === "sheetData") {
        if (parent !== "worksheet" || sheetDataSeen || sheetDataDepth !== 0) {
          throw new Error("XLSX worksheet has invalid or duplicate sheetData.");
        }
        sheetDataSeen = true;
        sheetDataDepth = 1;
      }
      if (local === "row" && parent === "sheetData") {
        if (rowActive) throw new Error("XLSX worksheet contains nested rows.");
        const attributes = attributeMap(element.attributes);
        const declared = attributes.get("r");
        rowNumber = declared ? parsePositiveInteger(declared, "row number") : lastRow + 1;
        if (rowNumber <= lastRow || rowNumber > MAX_WORKSHEET_ROWS) {
          throw new Error("XLSX worksheet rows are out of order or exceed Excel limits.");
        }
        for (let missing = lastRow + 1; missing < rowNumber; missing += 1) {
          await writer.newline();
        }
        rowActive = true;
        lastColumn = 0;
      } else if (local === "c" && parent === "row") {
        if (!rowActive || cell) throw new Error("XLSX worksheet cell nesting is invalid.");
        const attributes = attributeMap(element.attributes);
        const reference = attributes.get("r");
        const column = reference
          ? parseCellReference(reference, rowNumber)
          : lastColumn + 1;
        if (column <= lastColumn || column > MAX_WORKSHEET_COLUMNS) {
          throw new Error("XLSX worksheet cells are out of order or exceed Excel limits.");
        }
        cell = {
          column,
          type: attributes.get("t") ?? "n",
          value: "",
          inline: "",
          valueDepth: 0,
          inlineTextDepth: 0,
          phoneticDepth: 0,
          formulaSeen: false,
        };
      }
      if (cell) {
        if (local === "v" && parent === "c") cell.valueDepth += 1;
        if (local === "f" && parent === "c") cell.formulaSeen = true;
        if (local === "rPh") cell.phoneticDepth += 1;
        if (local === "t" && isInsideInlineString(stack)) {
          cell.inlineTextDepth += 1;
        }
      }
      if (element.selfClosing) {
        if (cell) {
          if (local === "v" && parent === "c") cell.valueDepth -= 1;
          if (local === "rPh") cell.phoneticDepth -= 1;
          if (local === "t" && isInsideInlineString(stack)) {
            cell.inlineTextDepth -= 1;
          }
          if (local === "c") {
            await writeCell(writer, cell, lastColumn, sharedStrings);
            lastColumn = cell.column;
            cell = null;
          }
        }
        if (local === "row") {
          await writer.newline();
          rowActive = false;
          lastRow = rowNumber;
        }
        if (local === "sheetData") sheetDataDepth -= 1;
        if (!stack.length) rootClosed = true;
      } else {
        pushElement(stack, element.name, local, "worksheet");
      }
      continue;
    }

    const opened = closeElement(
      stack,
      parseEndElement(token.value, "XLSX worksheet"),
      "worksheet",
    );
    if (cell) {
      if (opened.local === "v") cell.valueDepth -= 1;
      if (opened.local === "t" && cell.inlineTextDepth > 0) {
        cell.inlineTextDepth -= 1;
      }
      if (opened.local === "rPh") cell.phoneticDepth -= 1;
      if (opened.local === "c") {
        if (cell.formulaSeen && !cell.value && !cell.inline) {
          formulasWithoutValues += 1;
        }
        await writeCell(writer, cell, lastColumn, sharedStrings);
        lastColumn = cell.column;
        cell = null;
      }
    }
    if (opened.local === "row") {
      if (!rowActive) throw new Error("XLSX worksheet row state is invalid.");
      await writer.newline();
      rowActive = false;
      lastRow = rowNumber;
      if (lastRow % 4096 === 0) {
        runtime.progress(`Exported ${lastRow.toLocaleString("en-US")} XLSX rows`);
      }
    }
    if (opened.local === "sheetData") sheetDataDepth -= 1;
    if (!stack.length) rootClosed = true;
  }
  assertCompleteXml(stack, rootSeen, rootClosed, "worksheet");
  if (!sheetDataSeen || sheetDataDepth !== 0 || rowActive || cell) {
    throw new Error("XLSX worksheet XML state is incomplete.");
  }
  await writer.flush();
  return { formulasWithoutValues };
}

async function writeCell(
  writer: ReturnType<typeof createCsvWriter>,
  cell: ActiveCell,
  previousColumn: number,
  sharedStrings: readonly string[],
): Promise<void> {
  const separators = previousColumn === 0
    ? cell.column - 1
    : cell.column - previousColumn;
  if (separators > 0) await writer.write(",".repeat(separators));
  let value: string;
  switch (cell.type) {
    case "s": {
      if (!/^\d+$/.test(cell.value)) {
        throw new Error("XLSX shared-string cell has an invalid index.");
      }
      const index = Number.parseInt(cell.value, 10);
      if (index >= sharedStrings.length) {
        throw new Error(`XLSX shared-string index ${index} is unavailable.`);
      }
      value = sharedStrings[index];
      break;
    }
    case "inlineStr":
      value = cell.inline;
      break;
    case "b":
      if (cell.value !== "0" && cell.value !== "1") {
        throw new Error("XLSX Boolean cell must contain 0 or 1.");
      }
      value = cell.value === "1" ? "TRUE" : "FALSE";
      break;
    case "n":
    case "str":
    case "e":
    case "d":
      value = cell.value;
      break;
    default:
      throw new Error(`Unsupported XLSX cell type: ${cell.type}.`);
  }
  await writer.write(escapeCsv(value));
}

async function parseMetadataXml(
  runtime: XlsxRuntime,
  entry: ZipEntry,
  label: string,
  onStart: (
    element: ParsedStartElement,
    parentLocal: string | null,
    root: boolean,
  ) => void,
): Promise<void> {
  if (entry.uncompressedSize > MAX_PACKAGE_METADATA_BYTES) {
    throw new Error(`XLSX ${label} exceed the 2 MiB metadata safety limit.`);
  }
  const source = await openZipEntryStream(runtime, entry);
  const stack: XmlStackEntry[] = [];
  let rootSeen = false;
  let rootClosed = false;
  for await (const token of readMarkupTokens(source, runtime, `XLSX ${label}`)) {
    runtime.assertActive();
    if (token.kind === "text") {
      const value = decodeTokenText(token.value, token.cdata, `XLSX ${label} text`);
      if (!stack.length && value.trim()) {
        throw new Error(`XLSX ${label} contain text outside the root.`);
      }
      continue;
    }
    if (token.kind === "start") {
      if (rootClosed) throw new Error(`XLSX ${label} contain multiple roots.`);
      const element = parseStartElement(token.value, `XLSX ${label}`);
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
      parseEndElement(token.value, `XLSX ${label}`),
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
    throw new Error(`XLSX ${label} exceed the ${MAX_XML_DEPTH}-element nesting limit.`);
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
      `XLSX ${label} closing element </${name}> does not match ${opened ? `<${opened.name}>` : "an open element"}.`,
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
    throw new Error(`XLSX ${label} have no complete XML root.`);
  }
  if (stack.length) {
    throw new Error(`XLSX ${label} end before <${stack.at(-1)?.name}> closes.`);
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
      throw new Error(`XLSX XML contains ambiguous attribute ${local}.`);
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
    throw new Error(`Unsafe XLSX package reference: ${reference || "(empty)"}.`);
  }
  const withoutFragment = reference.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) {
    throw new Error(`Unsafe XLSX package reference: ${reference}.`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    throw new Error(`XLSX package reference has invalid percent encoding: ${reference}.`);
  }
  if (
    decoded.includes("\\") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded) ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    throw new Error(`Unsafe XLSX package reference: ${reference}.`);
  }
  const absolute = decoded.startsWith("/");
  const parts = (absolute ? decoded.slice(1) : decoded).split("/");
  if (parts.some((part) => part === "")) {
    throw new Error(`Unsafe XLSX package reference: ${reference}.`);
  }
  const output = absolute || !baseFile.includes("/")
    ? []
    : baseFile.slice(0, baseFile.lastIndexOf("/")).split("/");
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (!output.length) {
        throw new Error(`Unsafe XLSX package reference escapes its root: ${reference}.`);
      }
      output.pop();
    } else {
      output.push(part);
    }
  }
  if (!output.length) throw new Error(`Unsafe XLSX package reference: ${reference}.`);
  return output.join("/");
}

function parseCellReference(reference: string, expectedRow: number): number {
  const match = reference.match(/^([A-Z]{1,3})([1-9]\d*)$/);
  if (!match || Number.parseInt(match[2], 10) !== expectedRow) {
    throw new Error(`Invalid or mismatched XLSX cell reference: ${reference}.`);
  }
  let column = 0;
  for (const character of match[1]) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return column;
}

function parsePositiveInteger(value: string, label: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`XLSX ${label} is invalid.`);
  }
  const result = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(result)) throw new Error(`XLSX ${label} is too large.`);
  return result;
}

function isInsideInlineString(stack: readonly XmlStackEntry[]): boolean {
  return stack.some((entry) => entry.local === "is");
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function createCsvWriter(runtime: XlsxRuntime) {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(IO_CHUNK_BYTES);
  let used = 0;
  const flush = async () => {
    if (!used) return;
    await runtime.write(buffer.slice(0, used), "Writing XLSX CSV");
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
  return {
    write,
    async newline() {
      await write("\r\n");
    },
    flush,
  };
}
