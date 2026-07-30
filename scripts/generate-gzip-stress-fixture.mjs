import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.resolve(
  projectRoot,
  process.argv[2] ?? "fixtures/stress/deterministic-256m.bin",
);
const sourceManifest = await readFileJson(`${sourcePath}.json`);
const outputPath = `${sourcePath}.gz`;
const outputHash = createHash("sha256");

const hasher = new Transform({
  transform(chunk, _encoding, callback) {
    outputHash.update(chunk);
    callback(null, chunk);
  },
});

await pipeline(
  createReadStream(sourcePath),
  createGzip({ level: 6, mtime: 0 }),
  hasher,
  createWriteStream(outputPath, { flags: "w" }),
);

const outputStat = await stat(outputPath);
const manifest = {
  generator: "node:zlib.createGzip",
  sourcePath,
  bytes: outputStat.size,
  sha256: outputHash.digest("hex"),
  validationBytes: sourceManifest.bytes,
  validationSha256: sourceManifest.sha256,
  path: outputPath,
};
await writeFile(`${outputPath}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest)}\n`);

async function readFileJson(filename) {
  return JSON.parse(await (await import("node:fs/promises")).readFile(filename, "utf8"));
}
