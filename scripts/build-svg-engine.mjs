import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
const destinationRoot = path.join(projectRoot, "public", "engines", "svg");
const destination = path.join(destinationRoot, "resvg.wasm");
await mkdir(destinationRoot, { recursive: true });
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
