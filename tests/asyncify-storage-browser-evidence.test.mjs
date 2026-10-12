import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectAsyncifyMediaReport } from "../scripts/lib/asyncify-storage-media-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const stamp = "2026-10-12T14-25-42-022Z", receiptPath = `evidence/${stamp}-asyncify-storage-media.json`;
async function records() {
  const bytes = await read(receiptPath), receipt = JSON.parse(bytes);
  const proof = JSON.parse(await read(`evidence/${stamp}-asyncify-storage-media-verified.json`));
  assert.equal(sha(bytes), proof.receipt.sha256);
  async function restore(row) {
    const zipped = await read(row.path); assert.equal(zipped.length, row.bytes); assert.equal(sha(zipped), row.sha256);
    const raw = gunzipSync(zipped, { maxOutputLength: 8388608 }); assert.equal(raw.length, row.restoredBytes); assert.equal(sha(raw), row.restoredSha256); return JSON.parse(raw);
  }
  return { receipt, proof, sources: await restore(receipt.generatedArchive), report: await restore(receipt.report.archive) };
}
test("actual157-source closure and generated glue match current pre/post bytes; fixed native engines and stack unchanged", async () => {
  const { receipt, proof, sources } = await records();
  assert.equal(receipt.failure, null); assert.equal(Object.keys(receipt.sourcePins).length, 157);
  assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.deepEqual(receipt.sourcePins, sources.sourcePins);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) { assert.equal(sha(await read(file)), hash, file); assert.equal(sha(sources.sources[file]), hash, file); }
  assert.equal(sha(sources.generated.asyncifyGlueRecipe.generated), proof.actualGeneratedGlueSha256);
  assert.equal(sources.generated.composition.manifest.aggregateWasmMemoryBytes, 50331648);
  assert.equal(sources.generated.composition.manifest.allowMemoryGrowth, false);
  assert.equal(proof.reservationBytes, 262156); assert.equal(proof.stackBytes, 262144); assert.equal(proof.nativeWasmChanged, false);
});
test("real browser lifecycle, three independently decoded byte-exact outputs and two recovery jobs pass without claiming full or speed acceptance", async () => {
  const { receipt, proof, report } = await records();
  const prior = JSON.parse(await read("evidence/mpeg2-late-abort-goldens-2026-10-08.json")), build = JSON.parse(await read("evidence/mpeg2-encoder-plane-build-38044000567.json"));
  assert.deepEqual(inspectAsyncifyMediaReport(report, prior.reports[0].report, build), receipt.analysis);
  const decoded = report.rows.filter(row => row.nativeFullDecodePassed === true); assert.equal(decoded.length, 3);
  for (const row of decoded) { assert.equal(row.outputSha256, proof.outputSha256); assert.equal(row.outputBytes, 2245558); assert.equal(row.ordinalSsim, 0.983095); }
  const hashes = report.rows.filter(row => row.outputSha256); assert.equal(hashes.length, 9);
  for (const row of hashes) assert.equal(row.outputSha256, proof.outputSha256);
  assert.deepEqual(proof.actualModuleLifecycles.map(row => row.acquisitions), [69, 69, 69, 39, 69]);
  for (const row of proof.actualModuleLifecycles) { assert.equal(row.allocations, 1); assert.equal(row.frees, 1); assert.equal(row.activeLeases, 0); assert.equal(row.retainedBytes, 0); }
  for (const key of ["fullOriginalAcceptance", "completeChromiumMemoryAcceptance", "controlledSpeedGainProven", "publicAcceptance"]) assert.equal(proof[key], false);
});
test("original stays byte-exact, stock assets restored, disposable owned data gone, redundant raw report has lossless gzip and audit preimage", async () => {
  const { receipt, proof } = await records(); assert.deepEqual(receipt.protectedPre, receipt.protectedPost);
  assert.equal(receipt.protectedPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(receipt.cleanup.normalAppAndCssUnchanged, true); assert.equal(receipt.cleanup.privateAdditionsAbsent, true);
  assert.equal(proof.ownedDisposableMediaAndRuntimeRemoved, true);
  await assert.rejects(access(receipt.cleanup.ownedWrapper), { code: "ENOENT" });
  await assert.rejects(access(path.join(root, proof.redundantRawReport.path)), { code: "ENOENT" });
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256);
});
