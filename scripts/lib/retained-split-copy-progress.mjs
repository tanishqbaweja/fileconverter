// Independently check the terminal archives before reusing any baseline observation.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./stable-ui-headless-baseline-recipe.mjs";
import { splitRenderNativeFacts } from "./split-render-progress-evidence.mjs";
import { makeSplitCopyProgressDriver } from "./split-copy-progress-recipe.mjs";
import { copyAdapterBinding } from "./split-copy-staged-guard-recipe.mjs";
export const retainedCopyReceipt = "evidence/2026-10-09T14-31-37-500Z-split-copy-progress.json";
export const retainedCopyReceiptSha256 = "2a71fe9dcecc4ef91a2b8012973625648daabbfa8cfcbcff8754294c15931817";
export async function loadRetainedCopyProgress(root) {
  const read = file => readFile(path.join(root, file));
  const bytes = await read(retainedCopyReceipt); assert.equal(sha(bytes), retainedCopyReceiptSha256);
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.status, "failed-or-incomplete"); assert.equal(receipt.productionRestored, true);
  assert.deepEqual(receipt.postSourcePins, receipt.sourcePins);
  assert.equal(Object.keys(receipt.sourcePins).length, 136);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) assert.equal(sha(await read(file)), hash, file);
  const parentArchive = await read("outputs/reports/2026-10-08T22-04-15-944Z-ui-progress-baseline-executed-sources.json.gz");
  assert.equal(sha(parentArchive), "5111278bc1b5bbe47585679fda04a351e6885aa6974def53663800a81b8bc695");
  const executed = JSON.parse(gunzipSync(parentArchive, { maxOutputLength: 1048576 }));
  const rows = [];
  assert.deepEqual(receipt.executions.map(row => row.mode), ["baseline", "candidate"]);
  for (const record of receipt.executions) {
    const compressed = await read(record.compressedReport.path);
    assert.equal(compressed.length, record.compressedReport.bytes); assert.equal(sha(compressed), record.compressedReport.sha256);
    const rawBytes = gunzipSync(compressed, { maxOutputLength: 32 * 1024 ** 2 });
    assert.equal(rawBytes.length, record.rawReport.bytes); assert.equal(sha(rawBytes), record.rawReport.sha256);
    const raw = JSON.parse(rawBytes), sourceBytes = await read(record.sourceArchive.path);
    assert.equal(sourceBytes.length, record.sourceArchive.bytes); assert.equal(sha(sourceBytes), record.sourceArchive.sha256);
    const inflated = gunzipSync(sourceBytes, { maxOutputLength: 2 * 1024 ** 2 });
    assert.equal(sha(inflated), record.sourceArchive.restoredSha256);
    const source = JSON.parse(inflated);
    assert.equal(sha(source.generated), record.sourceArchive.driverSha256);
    assert.equal(sha(source.traceHelper), record.sourceArchive.traceHelperSha256);
    const helperUri = source.generated.match(/^import \{ startBoundedRendererAttribution \} from "([^"]+)";$/m)?.[1];
    assert.ok(helperUri);
    assert.equal(makeSplitCopyProgressDriver(executed.generated, root, helperUri, baselineBinding, record.mode).generated, source.generated);
    assert.equal(record.rawRemovedAfterLosslessArchive, true);
    await assert.rejects(access(path.join(root, record.rawReport.path)), { code: "ENOENT" });
    await assert.rejects(access(raw.runtimeDirectory), { code: "ENOENT" });
    assert.equal(raw.status, "failed"); assert.equal(record.actualExitCode, 1);
    assert.equal(raw.source.bytes, 2958573265);
    assert.equal(raw.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
    assert.deepEqual(raw.forbiddenRequests, []); assert.equal(raw.limitMiB, 250);
    for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged"]) assert.equal(raw.cleanup[key], true);
    assert.ok(!raw.cleanup.errors?.length);
    rows.push({ record, raw, source });
  }
  const [baseline, candidate] = rows;
  assert.equal(baseline.raw.runs.length, 1); assert.equal(baseline.raw.runs[0].state.jobState, "cancelled");
  assert.equal(baseline.raw.progressProbe.checkpointReached, true);
  assert.equal(baseline.raw.progressProbe.workCheckpoints.length, 5);
  assert.deepEqual(baseline.raw.progressProbe.actualServedAsset, baselineBinding);
  for (const key of ["observerStopped", "sampledChromeRootStopped"]) assert.equal(baseline.raw.cleanup[key], true);
  const native = splitRenderNativeFacts(baseline.raw, "baseline");
  assert.equal(native.actualPeakPrivateBytes, 490360832); assert.equal(native.blankPrivateBytes, 241704960);
  assert.equal(native.observedIncrementalPrivateMiB, 237.13671875);
  assert.equal(candidate.raw.runs.length, 0); assert.equal(candidate.raw.nativeMemory, null);
  assert.equal(candidate.raw.blankBaseline, null); assert.equal(candidate.raw.progressProbe.actualServedAsset, null);
  assert.deepEqual(candidate.raw.ownedPids, { chrome: null, server: null, observer: null });
  assert.deepEqual(candidate.raw.splitFinalSamples, []);
  assert.match(candidate.raw.failure.message, /19517 !== 18330/);
  const goldenArchive = await read("evidence/2026-10-09T04-15-41-611Z-split-copy-kernel-goldens.json.gz");
  assert.equal(sha(goldenArchive), "44eb903290a93187487d38b3764bd11793cd34f926371916dc5ca82398e67ac3");
  const golden = JSON.parse(gunzipSync(goldenArchive, { maxOutputLength: 2 * 1024 ** 2 }));
  assert.equal(golden.status, "headless-changed-copy-kernel-five-goldens-passed");
  const adapters = golden.overlay.existing.filter(row => /^within-(remux|mpeg4|direct)\.mjs$/.test(row.file));
  assert.equal(adapters.length, 3);
  for (const row of adapters) {
    assert.equal(Buffer.byteLength(row.generated), copyAdapterBinding.bytes);
    assert.equal(sha(row.generated), copyAdapterBinding.sha256); assert.equal(row.generatedSha256, copyAdapterBinding.sha256);
  }
  for (const [file, hash] of Object.entries(baseline.raw.manifest.artifacts))
    assert.equal(sha(await read(`work/mpeg2-split-pipeline-37739125738/${file}`)), hash, file);
  const app = await read("dist/client" + baselineBinding.url);
  assert.equal(app.length, baselineBinding.bytes); assert.equal(sha(app), baselineBinding.sha256);
  return { receipt, baseline, candidate, executed, native, terminalEvidenceVerified: true,
    candidateBrowserNeverLaunched: true, completeConversionAcceptance: false };
}
