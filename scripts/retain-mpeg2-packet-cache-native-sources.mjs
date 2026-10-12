// Preserve every actual native source at its exact executed Git head.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const proofPath = "evidence/mpeg2-packet-cache-build-38206263853.json", proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
assert.equal(proof.run.conclusion, "success"); assert.equal(proof.run.headSha, "021552ac0875bd22fa4f156ab329b13769ac9113");
const branch = JSON.parse(await read("evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix.json"));
assert.equal(branch.commit, proof.run.headSha); assert.equal(branch.remoteVerified, true);
const sourcePins = proof.manifest.sources, sourcePreimages = {}, currentSourcePins = {};
assert.equal(Object.keys(sourcePins).length, 72); assert.ok(Object.keys(sourcePins).length <= 128);
for (const [file, expected] of Object.entries(sourcePins)) {
  assert.match(file, /^(?:media\/ffmpeg\/|scripts\/lib\/|\.github\/workflows\/)[a-zA-Z0-9_.\/-]+$/);
  const executed = (await execute("git", ["show", `${proof.run.headSha}:${file}`], { cwd: root, windowsHide: true, encoding: "buffer", timeout: 30000, maxBuffer: 262144 })).stdout;
  assert.equal(sha(executed), expected); sourcePreimages[file] = { encoding: "base64", data: executed.toString("base64") };
  const current = await read(file); currentSourcePins[file] = sha(current);
  if (file === branch.workflow.path) {
    assert.equal(sha(executed), branch.workflow.generatedSha256); assert.equal(executed.toString(), branch.workflow.generatedExactSource);
    assert.equal(currentSourcePins[file], branch.workflow.canonicalSha256);
  } else assert.equal(currentSourcePins[file], expected);
}
const own = "scripts/retain-mpeg2-packet-cache-native-sources.mjs", ownBytes = await read(own);
const payload = Buffer.from(JSON.stringify({ sourcePins, sourcePreimages, currentSourcePins, workflowCanonicalDiffOnly: true }));
assert.ok(payload.length <= 2097152); const zipped = gzipSync(payload, { level: 9 }); assert.deepEqual(gunzipSync(zipped), payload);
const archivePath = "outputs/reports/packet-cache-native-sources-38206263853.json.gz";
await writeFile(path.join(root, archivePath), zipped, { flag: "wx" }); assert.equal(sha(await read(archivePath)), sha(zipped));
const postSourcePins = {}; for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await read(file));
assert.deepEqual(postSourcePins, currentSourcePins); assert.equal(sha(await read(own)), sha(ownBytes));
const output = "evidence/packet-cache-native-sources-38206263853.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), proof: { path: proofPath, sha256: sha(proofBytes) },
  executedHead: proof.run.headSha, sourceCount: 72, allSourcesMatchedExecutedGitHead: true, workflowCanonicalDiffOnly: true,
  sourcePins, currentSourcePins, postSourcePins,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") },
  archive: { path: archivePath, bytes: zipped.length, sha256: sha(zipped), restoredBytes: payload.length, restoredSha256: sha(payload) },
  nativeLifecyclePassed: true, originalRead: false, conversions: 0, memoryAcceptance: false, speedGainProven: false, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCount: 72, archiveBytes: zipped.length }));
