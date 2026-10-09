// Portable recipe-test input ONLY. Does not certify current native cores/dist/runtime.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { baselineBinding, sha } from "./stable-ui-headless-baseline-recipe.mjs";
export async function loadArchivedJsCopyControl(root) {
  const read = file => readFile(path.join(root, file));
  const receiptBytes = await read("evidence/2026-10-09T14-31-37-500Z-split-copy-progress.json");
  assert.equal(sha(receiptBytes), "2a71fe9dcecc4ef91a2b8012973625648daabbfa8cfcbcff8754294c15931817");
  const receipt = JSON.parse(receiptBytes); assert.equal(receipt.status, "failed-or-incomplete");
  assert.equal(receipt.productionRestored, true); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  const record = receipt.executions[0]; assert.equal(record.mode, "baseline"); assert.equal(record.actualExitCode, 1);
  const compressed = await read(record.compressedReport.path);
  assert.equal(sha(compressed), record.compressedReport.sha256); assert.equal(compressed.length, record.compressedReport.bytes);
  const rawBytes = gunzipSync(compressed, { maxOutputLength: 32 * 1024 ** 2 });
  assert.equal(sha(rawBytes), record.rawReport.sha256); assert.equal(rawBytes.length, record.rawReport.bytes);
  const raw = JSON.parse(rawBytes);
  assert.equal(raw.status, "failed"); assert.equal(raw.runs.length, 1); assert.equal(raw.runs[0].state.jobState, "cancelled");
  assert.equal(raw.runs[0].independentValidation, null); assert.equal(raw.progressProbe.checkpointReached, true);
  assert.equal(raw.progressProbe.checkpointOutputBytes, 67108864); assert.equal(raw.progressProbe.maximumConversionMs, 300000);
  assert.equal(raw.progressProbe.workCheckpoints.length, 5); assert.deepEqual(raw.progressProbe.actualServedAsset, baselineBinding);
  assert.equal(raw.source.bytes, 2958573265); assert.equal(raw.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(raw.limitMiB, 250); assert.equal(raw.blankBaseline.privateBytes, 241704960); assert.deepEqual(raw.forbiddenRequests, []);
  const parent = await read("outputs/reports/2026-10-08T22-04-15-944Z-ui-progress-baseline-executed-sources.json.gz");
  assert.equal(sha(parent), "5111278bc1b5bbe47585679fda04a351e6885aa6974def53663800a81b8bc695");
  const executed = JSON.parse(gunzipSync(parent, { maxOutputLength: 1048576 }));
  assert.equal(sha(executed.generated), "497e36673ec4cfe92918e3fc47c0cf230d01fb250e7d0fdb14ca496fc50969c9");
  assert.equal(sha(executed.traceHelper), "1dc7d48d4fb9d281f09ad96fc584a1eb13ed4c892af368321c88dccc1e17de61");
  return { receipt, baseline: { record, raw }, executed, scope: "Archived recipe-test input only; no current artifact verification",
    currentCoreVerified: false, currentProductionVerified: false, completeConversionAcceptance: false };
}
