// Preserve the terminal hosted log and exact Git-head source bytes before edits.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
assert.equal(process.argv.length, 3); const input = process.argv[2];
assert.match(input, /^evidence\/packet-cache-build-observation-\d+-\d+\.json$/);
const observationBytes = await readFile(path.join(root, input)), observation = JSON.parse(observationBytes), run = observation.state;
assert.equal(run.status, "completed"); assert.equal(run.conclusion, "failure"); assert.equal(run.headSha, observation.expectedHead);
const failedLog = (await execute("D:/Program Files/GitHub CLI/gh.exe", ["run", "view", String(run.databaseId), "--repo", "tanishqbaweja/fileconverter", "--log-failed"],
  { cwd: root, env: process.env, windowsHide: true, timeout: 60000, maxBuffer: 4194304 })).stdout;
const sourcePins = {}, sourcePreimages = {};
for (const name of ["build-mpeg2-packet-cache.mjs", "mpeg2-packet-cache-builder-recipe.mjs", "mpeg2-packet-cache-recipe.mjs", "make-mpeg2-packet-cache-pipeline.mjs", "mpeg2-packet-cache-source.mjs", "mpeg2-packet-cache.h", "mpeg2-packet-cache-smoke.c", "build-mpeg2-hevc-planes.mjs", "mpeg2-hevc-plane-builder-recipe.mjs", "mpeg2-hevc-plane-recipe.mjs", "mpeg2-hevc-plane-source.mjs", "mpeg2-hevc-plane-policy.h", "patch-mpeg2-hevc-planes.mjs", "mpeg2-encoder-plane-source.mjs", "mpeg2-encoder-plane-prototype-source.mjs", "mpeg2-encoder-plane-smoke.c", "build-mpeg2-alignment16.mjs", "mpeg2-alignment16-builder-recipe.mjs", "mpeg2-alignment16-sdk.mjs", "mpeg2-alignment16-recipe.mjs", "mpeg2-alignment16-smoke.c", "build-mpeg2-allocation-attempt.mjs"]) {
  const file = "media/ffmpeg/" + name, current = await readFile(path.join(root, file));
  const executed = (await execute("git", ["show", `${run.headSha}:${file}`], { cwd: root, windowsHide: true, encoding: "buffer", timeout: 30000, maxBuffer: 1048576 })).stdout;
  assert.equal(sha(current), sha(executed), "Capture exact failed Git HEAD before changing " + file);
  sourcePins[file] = sha(executed); sourcePreimages[file] = executed.toString("base64");
}
const bundle = Buffer.from(JSON.stringify({ failedLog, sourcePreimages })), zipped = gzipSync(bundle);
assert.ok(bundle.length <= 4194304); assert.equal(sha(gunzipSync(zipped)), sha(bundle));
const archive = `outputs/reports/packet-cache-build-failure-${run.databaseId}.json.gz`;
await writeFile(path.join(root, archive), zipped, { flag: "wx" }); assert.equal(sha(gunzipSync(await readFile(path.join(root, archive)))), sha(bundle));
const output = `evidence/packet-cache-build-failure-${run.databaseId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), observation: { path: input, sha256: sha(observationBytes) }, run,
  failedLogSha256: sha(failedLog), sourcePins, sourcesMatchedActualFailedGitHead: true,
  archive: { path: archive, bytes: zipped.length, sha256: sha(zipped), restoredBytes: bundle.length, restoredSha256: sha(bundle) },
  hostedCleanupPassed: run.jobs.flatMap(job => job.steps).some(step => step.name === "Remove repository-local build data" && step.conclusion === "success"),
  originalRead: false, browserConversionsPerformed: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, archive, sources: Object.keys(sourcePins).length }));
console.log(failedLog.split(/\r?\n/).slice(-70).join("\n"));
