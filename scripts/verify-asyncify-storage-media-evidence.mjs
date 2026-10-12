// Independent source/compact-report join after the actual browser run. No rerun.
import assert from "node:assert/strict";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAsyncifyStorageGlue } from "./lib/asyncify-storage-glue-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = "2026-10-12T14-25-42-022Z";
const read = file => readFile(path.join(root, file)), receiptPath = `evidence/${stamp}-asyncify-storage-media.json`;
const receiptBytes = await read(receiptPath), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.failure, null); assert.equal(receipt.status, "three-headless-attempt-core-conversions-and-recovery-passed-not-full-acceptance");
assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.equal(Object.keys(receipt.sourcePins).length, 157);
async function restore(row) {
  const bytes = await read(row.path); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  const raw = gunzipSync(bytes, { maxOutputLength: 8388608 }); assert.equal(raw.length, row.restoredBytes); assert.equal(sha(raw), row.restoredSha256);
  return raw;
}
const sources = JSON.parse(await restore(receipt.generatedArchive));
assert.deepEqual(sources.sourcePins, receipt.sourcePins);
for (const [file, hash] of Object.entries(receipt.sourcePins)) {
  assert.equal(sha(sources.sources[file]), hash, file); assert.equal(sha(await read(file)), hash, file);
}
const generated = sources.generated, originalGlue = (await read("work/mpeg2-packet-cache-38206263853/within-mpeg2-split.mjs")).toString();
assert.deepEqual(generated.asyncifyGlueRecipe, makeAsyncifyStorageGlue(originalGlue));
assert.equal(generated.composition.manifest.artifacts["within-mpeg2-split.mjs"], generated.asyncifyGlueRecipe.generatedSha256);
assert.equal(generated.composition.manifest.artifacts["within-mpeg2-split.wasm"], "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
assert.equal(generated.composition.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
const restoredReport = await restore(receipt.report.archive), report = JSON.parse(restoredReport);
assert.equal(sha(restoredReport), receipt.report.sha256); assert.equal(restoredReport.length, receipt.report.bytes);
const lifecycle = report.rows.filter(row => row.kind === "actual-asyncify-storage-lifecycle").flatMap(row => row.samples);
assert.deepEqual(lifecycle, receipt.analysis.actualAsyncifyLifecycleSamples); assert.equal(lifecycle.length, 5);
for (const sample of lifecycle) {
  assert.equal(sample.allocations, 1); assert.equal(sample.frees, 1); assert.equal(sample.activeLeases, 0);
  assert.equal(sample.retainedBytes, 0); assert.equal(sample.reservationBytes, 262156); assert.ok(sample.acquisitions >= 39);
}
assert.equal(receipt.analysis.normal.ordinalSsim, 0.983095); assert.equal(receipt.analysis.normal.outputBytes, 2245558);
const outputHashes = report.rows.flatMap(row => row.outputSha256 ? [row.outputSha256] : []);
// Find the existing independently validated SHA in the actual retained rows,
// without inferring it from size or lifecycle diagnostics.
const expectedOutput = "554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27";
assert.ok(restoredReport.toString().includes(expectedOutput));
for (const value of outputHashes) assert.equal(value, expectedOutput);
assert.deepEqual(receipt.protectedPre, receipt.protectedPost); assert.equal(receipt.protectedPost.bytes, 2958573265);
assert.equal(receipt.protectedPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(receipt.cleanup.normalAppAndCssUnchanged, true); assert.equal(receipt.cleanup.privateAdditionsAbsent, true);
assert.equal(receipt.cleanup.ownedWrapperAbsent, true); assert.deepEqual(receipt.cleanup.newFixtureDirsRemaining, []);
await assert.rejects(access(receipt.cleanup.ownedWrapper), { code: "ENOENT" });
for (const row of receipt.cleanup.helpers.launchRecords) assert.equal(row.absence.status, "owned-identity-absent");
const target = path.resolve(root, receipt.report.path), approved = path.resolve(root, "output/playwright");
assert.equal(path.dirname(target), approved); assert.ok(path.basename(target).includes("packet-cache-media-Tr0qO9-direct-artwork"));
const rawExists = await access(target).then(() => true, error => { if (error.code !== "ENOENT") throw error; return false; });
if (rawExists) assert.deepEqual(await readFile(target), restoredReport);
const own = "scripts/verify-asyncify-storage-media-evidence.mjs", ownBytes = await read(own);
const proofPath = `evidence/${stamp}-asyncify-storage-media-verified.json`;
const proof = { recordedAt: new Date().toISOString(), status: "actual-short-browser-reuse-fidelity-recovery-and157-source-join-passed-not-full-acceptance",
  receipt: { path: receiptPath, sha256: sha(receiptBytes) }, sources: receipt.generatedArchive, sourceCount: 157,
  allActualSourcesAndPostPinsMatchCurrent: true, actualGeneratedGlueSha256: generated.asyncifyGlueRecipe.generatedSha256,
  nativeWasmChanged: false, fixedAggregateWasmBytes: 50331648, stackBytes: 262144, reservationBytes: 262156,
  actualModuleLifecycles: lifecycle, genuineCompletedConversions: 3, outputBytes: 2245558, outputSha256: expectedOutput,
  ordinalSsim: receipt.analysis.normal.ordinalSsim,
  elapsedMs: [receipt.analysis.normal.elapsedMs, ...receipt.analysis.recovery.results.map(row => row.analysis.elapsedMs)],
  protectedOriginalUnchanged: true, stockAssetsRestored: true, ownedDisposableMediaAndRuntimeRemoved: true,
  redundantRawReport: { path: receipt.report.path, bytes: receipt.report.bytes, sha256: receipt.report.sha256,
    losslesslyRestoredArchive: receipt.report.archive, removed: true },
  completeChromiumMemoryAcceptance: false, fullOriginalAcceptance: false, controlledSpeedGainProven: false, publicAcceptance: false,
  next: "Integrate this changed glue and explicit close into a fresh source-bound durable full harness; preserve original three-complete-run, full fidelity and250MiB gates. Do not replay unchanged old glue or promote this short result.",
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
// Delete only a verified redundant raw report; the lossless compact copy remains.
// No generated media, protected fixture, or unrelated report is a target.
if (rawExists) await rm(target);
await assert.rejects(access(target), { code: "ENOENT" });
await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, status: proof.status, sourceCount: proof.sourceCount, rawRemoved: true }));
