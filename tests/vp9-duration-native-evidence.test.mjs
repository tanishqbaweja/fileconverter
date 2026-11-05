// Authenticate retained source/build/browser evidence; never replay conversion.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root)), json = async file => JSON.parse(await read(file));
const sha = value => createHash("sha256").update(value).digest("hex");
const base = "evidence/2026-11-05-webcodecs-vp9-duration-fixed-42013264823";
async function detailed() {
  const compact = await json(base + ".json"), packed = await read(compact.rawArchive.file), raw = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(sha(packed), compact.rawArchive.sha256); assert.equal(sha(raw), compact.rawArchive.decodedSha256);
  assert.equal(raw.length, compact.rawArchive.decodedBytes); return JSON.parse(raw);
}
test("two failed builds retain exact distinct causes and cleanup, third source build succeeds without Docker", async () => {
  const first = await json("evidence/2026-11-05-vp9-duration-build-42010056006-terminal.json"),
    second = await json("evidence/2026-11-05-vp9-duration-build-42010620047-terminal.json"),
    third = await json("evidence/2026-11-05-vp9-duration-build-42013264823-terminal.json");
  assert.equal(first.conclusion, "failure"); assert.ok(first.errorLines.some(x => x.includes("curl: (35)")));
  assert.equal(second.conclusion, "failure"); assert.ok(second.errorLines.some(x => x.includes("require is not defined in ES module scope")));
  assert.equal(third.conclusion, "success"); assert.equal(third.head, "708178cec70691a7ef11664877daf72e952d0807");
  for (const r of [first, second, third]) { assert.equal(r.exactHeadAndStepsVerified, true); assert.equal(r.cleanupStepsPassed, true); assert.equal(r.browserConversions, 0); }
});
test("actual private native bytes bind the one reconstructed source delta, identical memory limits and source SDK", async () => {
  const native = await json("evidence/2026-11-05-vp9-duration-native-42013264823.json"), contract = native.nativeContract;
  assert.deepEqual(contract.artifacts["within-remux.wasm"], { bytes: 9873859,
    sha256: "072f798ea4fc3a1c5f144d0ac9ba47750e4cac22296151debc39f89a0a988577" });
  assert.equal(contract.candidate.baseWrapperSha256, "ff8926c995010617bcc76701f0ea75feb5a2c99dadb136d8b8d1c8703e5d6dcd");
  assert.equal(contract.candidate.compiledWrapperSha256, "6f9c51ce2ab944dddc76a305a8d7aa0ebb98b36f806eefb99e10963b27eb497b");
  assert.deepEqual(contract.candidate.wasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }]);
  assert.equal(contract.candidate.wrapperEdits, 1); assert.equal(contract.candidate.ioChanged, false); assert.equal(contract.candidate.codecSettingsChanged, false);
  assert.equal(contract.candidate.memoryLimitsRaised, false); assert.equal(contract.buildEnvironment.emscripten, "6.0.4");
  assert.equal(contract.buildEnvironment.usedDocker, false); assert.equal(native.publicAssetReplacement, false); assert.equal(native.nodeInstantiated, false);
  assert.equal(native.mediaRead, false); assert.equal(native.retainedBytes, 10404855); assert.equal(native.publicAcceptance, false);
});
test("real browser uses the two authenticated static overrides and fixes container duration without changing quality or clocks", async () => {
  const r = await detailed(), fidelity = r.independentFidelity;
  assert.equal(r.executedHead, "cd0d06a8a5f70c9debf0de3626dc6bbdb77eb9e7"); assert.equal(r.browserResult.type, "complete");
  assert.equal(r.independentFullDecodePassed, true); assert.deepEqual(fidelity.clocks, { frames: 48, maximumVideoPtsErrorSeconds: 0 });
  assert.deepEqual([fidelity.containerDuration.sourceSeconds, fidelity.containerDuration.outputSeconds, fidelity.containerDuration.errorSeconds], [2, 2, 0]);
  assert.equal(fidelity.containerDuration.passed, true); assert.equal(fidelity.containerDuration.toleranceSeconds, 0.001);
  assert.equal(fidelity.ssim.score, 0.993273); assert.equal(fidelity.ssim.comparedFrames, 48); assert.equal(fidelity.ssim.passed, true);
  assert.equal(fidelity.metadata.length, 8); assert.ok(fidelity.metadata.every(row => row.equal));
  assert.equal(r.outputSha256, "be890dca0bb313b91030076c3f057f5be6eaaad98c64307f6dc32f6649819159");
  assert.deepEqual(r.privateCpuOverride.served, { javascript: 1, wasm: 1 }); assert.equal(r.privateAssetErrorCount, 0);
  assert.equal(r.privateCpuOverride.sourceHead, "708178cec70691a7ef11664877daf72e952d0807");
  assert.equal(r.privateCpuOverride.publicAssetReplacement, false); assert.equal(r.privateCpuOverride.cachePolicyChanged, false);
  assert.equal(r.privateCpuOverride.securityCacheAndMimeHeadersPreserved, true);
});
test("missing decoded durations remain a failed strict verdict, not fabricated zero or presumed missing encoded durations", async () => {
  const r = await detailed(), fidelity = r.independentFidelity;
  assert.equal(r.status, "failed-private-vp9-browser-smoke"); assert.equal(fidelity.passed, false);
  assert.equal(fidelity.failures.length, 1); assert.match(fidelity.failures[0], /Decoded frame duration unavailable/);
  assert.equal(fidelity.outputFrames.framesWithDuration, 7); assert.equal(fidelity.sourceFrames.framesWithDuration, 48);
  assert.equal(fidelity.decodedDurationsAreNotEncodedPacketDurationProof, true);
  assert.equal(r.memory.incrementalPrivateMiB, (593338368 - 354029568) / 1048576);
  assert.equal(r.memory.incrementalPrivateMiB, 228.22265625); assert.equal(r.memory.validSamples, 49); assert.equal(r.memory.unavailableSamples, 0);
  assert.equal(r.publicAcceptance, false); assert.equal(r.speedGainProven, false); assert.equal(r.fullStressAcceptance, false);
  assert.equal(r.processCleanup.length, 3); assert.ok(r.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.ownedStaticStageRemoved, true); assert.equal(r.browserPinFinalCheck, "verified");
  assert.deepEqual(r.originalBefore, r.originalAfter); assert.deepEqual(r.forbiddenRequests, []);
  assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  const saved = await json("evidence/2026-11-05-webcodecs-vp9-duration-fixed-control-42013264823-archive.json");
  assert.equal(saved.allRoundtripsVerified, true); assert.equal(sha(await read(saved.reports[0].file)), saved.reports[0].compactSha256);
});
