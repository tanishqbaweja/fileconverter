import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "presentations");
const fixturePath = path.join(fixtureRoot, "presentation-128m.pptx");
await mkdir(fixtureRoot, { recursive: true });

const slideCount = 128;
const targetSlideBytes = Math.ceil((129 * 1024 * 1024) / slideCount);
const slidePrefix = `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/>`;
const slideSuffix = `</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
const paragraph = (slide, record) => {
  const slideId = String(slide).padStart(3, "0");
  const recordId = String(record).padStart(5, "0");
  return `<a:p><a:r><a:t>Within private PPTX slide ${slideId} record ${recordId} no upload bounded memory.</a:t></a:r></a:p>`;
};
const sampleParagraphBytes = Buffer.byteLength(paragraph(1, 1));
const recordsPerSlide = Math.ceil(
  (targetSlideBytes - Buffer.byteLength(slidePrefix) - Buffer.byteLength(slideSuffix)) /
    sampleParagraphBytes,
);
const slideBytes =
  Buffer.byteLength(slidePrefix) +
  recordsPerSlide * sampleParagraphBytes +
  Buffer.byteLength(slideSuffix);
const outputHash = createHash("sha256");
let outputBytes = 0;

const slideEntry = (slide) => ({
  name: `ppt/slides/slide${slide}.xml`,
  method: 0,
  size: slideBytes,
  async *chunks() {
    yield Buffer.from(slidePrefix);
    for (let start = 1; start <= recordsPerSlide; start += 1000) {
      const xml = [];
      const text = [];
      const end = Math.min(recordsPerSlide, start + 999);
      for (let record = start; record <= end; record += 1) {
        const slideId = String(slide).padStart(3, "0");
        const recordId = String(record).padStart(5, "0");
        xml.push(paragraph(slide, record));
        text.push(
          `Within private PPTX slide ${slideId} record ${recordId} no upload bounded memory.\n`,
        );
      }
      const output = text.join("");
      outputHash.update(output);
      outputBytes += Buffer.byteLength(output);
      yield Buffer.from(xml.join(""));
    }
    yield Buffer.from(slideSuffix);
    if (slide < slideCount) {
      outputHash.update("\n");
      outputBytes += 1;
    }
  },
});

const slideOverrides = Array.from(
  { length: slideCount },
  (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
).join("");
const slideIds = Array.from(
  { length: slideCount },
  (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`,
).join("");
const slideRelationships = Array.from(
  { length: slideCount },
  (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
).join("");
const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slideOverrides}</Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`;
const presentation = `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
const relationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRelationships}</Relationships>`;
const manifest = await writeZip(fixturePath, [
  textEntry("[Content_Types].xml", contentTypes, 8),
  textEntry("_rels/.rels", rootRelationships, 8),
  textEntry("ppt/presentation.xml", presentation, 8),
  textEntry("ppt/_rels/presentation.xml.rels", relationships, 8),
  ...Array.from({ length: slideCount }, (_, index) => slideEntry(index + 1)),
]);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-presentation-stress-fixtures.mjs",
      slides: slideCount,
      recordsPerSlide,
      slideBytes,
      bytes: manifest.bytes,
      sha256: manifest.sha256,
      expectedByProfile: {
        "pptx-to-txt": {
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
