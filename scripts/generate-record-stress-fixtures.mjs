import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "data");
const targetCsvBytes = 128 * 1024 * 1024;
const requestedFormat = process.argv[2] ?? "all";
const supportedFormats = new Set(["all", "csv", "tsv", "ndjson", "json", "xml"]);
if (!supportedFormats.has(requestedFormat)) {
  throw new Error(
    `Choose one record stress format: ${[...supportedFormats].join(", ")}.`,
  );
}

await mkdir(fixtureRoot, { recursive: true });

const paths = {
  csv: path.join(fixtureRoot, "records-128m.csv"),
  tsv: path.join(fixtureRoot, "records-128m.tsv"),
  ndjson: path.join(fixtureRoot, "records-128m.ndjson"),
  json: path.join(fixtureRoot, "records-128m.json"),
};
const streams = Object.fromEntries(
  Object.entries(paths)
    .filter(([format]) => requestedFormat === "all" || requestedFormat === format)
    .map(([format, filePath]) => [
      format,
      createWriteStream(filePath, { flags: "w" }),
    ]),
);
const sourceHashes = {
  csv: createHash("sha256"),
  tsv: createHash("sha256"),
  ndjson: createHash("sha256"),
  json: createHash("sha256"),
};
const sourceBytes = { csv: 0, tsv: 0, ndjson: 0, json: 0 };
const expected = {
  "csv-to-tsv": { hash: createHash("sha256"), bytes: 0 },
  "csv-to-ndjson": { hash: createHash("sha256"), bytes: 0 },
  "csv-to-json": { hash: createHash("sha256"), bytes: 0 },
  "tsv-to-csv": { hash: createHash("sha256"), bytes: 0 },
  "tsv-to-ndjson": { hash: createHash("sha256"), bytes: 0 },
  "tsv-to-json": { hash: createHash("sha256"), bytes: 0 },
  "ndjson-to-csv": { hash: createHash("sha256"), bytes: 0 },
  "ndjson-to-tsv": { hash: createHash("sha256"), bytes: 0 },
  "ndjson-to-json": { hash: createHash("sha256"), bytes: 0 },
  "json-to-ndjson": { hash: createHash("sha256"), bytes: 0 },
  "json-to-csv": { hash: createHash("sha256"), bytes: 0 },
  "json-to-tsv": { hash: createHash("sha256"), bytes: 0 },
};

const updateExpected = (profileId, text) => {
  const bytes = Buffer.byteLength(text);
  expected[profileId].hash.update(text);
  expected[profileId].bytes += bytes;
};

const writeSource = async (format, text) => {
  const bytes = Buffer.byteLength(text);
  sourceHashes[format].update(text);
  sourceBytes[format] += bytes;
  const stream = streams[format];
  if (stream && !stream.write(text, "utf8")) {
    await once(stream, "drain");
  }
};

if (requestedFormat !== "xml") {
const csvHeader = "id,name,value\n";
const tsvHeader = "id\tname\tvalue\n";
const csvHeaderOutput = "id,name,value\r\n";
const tsvHeaderOutput = "id\tname\tvalue\r\n";
await writeSource("csv", csvHeader);
await writeSource("tsv", tsvHeader);
await writeSource("json", "[\n");
updateExpected("csv-to-tsv", tsvHeaderOutput);
updateExpected("tsv-to-csv", csvHeaderOutput);
updateExpected("csv-to-json", "[\r\n");
updateExpected("tsv-to-json", "[\r\n");
updateExpected("ndjson-to-csv", csvHeaderOutput);
updateExpected("ndjson-to-tsv", tsvHeaderOutput);
updateExpected("ndjson-to-json", "[\r\n");
updateExpected("json-to-csv", csvHeaderOutput);
updateExpected("json-to-tsv", tsvHeaderOutput);

let row = 0;
while (sourceBytes.csv < targetCsvBytes) {
  const csvBatch = [];
  const tsvBatch = [];
  const ndjsonBatch = [];
  const jsonBatch = [];
  const csvOutputBatch = [];
  const tsvOutputBatch = [];
  const ndjsonOutputBatch = [];
  for (let index = 0; index < 10_000; index += 1) {
    const id = String(row);
    const name = `item_${row}`;
    const value = String(row % 1000);
    csvBatch.push(`${id},${name},${value}\n`);
    tsvBatch.push(`${id}\t${name}\t${value}\n`);
    ndjsonBatch.push(
      `${JSON.stringify({ id, name, value })}\n`,
    );
    jsonBatch.push(
      `${row === 0 ? "" : ",\n"}${JSON.stringify({ id, name, value })}`,
    );
    csvOutputBatch.push(`${id},${name},${value}\r\n`);
    tsvOutputBatch.push(`${id}\t${name}\t${value}\r\n`);
    ndjsonOutputBatch.push(
      `${JSON.stringify({ id, name, value })}\n`,
    );
    row += 1;
  }
  const csv = csvBatch.join("");
  const tsv = tsvBatch.join("");
  const ndjson = ndjsonBatch.join("");
  const json = jsonBatch.join("");
  const csvOutput = csvOutputBatch.join("");
  const tsvOutput = tsvOutputBatch.join("");
  const ndjsonOutput = ndjsonOutputBatch.join("");
  await writeSource("csv", csv);
  await writeSource("tsv", tsv);
  await writeSource("ndjson", ndjson);
  await writeSource("json", json);
  updateExpected("csv-to-tsv", tsvOutput);
  updateExpected("csv-to-ndjson", ndjsonOutput);
  updateExpected(
    "csv-to-json",
    `${row === 10_000 ? "" : ",\r\n"}${ndjsonOutputBatch
      .map((line) => line.trimEnd())
      .join(",\r\n")}`,
  );
  updateExpected("tsv-to-csv", csvOutput);
  updateExpected("tsv-to-ndjson", ndjsonOutput);
  updateExpected(
    "tsv-to-json",
    `${row === 10_000 ? "" : ",\r\n"}${ndjsonOutputBatch
      .map((line) => line.trimEnd())
      .join(",\r\n")}`,
  );
  updateExpected("ndjson-to-csv", csvOutput);
  updateExpected("ndjson-to-tsv", tsvOutput);
  updateExpected(
    "ndjson-to-json",
    `${row === 10_000 ? "" : ",\r\n"}${ndjsonOutputBatch
      .map((line) => line.trimEnd())
      .join(",\r\n")}`,
  );
  updateExpected("json-to-ndjson", ndjsonOutput);
  updateExpected("json-to-csv", csvOutput);
  updateExpected("json-to-tsv", tsvOutput);
}

await writeSource("json", "\n]\n");
updateExpected("ndjson-to-json", "\r\n]\r\n");
updateExpected("csv-to-json", "\r\n]\r\n");
updateExpected("tsv-to-json", "\r\n]\r\n");

await Promise.all(
  Object.values(streams).map(async (stream) => {
    stream.end();
    await once(stream, "finish");
  }),
);

for (const [format, filePath] of Object.entries(paths).filter(
  ([format]) => requestedFormat === "all" || requestedFormat === format,
)) {
  const expectedByProfile = Object.fromEntries(
    Object.entries(expected)
      .filter(([profileId]) => profileId.startsWith(`${format}-to-`))
      .map(([profileId, result]) => [
        profileId,
        {
          validationBytes: result.bytes,
          validationSha256: result.hash.digest("hex"),
        },
      ]),
  );
  await writeFile(
    `${filePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-record-stress-fixtures.mjs",
        rows: row,
        bytes: sourceBytes[format],
        sha256: sourceHashes[format].digest("hex"),
        expectedByProfile,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
}

if (requestedFormat === "all" || requestedFormat === "xml") {
  await generateXmlFixture();
}

process.stdout.write(`${fixtureRoot}\n`);

async function generateXmlFixture() {
  const xmlPath = path.join(fixtureRoot, "records-128m.xml");
  const stream = createWriteStream(xmlPath, { flags: "w" });
  const sourceHash = createHash("sha256");
  const outputHash = createHash("sha256");
  let bytes = 0;
  let outputBytes = 0;
  let xmlRow = 0;

  const writeXml = async (text) => {
    const size = Buffer.byteLength(text);
    sourceHash.update(text);
    bytes += size;
    if (!stream.write(text, "utf8")) await once(stream, "drain");
  };
  const writeEvent = (event) => {
    const text = `${JSON.stringify(event)}\n`;
    outputHash.update(text);
    outputBytes += Buffer.byteLength(text);
  };

  await writeXml('<?xml version="1.0" encoding="UTF-8"?>\n<records>\n');
  writeEvent({ type: "startDocument" });
  writeEvent({
    type: "declaration",
    version: "1.0",
    encoding: "UTF-8",
    standalone: null,
  });
  writeEvent({
    type: "startElement",
    name: "records",
    attributes: [],
    selfClosing: false,
  });

  while (bytes < targetCsvBytes) {
    const payload = `value_${xmlRow}_${"x".repeat(960)}`;
    await writeXml(`  <record id="${xmlRow}">${payload}</record>\n`);
    writeEvent({ type: "text", value: "\n  " });
    writeEvent({
      type: "startElement",
      name: "record",
      attributes: [{ name: "id", value: String(xmlRow) }],
      selfClosing: false,
    });
    writeEvent({ type: "text", value: payload });
    writeEvent({ type: "endElement", name: "record" });
    xmlRow += 1;
  }
  await writeXml("</records>\n");
  writeEvent({ type: "text", value: "\n" });
  writeEvent({ type: "endElement", name: "records" });
  writeEvent({ type: "endDocument" });
  stream.end();
  await once(stream, "finish");

  await writeFile(
    `${xmlPath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-record-stress-fixtures.mjs",
        rows: xmlRow,
        bytes,
        sha256: sourceHash.digest("hex"),
        expectedByProfile: {
          "xml-to-ndjson": {
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
}
