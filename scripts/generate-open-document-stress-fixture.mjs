import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "open-documents");
const format = process.argv[2];
if (!new Set(["odt", "ods", "odp"]).has(format)) {
  throw new Error("Pass exactly one OpenDocument stress format: odt, ods, or odp.");
}
await mkdir(fixtureRoot, { recursive: true });

const definitions = {
  odt: {
    mimetype: "application/vnd.oasis.opendocument.text",
    profileId: "odt-to-txt",
    filename: "document-128m.odt",
  },
  ods: {
    mimetype: "application/vnd.oasis.opendocument.spreadsheet",
    profileId: "ods-to-csv",
    filename: "spreadsheet-128m.ods",
  },
  odp: {
    mimetype: "application/vnd.oasis.opendocument.presentation",
    profileId: "odp-to-txt",
    filename: "presentation-128m.odp",
  },
};
const definition = definitions[format];
const fixturePath = path.join(fixtureRoot, definition.filename);
const namespaces = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"`;
const rootPrefix = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${namespaces} office:version="1.3"><office:automatic-styles/>`;
const rootSuffix = `</office:document-content>`;
const targetContentBytes = 129 * 1024 * 1024;
const outputHash = createHash("sha256");
let outputBytes = 0;
let recordCount = 0;
let pageCount = null;
let recordsPerPage = null;
let contentEntry;

if (format === "odt") {
  const prefix = `${rootPrefix}<office:body><office:text>`;
  const suffix = `</office:text></office:body>${rootSuffix}`;
  const paragraph = (index) =>
    `<text:p>Within private ODT paragraph ${String(index).padStart(8, "0")} no upload bounded memory.</text:p>`;
  const paragraphBytes = Buffer.byteLength(paragraph(1));
  recordCount = Math.ceil(
    (targetContentBytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix)) /
      paragraphBytes,
  );
  const contentBytes =
    Buffer.byteLength(prefix) + recordCount * paragraphBytes + Buffer.byteLength(suffix);
  contentEntry = {
    name: "content.xml",
    method: 0,
    size: contentBytes,
    async *chunks() {
      yield Buffer.from(prefix);
      for (let start = 1; start <= recordCount; start += 5000) {
        const xml = [];
        const text = [];
        const end = Math.min(recordCount, start + 4999);
        for (let index = start; index <= end; index += 1) {
          const id = String(index).padStart(8, "0");
          xml.push(paragraph(index));
          text.push(`Within private ODT paragraph ${id} no upload bounded memory.\n`);
        }
        const output = text.join("");
        outputHash.update(output);
        outputBytes += Buffer.byteLength(output);
        yield Buffer.from(xml.join(""));
      }
      yield Buffer.from(suffix);
    },
  };
} else if (format === "odp") {
  pageCount = 128;
  const prefix = `${rootPrefix}<office:body><office:presentation>`;
  const suffix = `</office:presentation></office:body>${rootSuffix}`;
  const pagePrefix = (page) =>
    `<draw:page draw:name="page${page}" presentation:visibility="visible"><draw:frame><draw:text-box>`;
  const pageSuffix = `</draw:text-box></draw:frame></draw:page>`;
  const paragraph = (page, record) =>
    `<text:p>Within private ODP page ${String(page).padStart(3, "0")} record ${String(record).padStart(5, "0")} no upload bounded memory.</text:p>`;
  const pageWrapperBytes = Array.from(
    { length: pageCount },
    (_, index) => Buffer.byteLength(pagePrefix(index + 1)) + Buffer.byteLength(pageSuffix),
  ).reduce((sum, bytes) => sum + bytes, 0);
  const fixedBytes =
    Buffer.byteLength(prefix) +
    Buffer.byteLength(suffix) +
    pageWrapperBytes;
  recordsPerPage = Math.ceil(
    (targetContentBytes - fixedBytes) /
      (pageCount * Buffer.byteLength(paragraph(1, 1))),
  );
  recordCount = pageCount * recordsPerPage;
  const contentBytes =
    fixedBytes + recordCount * Buffer.byteLength(paragraph(1, 1));
  contentEntry = {
    name: "content.xml",
    method: 0,
    size: contentBytes,
    async *chunks() {
      yield Buffer.from(prefix);
      for (let page = 1; page <= pageCount; page += 1) {
        yield Buffer.from(pagePrefix(page));
        for (let start = 1; start <= recordsPerPage; start += 2000) {
          const xml = [];
          const text = [];
          const end = Math.min(recordsPerPage, start + 1999);
          for (let record = start; record <= end; record += 1) {
            const pageId = String(page).padStart(3, "0");
            const recordId = String(record).padStart(5, "0");
            xml.push(paragraph(page, record));
            text.push(
              `Within private ODP page ${pageId} record ${recordId} no upload bounded memory.\n`,
            );
          }
          const output = text.join("");
          outputHash.update(output);
          outputBytes += Buffer.byteLength(output);
          yield Buffer.from(xml.join(""));
        }
        yield Buffer.from(pageSuffix);
        if (page < pageCount) {
          outputHash.update("\n");
          outputBytes += 1;
        }
      }
      yield Buffer.from(suffix);
    },
  };
} else {
  const prefix = `${rootPrefix}<office:body><office:spreadsheet><table:table table:name="Stress">`;
  const suffix = `</table:table></office:spreadsheet></office:body>${rootSuffix}`;
  const rowXml = (index) => {
    const id = String(index).padStart(8, "0");
    return `<table:table-row><table:table-cell office:value-type="string"><text:p>Within private ODS row ${id} no upload bounded memory.</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="${index}"/></table:table-row>`;
  };
  let contentBytes = Buffer.byteLength(prefix) + Buffer.byteLength(suffix);
  while (contentBytes < targetContentBytes && recordCount < 1_048_576) {
    recordCount += 1;
    contentBytes += Buffer.byteLength(rowXml(recordCount));
  }
  if (contentBytes < targetContentBytes) {
    throw new Error("Could not reach the ODS stress target within the row limit.");
  }
  contentEntry = {
    name: "content.xml",
    method: 0,
    size: contentBytes,
    async *chunks() {
      yield Buffer.from(prefix);
      for (let start = 1; start <= recordCount; start += 3000) {
        const xml = [];
        const csv = [];
        const end = Math.min(recordCount, start + 2999);
        for (let index = start; index <= end; index += 1) {
          const id = String(index).padStart(8, "0");
          xml.push(rowXml(index));
          csv.push(
            `Within private ODS row ${id} no upload bounded memory.,${index}\r\n`,
          );
        }
        const output = csv.join("");
        outputHash.update(output);
        outputBytes += Buffer.byteLength(output);
        yield Buffer.from(xml.join(""));
      }
      yield Buffer.from(suffix);
    },
  };
}

const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${definition.mimetype}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${namespaces} office:version="1.3"><office:styles/></office:document-styles>`;
const archive = await writeZip(fixturePath, [
  textEntry("mimetype", definition.mimetype),
  textEntry("META-INF/manifest.xml", manifest, 8),
  contentEntry,
  textEntry("styles.xml", styles, 8),
]);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-open-document-stress-fixture.mjs",
      format,
      records: recordCount,
      pages: pageCount,
      recordsPerPage,
      contentBytes: contentEntry.size,
      bytes: archive.bytes,
      sha256: archive.sha256,
      expectedByProfile: {
        [definition.profileId]: {
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
process.stdout.write(`${fixturePath}\n`);
