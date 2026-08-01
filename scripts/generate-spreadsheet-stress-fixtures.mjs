import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "spreadsheets");
const fixturePath = path.join(fixtureRoot, "spreadsheet-128m.xlsx");
await mkdir(fixtureRoot, { recursive: true });

const prefix = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`;
const suffix = `</sheetData></worksheet>`;
const rowXml = (index) => {
  const id = String(index).padStart(8, "0");
  return `<row r="${index}"><c r="A${index}" t="inlineStr"><is><t>Within private XLSX row ${id} no upload bounded memory.</t></is></c><c r="C${index}" t="n"><v>${index}</v></c></row>`;
};
const targetWorksheetBytes = 129 * 1024 * 1024;
let rowCount = 0;
let worksheetBytes = Buffer.byteLength(prefix) + Buffer.byteLength(suffix);
while (worksheetBytes < targetWorksheetBytes && rowCount < 1_048_576) {
  rowCount += 1;
  worksheetBytes += Buffer.byteLength(rowXml(rowCount));
}
if (worksheetBytes < targetWorksheetBytes) {
  throw new Error("Could not reach the XLSX stress target within Excel row limits.");
}

const outputHash = createHash("sha256");
let outputBytes = 0;
const worksheetEntry = {
  name: "xl/worksheets/sheet1.xml",
  method: 0,
  size: worksheetBytes,
  async *chunks() {
    yield Buffer.from(prefix);
    for (let start = 1; start <= rowCount; start += 4096) {
      const xml = [];
      const csv = [];
      const end = Math.min(rowCount, start + 4095);
      for (let index = start; index <= end; index += 1) {
        const id = String(index).padStart(8, "0");
        xml.push(rowXml(index));
        csv.push(`Within private XLSX row ${id} no upload bounded memory.,,${index}\r\n`);
      }
      const output = csv.join("");
      outputHash.update(output);
      outputBytes += Buffer.byteLength(output);
      yield Buffer.from(xml.join(""));
    }
    yield Buffer.from(suffix);
  },
};

const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Stress" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const workbookRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
const manifest = await writeZip(fixturePath, [
  textEntry("[Content_Types].xml", contentTypes, 8),
  textEntry("_rels/.rels", rootRelationships, 8),
  textEntry("xl/workbook.xml", workbook, 8),
  textEntry("xl/_rels/workbook.xml.rels", workbookRelationships, 8),
  worksheetEntry,
]);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-spreadsheet-stress-fixtures.mjs",
      rows: rowCount,
      worksheetBytes,
      bytes: manifest.bytes,
      sha256: manifest.sha256,
      expectedByProfile: {
        "xlsx-to-csv": {
          validationBytes: outputBytes,
          validationSha256: outputHash.digest("hex"),
        },
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${fixtureRoot}\n`);
