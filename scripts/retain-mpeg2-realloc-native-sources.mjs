// Versioned native closure, actual executed head; unchanged128-file/2MiB cap.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
assert.equal(process.argv.length, 3); const runId = process.argv[2]; assert.match(runId, /^[0-9]{8,}$/);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), read = file => readFile(path.join(root, file));
const proofPath = `evidence/mpeg2-realloc-attempt-build-${runId}.json`, proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
const branch = JSON.parse(await read("evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json"));
assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success"); assert.equal(proof.run.headSha, branch.commit); assert.equal(branch.remoteVerified, true);
assert.equal(proof.manifest.reallocAttempt.actualWasmSyntheticDispatch.passed, 10);
assert.equal(proof.manifest.reallocAttempt.actualWasmLibavutil.passed, 6);
assert.equal(proof.manifest.reallocAttempt.actualWasmLibavutil.constructorBindingVerified, true);
const sourcePins = proof.manifest.sources, sourcePreimages = {}, currentSourcePins = {};
assert.equal(Object.keys(sourcePins).length, 86); assert.ok(Object.keys(sourcePins).length <= 128);
for (const [file, expected] of Object.entries(sourcePins)) {
  assert.match(file, /^(?:(?:media\/ffmpeg\/|scripts\/lib\/|\.github\/workflows\/)[a-zA-Z0-9_.\/-]+|tests\/mpeg2-realloc-attempt\.test\.mjs)$/);
  assert.ok(file.split("/").every(part => part && part !== "." && part !== ".."));
  const executed = (await execute("git", ["show", `${proof.run.headSha}:${file}`], { cwd: root, windowsHide: true, encoding: "buffer", timeout: 30000, maxBuffer: 262144 })).stdout;
  assert.equal(sha(executed), expected); sourcePreimages[file] = { encoding: "base64", data: executed.toString("base64") };
  currentSourcePins[file] = sha(await read(file));
  if (file === branch.workflow.path) {
    assert.equal(expected, branch.workflow.generatedSha256); assert.equal(executed.toString(), branch.workflow.generatedExactSource);
    assert.equal(currentSourcePins[file], branch.workflow.canonicalSha256);
  } else assert.equal(currentSourcePins[file], expected, file);
}
const own = "scripts/retain-mpeg2-realloc-native-sources.mjs", ownBytes = await read(own);
const bytes = Buffer.from(JSON.stringify({ sourcePins, sourcePreimages, currentSourcePins, workflowCanonicalDiffOnly: true })); assert.ok(bytes.length <= 2097152);
const zipped = gzipSync(bytes, { level: 9 }); assert.deepEqual(gunzipSync(zipped), bytes);
const archivePath = `outputs/reports/realloc-native-sources-${runId}.json.gz`;
await writeFile(path.join(root, archivePath), zipped, { flag: "wx" }); assert.equal(sha(await read(archivePath)), sha(zipped));
const postSourcePins = {}; for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await read(file)); assert.deepEqual(postSourcePins, currentSourcePins);
const output = `evidence/realloc-native-sources-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), proof: { path: proofPath, sha256: sha(proofBytes) },
  executedHead: proof.run.headSha, sourceCount: 86, allSourcesMatchedExecutedGitHead: true, workflowCanonicalDiffOnly: true,
  sourcePins, currentSourcePins, postSourcePins,
  archive: { path: archivePath, bytes: zipped.length, sha256: sha(zipped), restoredBytes: bytes.length, restoredSha256: sha(bytes) },
  actualReallocControl: proof.manifest.reallocAttempt, nativeLifecyclePassed: true,
  originalRead: false, conversions: 0, memoryAcceptance: false, speedGainProven: false, publicAcceptance: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCount: 86, archiveBytes: zipped.length }));
