import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aviName = "mpeg4-mp3-webm-128m.avi";
const ogvName = "theora-video-128m.ogv";
const webmName = "av1-opus-128m.webm";
const amrThreeGpName = "audio-amr-nb-128m.3gp";
const availableNames = new Set([aviName, ogvName, webmName, amrThreeGpName]);
const requestedNames = process.argv.slice(2);

for (const requestedName of requestedNames) {
  if (!availableNames.has(requestedName)) {
    throw new Error(
      `Unknown container M4A/AMR fixture ${requestedName}. Choose from: ${[...availableNames].join(", ")}.`,
    );
  }
}

const selectedNames = requestedNames.length === 0
  ? availableNames
  : new Set(requestedNames);
const jobs = [];
const legacyNames = [aviName, ogvName].filter((name) => selectedNames.has(name));
if (legacyNames.length > 0) {
  jobs.push(runGenerator("scripts/generate-container-amr-aac-stress-fixtures.mjs", legacyNames));
}
if (selectedNames.has(webmName)) {
  jobs.push(runGenerator("scripts/generate-container-ogg-stress-fixtures.mjs", [webmName]));
}
if (selectedNames.has(amrThreeGpName)) {
  jobs.push(runGenerator("scripts/generate-3gp-amr-stress-fixture.mjs"));
}

const outputs = await Promise.all(jobs);
for (const stdout of outputs) process.stdout.write(stdout);

async function runGenerator(script, arguments_ = []) {
  const { stdout } = await execFileAsync(process.execPath, [script, ...arguments_], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}
