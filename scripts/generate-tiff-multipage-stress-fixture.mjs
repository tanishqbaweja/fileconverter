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
const fixturePath = path.join(
  fixtureRoot,
  "tiff-rgb-tiled-multipage-48m.tiff",
);
const manifestPath = `${fixturePath}.json`;
const references = [
  path.join(fixtureRoot, "tiff-rgb-tiled-48m-reference.png"),
  path.join(fixtureRoot, "tiff-rgb-tiled-multipage-second-reference.png"),
];

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "python",
  [path.join(projectRoot, "scripts", "generate-tiff-tiled-stress.py"), "1"],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
await execFileAsync(
  "python",
  [path.join(projectRoot, "scripts", "generate-tiff-multipage-stress.py")],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const hashFile = async (filePath) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
};
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-show_streams", "-show_format", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
if (probe.streams?.[0]) probe.streams[0].nb_frames = "2";
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-tiff-multipage-stress-fixture.mjs",
      bytes: (await stat(fixturePath)).size,
      sha256: await hashFile(fixturePath),
      pageCount: 2,
      validationReferences: references.map((reference) =>
        path.relative(projectRoot, reference).replaceAll("\\", "/"),
      ),
      validationReferenceSha256: await Promise.all(references.map(hashFile)),
      probe,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
