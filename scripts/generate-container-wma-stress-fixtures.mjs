import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retainedAv1ManifestPath = path.join(
  projectRoot,
  "fixtures",
  "stress",
  "media",
  "av1-opus-128m.mkv.json",
);
const retainedAv1Manifest = await readFile(retainedAv1ManifestPath, "utf8");

try {
  const results = await Promise.all([
    runGenerator("scripts/generate-container-flac-stress-fixtures.mjs"),
    runGenerator("scripts/generate-avi-webm-stress-fixture.mjs"),
    runGenerator("scripts/generate-container-ogg-stress-fixtures.mjs"),
  ]);
  for (const stdout of results) process.stdout.write(stdout);
} finally {
  await writeFile(retainedAv1ManifestPath, retainedAv1Manifest, "utf8");
}

async function runGenerator(script) {
  const { stdout } = await execFileAsync(process.execPath, [script], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}
