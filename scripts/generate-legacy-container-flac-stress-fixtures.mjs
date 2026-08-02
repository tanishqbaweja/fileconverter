import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const results = await Promise.all([
  runGenerator("scripts/generate-avi-webm-stress-fixture.mjs"),
  runGenerator("scripts/generate-ogv-stress-fixture.mjs"),
]);
for (const stdout of results) process.stdout.write(stdout);

async function runGenerator(script) {
  const { stdout } = await execFileAsync("node", [script], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}
