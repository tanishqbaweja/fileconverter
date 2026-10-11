// Preserve the actual failed run/log and exact source bytes BEFORE correction.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."); assert.equal(process.argv.length, 2);
const receiptPath = "evidence/2026-10-11T17-35-24-259Z-alignment16-hosted-run.json", receiptBytes = await readFile(path.join(root, receiptPath)), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.failure, null); assert.equal(receipt.run.status, "completed"); assert.equal(receipt.run.conclusion, "failure"); assert.equal(receipt.runId, "38160211970");
const failedLog = (await promisify(execFile)("D:/Program Files/GitHub CLI/gh.exe", ["run", "view", receipt.runId, "--repo", "tanishqbaweja/fileconverter", "--log-failed"], { cwd: root, windowsHide: true, timeout: 60000, maxBuffer: 131072 })).stdout;
assert.match(failedLog, /3 !== 2/); assert.match(failedLog, /build-mpeg2-alignment16\.mjs:20:47/);
const sourcePins = {}, sourcePreimages = {};
for (const file of ["media/ffmpeg/build-mpeg2-alignment16.mjs", "media/ffmpeg/mpeg2-alignment16-sdk.mjs", "media/ffmpeg/mpeg2-alignment16-recipe.mjs", "media/ffmpeg/mpeg2-alignment16-smoke.c", "scripts/retain-alignment16-first-build-failure.mjs"]) {
  const bytes = await readFile(path.join(root, file)); sourcePins[file] = sha(bytes); sourcePreimages[file] = bytes.toString("base64");
}
const output = "evidence/alignment16-first-build-failure-38160211970.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), receipt: { path: receiptPath, sha256: sha(receiptBytes) }, run: receipt.run,
  failedLog, failedLogSha256: sha(failedLog), sourcePins, sourcePreimages, failure: "Exact transform occurrence guard: root expression also occurs in nested historical edit literal",
  sdkPatchReached: false, nativeCompilationReached: false, originalRead: false, conversionsPerformed: 0,
  hostedCleanupPassed: receipt.run.jobs.flatMap(job => job.steps).some(step => step.name === "Remove repository-local build data" && step.conclusion === "success"), publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, failedRunRetained: true, nativeCompilationReached: false }));
