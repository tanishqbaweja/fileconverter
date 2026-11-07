import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(projectRoot, "node_modules", "@resvg", "resvg-wasm");
const packageMetadata = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);
if (packageMetadata.version !== "2.6.2") {
  throw new Error(`Expected @resvg/resvg-wasm 2.6.2, found ${packageMetadata.version}.`);
}
const source = path.join(packageRoot, "index_bg.wasm");
let destinationRoot = path.join(projectRoot, "public", "engines", "svg");
if (process.argv.length !== 2) {
  assert.equal(process.argv.length, 4); assert.equal(process.argv[2], "--owned-output");
  destinationRoot = path.resolve(process.argv[3]);
  const work = path.join(projectRoot, "work"), parent = path.dirname(destinationRoot);
  assert.equal(path.dirname(parent), work); assert.match(path.basename(parent), /^engine-package-copy-[A-Za-z0-9]+$/);
  assert.equal(path.basename(destinationRoot), "svg");
  assert.equal(await realpath(work), work); assert.equal(await realpath(parent), parent);
  const info = await lstat(parent); assert.ok(info.isDirectory() && !info.isSymbolicLink());
  await mkdir(destinationRoot); // Exclusive: never compare against stale prior output.
} else await mkdir(destinationRoot, { recursive: true });
const destination = path.join(destinationRoot, "resvg.wasm");
await copyFile(source, destination);
const bytes = await readFile(destination);
const manifest = {
  engine: "resvg-wasm",
  resvgWasmVersion: packageMetadata.version,
  npmPackage: "@resvg/resvg-wasm@2.6.2",
  npmIntegrity:
    "sha512-FqALmHI8D4o6lk/LRWDnhw95z5eO+eAa6ORjVg09YRR7BkcM6oPHU9uyC0gtQG5vpFLvgpeU4+zEAz2H8APHNw==",
  wasmBytes: bytes.byteLength,
  wasmSha256: createHash("sha256").update(bytes).digest("hex"),
  maximumInputBytes: 4 * 1024 * 1024,
  maximumOutputBytes: 64 * 1024 * 1024,
  maximumPixels: 8_388_608,
  maximumDimension: 8_192,
  maximumElements: 10_000,
  maximumEffectPixels: 6_000_000,
  maximumFilters: 1,
  maximumMasks: 1,
  maximumFilterReferences: 1,
  maximumMaskReferences: 1,
  maximumFilterPrimitives: 8,
  outputWriteChunkBytes: 256 * 1024,
  outstandingWrites: 1,
  profiles: ["svg-to-png"],
};
await writeFile(
  path.join(destinationRoot, "build-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(manifest)}\n`);
