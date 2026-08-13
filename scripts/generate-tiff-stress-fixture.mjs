import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "images");
const orientation = process.argv[2] === "6" ? 6 : 1;
if (process.argv[2] != null && orientation !== Number(process.argv[2])) {
  throw new Error("Stress TIFF orientation must be 1 or 6.");
}
const suffix = orientation === 6 ? "-orientation6" : "";
const fixturePath = path.join(fixtureRoot, `tiff-rgb-tiled-48m${suffix}.tiff`);
const referencePath = path.join(fixtureRoot, `tiff-rgb-tiled-48m${suffix}-reference.png`);
const manifestPath = `${fixturePath}.json`;

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "python",
  [path.join(projectRoot, "scripts", "generate-tiff-tiled-stress.py"), String(orientation)],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath)) hash.update(chunk);
const referenceHash = createHash("sha256");
for await (const chunk of createReadStream(referencePath)) referenceHash.update(chunk);
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-show_streams", "-show_format", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
if (orientation === 6) {
  for (const stream of probe.streams ?? []) {
    [stream.width, stream.height] = [stream.height, stream.width];
    [stream.coded_width, stream.coded_height] = [
      stream.coded_height,
      stream.coded_width,
    ];
    stream.display_aspect_ratio = `${stream.width}:${stream.height}`;
  }
}
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-tiff-stress-fixture.mjs",
      orientation,
      bytes: (await stat(fixturePath)).size,
      sha256: hash.digest("hex"),
      validationReference: path.relative(projectRoot, referencePath).replaceAll("\\", "/"),
      validationReferenceBytes: (await stat(referencePath)).size,
      validationReferenceSha256: referenceHash.digest("hex"),
      probe,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
