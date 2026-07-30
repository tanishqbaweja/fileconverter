import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sizeMiB = Number.parseInt(process.argv[2] ?? "256", 10);
if (!Number.isInteger(sizeMiB) || sizeMiB < 1 || sizeMiB > 4096) {
  throw new Error("Size must be an integer from 1 to 4096 MiB.");
}

const stressDirectory = path.join(projectRoot, "fixtures", "stress");
const fixturePath = path.join(
  stressDirectory,
  `deterministic-${sizeMiB}m.bin`,
);
const manifestPath = `${fixturePath}.json`;
const blockSize = 1024 * 1024;
const totalBytes = sizeMiB * blockSize;
const block = Buffer.allocUnsafe(blockSize);
const hash = createHash("sha256");
let state = 0x6d2b79f5;

await mkdir(stressDirectory, { recursive: true });
const output = createWriteStream(fixturePath, { flags: "w" });

for (let written = 0; written < totalBytes; written += blockSize) {
  const bytes = Math.min(blockSize, totalBytes - written);
  for (let offset = 0; offset < bytes; offset += 4) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    block.writeUInt32LE(state >>> 0, offset);
  }
  const chunk = block.subarray(0, bytes);
  hash.update(chunk);
  if (!output.write(chunk)) await once(output, "drain");
}

output.end();
await once(output, "close");

const manifest = {
  generator: "xorshift32",
  seed: "0x6d2b79f5",
  sizeMiB,
  bytes: totalBytes,
  sha256: hash.digest("hex"),
  path: fixturePath,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(manifest)}\n`);
