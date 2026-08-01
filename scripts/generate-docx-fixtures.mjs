import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "documents");
await mkdir(fixtureRoot, { recursive: true });

const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
const relationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
const documentPrefix = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>`;
const documentSuffix = `<w:sectPr/></w:body></w:document>`;
const sampleDocument = `${documentPrefix}
<w:p><w:r><w:t>Within DOCX keeps files on this device.</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Formatting</w:t></w:r><w:r><w:t xml:space="preserve"> stays readable.</w:t></w:r></w:p>
<w:p><w:hyperlink r:id="rId2"><w:r><w:t>Linked text</w:t></w:r></w:hyperlink><w:r><w:tab/><w:t>after tab</w:t><w:br/><w:t>after break</w:t></w:r></w:p>
<w:p><w:r><w:t>Unicode: हिन्दी, 日本語, café, 😀.</w:t></w:r></w:p>
<w:p><w:del><w:r><w:t>deleted text</w:t></w:r></w:del><w:ins><w:r><w:t>Accepted insertion</w:t></w:r></w:ins></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
${documentSuffix}`;

const standardEntries = (documentXml) => [
  textEntry("[Content_Types].xml", contentTypes, 8),
  textEntry("_rels/.rels", relationships, 8),
  textEntry("word/document.xml", documentXml, 8),
];

await writeZip(
  path.join(fixtureRoot, "sample.docx"),
  standardEntries(sampleDocument),
);
await writeZip(
  path.join(fixtureRoot, "unsafe-doctype.docx"),
  standardEntries(
    `<?xml version="1.0"?><!DOCTYPE w:document [<!ENTITY leak SYSTEM "file:///private">]>${documentPrefix}<w:p><w:r><w:t>&leak;</w:t></w:r></w:p>${documentSuffix}`,
  ),
);
await writeZip(path.join(fixtureRoot, "unsafe-path.docx"), [
  ...standardEntries(sampleDocument),
  textEntry("../outside.txt", "must never be extracted", 8),
]);

process.stdout.write(`${fixtureRoot}\n`);
