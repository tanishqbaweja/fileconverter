import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePath = path.join(
  projectRoot,
  "fixtures",
  "stress",
  "deterministic-256m.bin",
);

await execFileAsync(
  process.execPath,
  [path.join(projectRoot, "scripts", "generate-stress-fixture.mjs"), "256"],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const sourceStat = await stat(sourcePath);
const sourceSha256 = await sha256(sourcePath);
const codecs = [
  {
    name: "gzip",
    outputPath: `${sourcePath}.gz`,
    create: () =>
      pipeline(
        createReadStream(sourcePath),
        createGzip({ level: 6, mtime: 0 }),
        createWriteStream(`${sourcePath}.gz`, { flags: "w" }),
      ),
  },
  {
    name: "bzip2",
    outputPath: `${sourcePath}.bz2`,
    create: () =>
      runPython(String.raw`
import bz2, shutil, sys
with open(sys.argv[1], "rb") as source, bz2.open(sys.argv[2], "wb", compresslevel=1) as target:
    shutil.copyfileobj(source, target, length=262144)
`, `${sourcePath}.bz2`),
  },
  {
    name: "xz",
    outputPath: `${sourcePath}.xz`,
    create: () =>
      runPython(String.raw`
import lzma, shutil, sys
with open(sys.argv[1], "rb") as source, lzma.open(
    sys.argv[2], "wb", format=lzma.FORMAT_XZ, check=lzma.CHECK_CRC64, preset=0
) as target:
    shutil.copyfileobj(source, target, length=262144)
`, `${sourcePath}.xz`),
  },
];

const requestedCodecNames = process.argv.slice(2);
const knownCodecNames = new Set(codecs.map((codec) => codec.name));
for (const requestedCodecName of requestedCodecNames) {
  if (!knownCodecNames.has(requestedCodecName)) {
    throw new Error(
      `Unknown compression codec ${requestedCodecName}. Choose from: ${[...knownCodecNames].join(", ")}.`,
    );
  }
}
const selectedCodecs = requestedCodecNames.length
  ? codecs.filter((codec) => requestedCodecNames.includes(codec.name))
  : codecs;

await Promise.all(selectedCodecs.map((codec) => codec.create()));
await Promise.all(
  selectedCodecs.map(async (codec) => {
    const outputStat = await stat(codec.outputPath);
    await writeFile(
      `${codec.outputPath}.json`,
      `${JSON.stringify(
        {
          generatedBy:
            "scripts/generate-compression-transcode-stress-fixtures.mjs",
          codec: codec.name,
          bytes: outputStat.size,
          sha256: await sha256(codec.outputPath),
          validationBytes: sourceStat.size,
          validationSha256: sourceSha256,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    process.stdout.write(`${codec.outputPath} (${outputStat.size} bytes)\n`);
  }),
);

async function runPython(source, outputPath) {
  await execFileAsync("python", ["-c", source, sourcePath, outputPath], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
