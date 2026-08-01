import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "ebooks");
const fixturePath = path.join(fixtureRoot, "ebook-128m.epub");
await mkdir(fixtureRoot, { recursive: true });

const chapterCount = 4;
const xhtmlPrefix = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Within stress</title></head><body>`;
const xhtmlSuffix = `</body></html>`;
const sampleId = "00000001";
const sampleText = `Within private EPUB paragraph ${sampleId}: no upload, bounded memory.`;
const sampleParagraph = `<p>${sampleText}</p>`;
const recordsPerChapter = Math.ceil(
  (32 * 1024 * 1024 -
    Buffer.byteLength(xhtmlPrefix) -
    Buffer.byteLength(xhtmlSuffix)) /
    Buffer.byteLength(sampleParagraph),
);
const chapterBytes =
  Buffer.byteLength(xhtmlPrefix) +
  recordsPerChapter * Buffer.byteLength(sampleParagraph) +
  Buffer.byteLength(xhtmlSuffix);
const outputHash = createHash("sha256");
let outputBytes = 0;

const chapterEntry = (chapter) => ({
  name: `OPS/text/chapter-${chapter}.xhtml`,
  size: chapterBytes,
  async *chunks() {
    yield Buffer.from(xhtmlPrefix);
    for (let start = 1; start <= recordsPerChapter; start += 10_000) {
      const paragraphs = [];
      const lines = [];
      const end = Math.min(recordsPerChapter, start + 9_999);
      for (let index = start; index <= end; index += 1) {
        const global = (chapter - 1) * recordsPerChapter + index;
        const id = String(global).padStart(8, "0");
        const text = `Within private EPUB paragraph ${id}: no upload, bounded memory.`;
        paragraphs.push(`<p>${text}</p>`);
        lines.push(`${text}\n`);
      }
      const output = lines.join("");
      outputHash.update(output);
      outputBytes += Buffer.byteLength(output);
      yield Buffer.from(paragraphs.join(""));
    }
    yield Buffer.from(xhtmlSuffix);
  },
});

const manifestItems = Array.from(
  { length: chapterCount },
  (_, index) =>
    `<item id="chapter-${index + 1}" href="text/chapter-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`,
).join("");
const spineItems = Array.from(
  { length: chapterCount },
  (_, index) => `<itemref idref="chapter-${index + 1}"/>`,
).join("");
const container = `<?xml version="1.0" encoding="UTF-8"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest>${manifestItems}</manifest><spine>${spineItems}</spine></package>`;
const manifest = await writeZip(fixturePath, [
  textEntry("mimetype", "application/epub+zip"),
  textEntry("META-INF/container.xml", container),
  textEntry("OPS/package.opf", opf),
  ...Array.from({ length: chapterCount }, (_, index) => chapterEntry(index + 1)),
]);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-ebook-stress-fixtures.mjs",
      chapters: chapterCount,
      records: recordsPerChapter * chapterCount,
      bytes: manifest.bytes,
      sha256: manifest.sha256,
      expectedByProfile: {
        "epub-to-txt": {
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
