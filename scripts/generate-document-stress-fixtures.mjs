import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "documents");
const targetBytes = 64 * 1024 * 1024;
const txtPath = path.join(fixtureRoot, "document-64m.txt");
const markdownPath = path.join(fixtureRoot, "document-64m.md");
const htmlPath = path.join(fixtureRoot, "document-64m.html");
const docxPath = path.join(fixtureRoot, "document-128m.docx");

await mkdir(fixtureRoot, { recursive: true });

const txtStream = createWriteStream(txtPath, { flags: "w" });
const markdownStream = createWriteStream(markdownPath, { flags: "w" });
const htmlStream = createWriteStream(htmlPath, { flags: "w" });
const txtHash = createHash("sha256");
const markdownHash = createHash("sha256");
const htmlHash = createHash("sha256");
const txtOutputHash = createHash("sha256");
const markdownOutputHash = createHash("sha256");
const htmlOutputHash = createHash("sha256");
let txtBytes = 0;
let markdownBytes = 0;
let htmlBytes = 0;
let txtOutputBytes = 0;
let markdownOutputBytes = 0;
let htmlOutputBytes = 0;

const txtHeader =
  '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Converted text</title></head>\n<body><pre>';
const txtFooter = "</pre></body>\n</html>\n";
const markdownHeader =
  '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Converted Markdown</title></head>\n<body>\n';
const markdownFooter = "</body>\n</html>\n";
const htmlHeader =
  '<!doctype html><html><head><script>upload("never")</script><style>.private{display:none}</style></head><body>';
const htmlFooter = "</body></html>";

txtOutputHash.update(txtHeader);
txtOutputBytes += Buffer.byteLength(txtHeader);
markdownOutputHash.update(markdownHeader);
markdownOutputBytes += Buffer.byteLength(markdownHeader);
htmlBytes += await write(htmlStream, htmlHash, htmlHeader);

let record = 1;
while (
  txtBytes < targetBytes ||
  markdownBytes < targetBytes ||
  htmlBytes < targetBytes
) {
  const txtInput = [];
  const txtOutput = [];
  const markdownInput = [];
  const markdownOutput = [];
  const htmlInput = [];
  const htmlOutput = [];
  for (let index = 0; index < 10_000; index += 1) {
    const id = String(record).padStart(8, "0");
    const textLine = `Within private line ${id}: & <safe> "quoted".\n`;
    txtInput.push(textLine);
    txtOutput.push(
      `Within private line ${id}: &amp; &lt;safe&gt; &quot;quoted&quot;.\n`,
    );

    markdownInput.push(
      `## Section ${id}\n\nPrivate **conversion** ${id}.\n\n- No upload ${id}\n- Bounded memory ${id}\n\n`,
    );
    markdownOutput.push(
      `<h2>Section ${id}</h2>\n` +
        `<p>Private <strong>conversion</strong> ${id}.</p>\n` +
        "<ul>\n" +
        `<li>No upload ${id}</li>\n` +
        `<li>Bounded memory ${id}</li>\n` +
        "</ul>\n",
    );

    htmlInput.push(
      `<p>Private &amp; bounded ${id}</p><ul><li>No upload ${id}</li><li>Bounded memory ${id}</li></ul>`,
    );
    htmlOutput.push(
      `Private & bounded ${id}\n` +
        `- No upload ${id}\n` +
        `- Bounded memory ${id}\n`,
    );
    record += 1;
  }
  const txtInputText = txtInput.join("");
  const txtOutputText = txtOutput.join("");
  const markdownInputText = markdownInput.join("");
  const markdownOutputText = markdownOutput.join("");
  const htmlInputText = htmlInput.join("");
  const htmlOutputText = htmlOutput.join("");
  txtBytes += await write(txtStream, txtHash, txtInputText);
  markdownBytes += await write(
    markdownStream,
    markdownHash,
    markdownInputText,
  );
  htmlBytes += await write(htmlStream, htmlHash, htmlInputText);
  txtOutputHash.update(txtOutputText);
  txtOutputBytes += Buffer.byteLength(txtOutputText);
  markdownOutputHash.update(markdownOutputText);
  markdownOutputBytes += Buffer.byteLength(markdownOutputText);
  htmlOutputHash.update(htmlOutputText);
  htmlOutputBytes += Buffer.byteLength(htmlOutputText);
}

htmlBytes += await write(htmlStream, htmlHash, htmlFooter);
txtOutputHash.update(txtFooter);
txtOutputBytes += Buffer.byteLength(txtFooter);
markdownOutputHash.update(markdownFooter);
markdownOutputBytes += Buffer.byteLength(markdownFooter);

txtStream.end();
markdownStream.end();
htmlStream.end();
await Promise.all([
  once(txtStream, "finish"),
  once(markdownStream, "finish"),
  once(htmlStream, "finish"),
]);

await writeManifest(txtPath, txtBytes, txtHash, {
  "txt-to-html": {
    validationBytes: txtOutputBytes,
    validationSha256: txtOutputHash.digest("hex"),
  },
  "txt-to-docx": {
    validationBytes: txtBytes,
    validationSha256: txtHash.copy().digest("hex"),
  },
  "txt-to-odt": {
    validationBytes: txtBytes,
    validationSha256: txtHash.copy().digest("hex"),
  },
  "txt-to-epub": {
    validationBytes: txtBytes,
    validationSha256: txtHash.copy().digest("hex"),
  },
});
await writeManifest(markdownPath, markdownBytes, markdownHash, {
  "md-to-html": {
    validationBytes: markdownOutputBytes,
    validationSha256: markdownOutputHash.digest("hex"),
  },
});
await writeManifest(htmlPath, htmlBytes, htmlHash, {
  "html-to-txt": {
    validationBytes: htmlOutputBytes,
    validationSha256: htmlOutputHash.digest("hex"),
  },
});

const docxContentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const docxRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const docxPrefix = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`;
const docxSuffix = `<w:sectPr/></w:body></w:document>`;
const sampleDocxId = "00000001";
const sampleDocxText = `Within private DOCX paragraph ${sampleDocxId}: no upload, bounded memory.`;
const sampleDocxParagraph = `<w:p><w:r><w:t>${sampleDocxText}</w:t></w:r></w:p>`;
const docxRecords = Math.ceil(
  (128 * 1024 * 1024 -
    Buffer.byteLength(docxPrefix) -
    Buffer.byteLength(docxSuffix)) /
    Buffer.byteLength(sampleDocxParagraph),
);
const docxDocumentBytes =
  Buffer.byteLength(docxPrefix) +
  docxRecords * Buffer.byteLength(sampleDocxParagraph) +
  Buffer.byteLength(docxSuffix);
const docxOutputHash = createHash("sha256");
let docxOutputBytes = 0;
const docxDocumentEntry = {
  name: "word/document.xml",
  size: docxDocumentBytes,
  async *chunks() {
    yield Buffer.from(docxPrefix);
    for (let start = 1; start <= docxRecords; start += 10_000) {
      const paragraphs = [];
      const lines = [];
      const end = Math.min(docxRecords, start + 9_999);
      for (let index = start; index <= end; index += 1) {
        const id = String(index).padStart(8, "0");
        const text = `Within private DOCX paragraph ${id}: no upload, bounded memory.`;
        paragraphs.push(`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`);
        lines.push(`${text}\n`);
      }
      const output = lines.join("");
      docxOutputHash.update(output);
      docxOutputBytes += Buffer.byteLength(output);
      yield Buffer.from(paragraphs.join(""));
    }
    yield Buffer.from(docxSuffix);
  },
};
const docxManifest = await writeZip(docxPath, [
  textEntry("[Content_Types].xml", docxContentTypes),
  textEntry("_rels/.rels", docxRelationships),
  docxDocumentEntry,
]);
await writeFile(
  `${docxPath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-document-stress-fixtures.mjs",
      records: docxRecords,
      bytes: docxManifest.bytes,
      sha256: docxManifest.sha256,
      expectedByProfile: {
        "docx-to-txt": {
          validationBytes: docxOutputBytes,
          validationSha256: docxOutputHash.digest("hex"),
        },
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

process.stdout.write(`${fixtureRoot}\n`);

async function write(stream, hash, text) {
  hash.update(text);
  if (!stream.write(text, "utf8")) await once(stream, "drain");
  return Buffer.byteLength(text);
}

async function writeManifest(filePath, bytes, hash, expectedByProfile) {
  await writeFile(
    `${filePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-document-stress-fixtures.mjs",
        records: record - 1,
        bytes,
        sha256: hash.digest("hex"),
        expectedByProfile,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
