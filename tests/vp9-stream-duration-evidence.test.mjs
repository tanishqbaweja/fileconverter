// Retained actual build/browser evidence; never reruns conversion.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root)), json = async file => JSON.parse(await read(file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const base = "evidence/2026-11-05-webcodecs-vp9-stream-duration-fidelity-42020605269";
test("changed native build authenticates two source edits, unchanged memory limits and successful cleanup", async () => {
  const native = await json("evidence/2026-11-05-vp9-duration-native-42020605269.json"),
    terminal = await json("evidence/2026-11-05-vp9-duration-build-42020605269-terminal.json"), contract = native.nativeContract;
  assert.equal(terminal.conclusion, "success"); assert.equal(terminal.cleanupStepsPassed, true); assert.equal(terminal.head, native.head);
  assert.equal(native.head, "6db1490c15a7e933d468aa6696bc9523c284c3a5");
  assert.equal(contract.engine, "private-vp9-stream-duration"); assert.equal(contract.candidate.wrapperEdits, 2);
  assert.equal(contract.candidate.compiledWrapperSha256, "3742b033b2dc4ebd4e27b0017eff0540ee6298c91893099d1a81f925b8affb52");
  assert.deepEqual(contract.artifacts["within-remux.wasm"], { bytes: 9873881, sha256: "a89092c3edaa6b8b5e9b2d8503db6685ed080736109db4f4fc1708506862f05c" });
  assert.deepEqual(contract.candidate.wasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }]);
  for (const field of ["memoryLimitsRaised", "codecSettingsChanged", "ioChanged", "nodeInstantiated", "mediaRead", "mediaWritten"])
    assert.equal(contract.candidate[field], false);
  assert.equal(native.retainedBytes, 10412260); assert.equal(native.publicAcceptance, false); assert.equal(contract.buildEnvironment.usedDocker, false);
});
test("real changed-tool browser now passes all48 decoded durations, exact clocks and stored default without lowering fidelity", async () => {
  const r = await json(base + ".json"), f = r.independentFidelity;
  assert.equal(r.executedHead, "2c18a14eb371c95b92dc525e39fba725ee4e359c");
  assert.equal(r.status, "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance");
  assert.equal(r.independentFullDecodePassed, true); assert.equal(f.passed, true); assert.deepEqual(f.failures, []);
  assert.deepEqual(f.clocks, { frames: 48, maximumVideoPtsErrorSeconds: 0 });
  assert.equal(f.sourceFrames.framesWithDuration, 48); assert.equal(f.outputFrames.framesWithDuration, 48);
  assert.equal(f.containerDuration.sourceSeconds, 2); assert.equal(f.containerDuration.outputSeconds, 2);
  assert.equal(f.containerDuration.toleranceSeconds, 0.001); assert.equal(f.ssim.minimumRequired, 0.98); assert.equal(f.ssim.score, 0.993273);
  assert.equal(f.ssim.comparedFrames, 48); assert.ok(f.metadata.length === 8 && f.metadata.every(row => row.equal));
  assert.equal(r.storedTiming.output.tracks[0].defaultDurationNs, 41666666); assert.equal(r.storedTiming.explicitDefaultDurationGatePassed, true);
  assert.equal(r.storedTiming.output.blocks.length, 48); assert.equal(r.outputSha256, "82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b");
  assert.deepEqual(r.privateCpuOverride.served, { javascript: 1, wasm: 1 }); assert.equal(r.privateAssetErrorCount, 0);
  assert.equal(r.exportedBytes, 99413); assert.equal(r.fixture.bytes, 58389);
});
test("same exact full-tree memory formula passes one small run, with privacy/cleanup and byte-exact archive, not large stress or speedup", async () => {
  const r = await json(base + ".json"), archive = await json("evidence/2026-11-05-webcodecs-vp9-stream-duration-fidelity-control-42020605269-archive.json");
  assert.equal(r.blankBaseline.stable, true); assert.equal(r.blankBaseline.privateBytes, 358141952);
  assert.equal(r.memory.peak.privateBytes, 552886272); assert.equal(r.memory.incrementalPrivateMiB, (552886272 - 358141952) / 1048576);
  assert.equal(r.memory.incrementalPrivateMiB, 185.72265625); assert.equal(r.memory.validSamples, 39); assert.equal(r.memory.unavailableSamples, 0);
  assert.equal(r.publicAcceptance, false); assert.equal(r.speedGainProven, false); assert.equal(r.fullStressAcceptance, false);
  assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.ownedStaticStageRemoved, true);
  assert.equal(r.processCleanup.length, 3); assert.ok(r.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.deepEqual(r.forbiddenRequests, []); assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  const packed = await read(r.rawArchive.file), raw = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(sha(packed), r.rawArchive.sha256); assert.equal(sha(raw), r.rawArchive.decodedSha256); assert.equal(raw.length, 302302);
  assert.equal(archive.retainedBytes, 120866); assert.equal(archive.allRoundtripsVerified, true);
  assert.equal(sha(await read(base + ".json")), archive.reports[0].compactSha256);
});
test("superseded static tool was removed only after exact owner/content checks and successful replacement, recoverable from source pins", async () => {
  const r = await json("evidence/2026-11-05-vp9-duration-superseded-input-cleanup.json");
  assert.equal(r.target, "work/vp9-duration-input-42013264823"); assert.equal(r.files, 17); assert.equal(r.bytes, 10404971);
  assert.equal(r.verifiedExactOwnedContents, true); assert.equal(r.replacementRunId, 42020605269);
  assert.equal(r.replacementStrictSmallBrowserPassed, true); assert.equal(r.userMediaReadOrRemoved, false); assert.equal(r.removed, true);
  assert.equal(r.recovery.pinnedSourceRebuildHead, "708178cec70691a7ef11664877daf72e952d0807");
});
