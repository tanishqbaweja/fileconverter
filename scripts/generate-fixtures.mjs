import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compressionDirectory = path.join(projectRoot, "fixtures", "compression");

await mkdir(compressionDirectory, { recursive: true });

const gzipSource =
  "Within deterministic GZIP fixture.\n" +
  "Unicode: β, हिन्दी, 日本語.\n" +
  "The decompressed bytes must match exactly.\n";

await writeFile(
  path.join(compressionDirectory, "sample.txt.gz"),
  gzipSync(Buffer.from(gzipSource, "utf8"), {
    level: 9,
    mtime: 0,
  }),
);

await writeFile(
  path.join(compressionDirectory, "sample.expected.txt"),
  gzipSource,
  "utf8",
);
