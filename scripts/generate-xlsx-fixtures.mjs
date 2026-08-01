import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "spreadsheets");
await mkdir(fixtureRoot, { recursive: true });

const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Main &amp; private" sheetId="1" r:id="rId1"/>
    <sheet name="Extra" sheetId="2" r:id="rId2"/>
    <sheet name="Secret" sheetId="3" state="veryHidden" r:id="rId3"/>
  </sheets>
</workbook>`;
const workbookRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;
const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
  <si><t>Name</t></si>
  <si><r><t>Comma, quote &quot; and line</t></r><r><t>&#10;break 😀</t></r><rPh><t>omitted phonetic</t></rPh></si>
</sst>`;
const worksheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="n"><v>42.5</v></c><c r="D1" t="inlineStr"><is><r><t>in</t></r><r><t>line</t></r></is></c></row>
    <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="b"><v>1</v></c><c r="C2" t="e"><v>#DIV/0!</v></c><c r="D2" t="d"><v>2026-08-01T12:34:56Z</v></c></row>
    <row r="4"><c r="A4" t="n"><f>3+4</f><v>7</v></c><c r="B4" t="n"><f>1+1</f></c><c r="C4" t="str"><f>&quot;cached text&quot;</f><v>cached text</v></c></row>
  </sheetData>
</worksheet>`;
const emptyWorksheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`;

const standardEntries = (sheetXml, relationships = workbookRelationships) => [
  textEntry("[Content_Types].xml", contentTypes, 8),
  textEntry("_rels/.rels", rootRelationships, 8),
  textEntry("xl/workbook.xml", workbook, 8),
  textEntry("xl/_rels/workbook.xml.rels", relationships, 8),
  textEntry("xl/sharedStrings.xml", sharedStrings, 8),
  textEntry("xl/worksheets/sheet1.xml", sheetXml, 8),
  textEntry("xl/worksheets/sheet2.xml", emptyWorksheet, 8),
  textEntry("xl/worksheets/sheet3.xml", emptyWorksheet, 8),
];

await writeZip(path.join(fixtureRoot, "sample.xlsx"), standardEntries(worksheet));
await writeZip(
  path.join(fixtureRoot, "unsafe-doctype.xlsx"),
  standardEntries(
    `<?xml version="1.0"?><!DOCTYPE worksheet [<!ENTITY leak SYSTEM "file:///private">]><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&leak;</t></is></c></row></sheetData></worksheet>`,
  ),
);
await writeZip(
  path.join(fixtureRoot, "unsafe-reference.xlsx"),
  standardEntries(
    worksheet,
    workbookRelationships.replace(
      'Target="worksheets/sheet1.xml"',
      'Target="../../../outside.xml"',
    ),
  ),
);

process.stdout.write(`${fixtureRoot}\n`);
