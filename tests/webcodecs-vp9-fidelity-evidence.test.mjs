import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url), base = "evidence/2026-11-05-webcodecs-vp9-isolated-fidelity";
const read = file => readFile(new URL(file, root)), sha = value => createHash("sha256").update(value).digest("hex");
async function detailed() {
  const report = JSON.parse(await read(base + ".json")), packed = await read(report.rawArchive.file);
  const raw = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(sha(packed), report.rawArchive.sha256); assert.equal(sha(raw), report.rawArchive.decodedSha256);
  assert.equal(raw.length, report.rawArchive.decodedBytes); return JSON.parse(raw);
}
test("actual fidelity control records exact48-frame clocks and passing full-frame0.993273SSIM", async () => {
  const report = await detailed(), fidelity = report.independentFidelity;
  assert.equal(report.executedHead, "8d9d5f51f855605b5e0ef491a85d84adffeebd21");
  assert.equal(report.browserResult.type, "complete"); assert.equal(report.independentFullDecodePassed, true);
  assert.deepEqual(fidelity.clocks, { frames: 48, maximumVideoPtsErrorSeconds: 0 });
  assert.equal(fidelity.ssim.score, 0.993273); assert.equal(fidelity.ssim.minimumRequired, 0.98);
  assert.equal(fidelity.ssim.comparedFrames, 48); assert.equal(fidelity.ssim.progressEnded, true); assert.equal(fidelity.ssim.passed, true);
  assert.equal(fidelity.metadata.length, 8); assert.ok(fidelity.metadata.every(row => row.equal));
  assert.equal(report.outputSha256, "f2126eccabdc332e4db7792080e219297905eedfdb339b9d2a8db3812433593e");
});
test("strict duration failure is retained despite memory/quality pass and all presentation clocks matching", async () => {
  const report = await detailed(), fidelity = report.independentFidelity;
  assert.equal(report.status, "failed-private-vp9-browser-smoke"); assert.equal(fidelity.passed, false);
  assert.equal(fidelity.containerDuration.sourceSeconds, 2); assert.equal(fidelity.containerDuration.outputSeconds, 1.958);
  assert.equal(fidelity.containerDuration.toleranceSeconds, 0.001); assert.equal(fidelity.containerDuration.passed, false);
  assert.equal(fidelity.sourceFrames.framesWithDuration, 48); assert.equal(fidelity.outputFrames.framesWithDuration, 7);
  assert.equal(fidelity.decodedDurationsAreNotEncodedPacketDurationProof, true);
  assert.equal(fidelity.failures.length, 2); assert.ok(fidelity.failures.some(x => x.includes("Container duration")));
  assert.ok(fidelity.failures.some(x => x.includes("Decoded frame duration unavailable")));
  assert.equal(report.memory.incrementalPrivateMiB, (585158656 - 347181056) / 1048576);
  assert.equal(report.memory.incrementalPrivateMiB, 226.953125); assert.equal(report.memory.validSamples, 19);
  assert.equal(report.memory.unavailableSamples, 0); assert.equal(report.publicAcceptance, false); assert.equal(report.speedGainProven, false);
});
test("actual independent validators are identified and all data/process cleanup plus original integrity passed", async () => {
  const report = await detailed(); assert.match(report.independentFidelity.toolVersions.ffmpeg, /^ffmpeg version N-122712-g7e3781e3ca-20260211 /);
  assert.match(report.independentFidelity.toolVersions.ffprobe, /^ffprobe version N-122712-g7e3781e3ca-20260211 /);
  assert.equal(report.processCleanup.length, 3); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(report.ownedRuntimeRemoved, true); assert.equal(report.ownedStaticStageRemoved, true); assert.equal(report.browserPinFinalCheck, "verified");
  assert.deepEqual(report.originalAfter, report.originalBefore);
  assert.equal(report.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(report.forbiddenRequests, []);
  const saved = JSON.parse(await read("evidence/2026-11-05-webcodecs-vp9-isolated-fidelity-control-archive.json"));
  assert.equal(saved.reports.length, 1); assert.equal(saved.allRoundtripsVerified, true);
  assert.equal(sha(await read(saved.reports[0].file)), saved.reports[0].compactSha256);
});
test("fidelity recipe adds stronger gates without changing native source, baseline formula or old250MiB gate", async () => {
  const recipe = JSON.parse(await read(base + "-recipe.json")), source = (await read("scripts/test-webcodecs-vp9-smoke.mjs")).toString();
  assert.equal(sha(source), recipe.parentSha256); let generated = source;
  for (const [before, after] of recipe.edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  assert.equal(sha(generated), recipe.generatedSha256);
  assert.equal(recipe.isolatedFidelity, true); assert.equal(recipe.fidelityThresholdsRelaxed, false);
  assert.equal(recipe.baselineFormulaChanged, false); assert.equal(recipe.baselineWindowOrThresholdChanged, false);
  assert.ok(generated.includes('assert.equal(report.independentFidelity.passed, true'));
  assert.ok(generated.includes('peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250'));
  assert.ok(generated.includes('assert.equal(report.blankBaseline?.stable, true, "Stable blank baseline remains required'));
  for (const [before, after] of recipe.edits.toReversed()) generated = generated.replace(after, before);
  assert.equal(generated, source);
});
