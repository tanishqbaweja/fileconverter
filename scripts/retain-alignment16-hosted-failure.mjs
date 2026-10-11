// Source/run/log binding before a changed retry, never rewrite old receipts.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const receiptPath = process.argv[2]; assert.equal(process.argv.length, 3);
assert.match(receiptPath ?? "", /^evidence\/[A-Za-z0-9-]+-alignment16-hosted-run\.json$/);
const bytes = await readFile(path.join(root, receiptPath)), receipt = JSON.parse(bytes);
assert.equal(receipt.failure, null); assert.equal(receipt.run.status, "completed"); assert.equal(receipt.run.conclusion, "failure");
const failedLog = (await execute("D:/Program Files/GitHub CLI/gh.exe", ["run", "view", receipt.runId, "--repo", "tanishqbaweja/fileconverter", "--log-failed"], { cwd: root, windowsHide: true, timeout: 60000, maxBuffer: 1048576 })).stdout;
const sourcePins = {}, sourcePreimages = {};
for (const file of ["media/ffmpeg/build-mpeg2-alignment16.mjs", "media/ffmpeg/mpeg2-alignment16-builder-recipe.mjs", "media/ffmpeg/mpeg2-alignment16-sdk.mjs", "media/ffmpeg/mpeg2-alignment16-recipe.mjs", "media/ffmpeg/mpeg2-alignment16-smoke.c", "media/ffmpeg/build-mpeg2-allocation-attempt.mjs"]) {
  const current = await readFile(path.join(root, file));
  const executed = (await execute("git", ["show", `${receipt.run.headSha}:${file}`], { cwd: root, windowsHide: true, encoding: "buffer", timeout: 30000, maxBuffer: 1048576 })).stdout;
  assert.equal(sha(current), sha(executed), "Retain exact failed HEAD before editing " + file);
  sourcePins[file] = sha(executed); sourcePreimages[file] = executed.toString("base64");
}
const output = `evidence/alignment16-hosted-failure-${receipt.runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), receipt: { path: receiptPath, sha256: sha(bytes) }, run: receipt.run,
  failedLog, failedLogSha256: sha(failedLog), sourcePins, sourcePreimages, sourcesMatchedActualFailedGitHead: true,
  hostedCleanupPassed: receipt.run.jobs.flatMap(job => job.steps).some(step => step.name === "Remove repository-local build data" && step.conclusion === "success"),
  originalRead: false, browserConversionsPerformed: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, executedNativePreparationSources: Object.keys(sourcePins).length, sourcesMatchedActualFailedGitHead: true }));
