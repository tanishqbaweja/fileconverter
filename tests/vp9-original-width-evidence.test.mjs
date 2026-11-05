// Genuine compiled original-width core and failed browser attempt; no replay.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root)), json = async file => JSON.parse(await read(file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), base = "evidence/2026-11-06-vp9-original-cpu-startup-attempt3";
test("source-built original-width tool binds all three source edits without raising memory or changing default/public policy", async () => {
  const native = await json("evidence/2026-11-06-vp9-original-width-native-42122918540.json"), contract = native.nativeContract,
    terminal = await json("evidence/2026-11-06-vp9-original-width-build-42122918540-terminal.json");
  assert.equal(native.head, "f8c53adc3da8fd87bb5ff84cc0259ad787b502aa"); assert.equal(terminal.head, native.head);
  assert.equal(terminal.conclusion, "success"); assert.equal(terminal.cleanupStepsPassed, true);
  assert.equal(contract.engine, "private-vp9-original-width"); assert.equal(contract.candidate.wrapperEdits, 3);
  assert.equal(contract.candidate.compiledWrapperSha256, "480532d89a4b4f696fced0faaa7be4f29cdbe7a71b990c69dfd2ddef6d346aa6");
  assert.deepEqual(contract.artifacts["within-remux.wasm"], { bytes: 9873884, sha256: "a57d9167160ce1cd09bf4e2a5cd71c730bd2c4b38982828918a04b84aadfdf17" });
  assert.deepEqual(contract.candidate.wasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }]);
  assert.equal(contract.candidate.privateVp9ExplicitWidth, 1920);
  for (const field of ["memoryLimitsRaised", "defaultWidthPolicyChanged", "publicWidthRegistryOrControlsChanged", "codecSettingsChanged", "ioChanged", "nodeInstantiated", "mediaRead", "mediaWritten"])
    assert.equal(contract.candidate[field], false);
  assert.equal(native.publicAcceptance, false); assert.equal(contract.buildEnvironment.usedDocker, false);
});
test("full original reaches real CPU media I/O then fails temporal-buffer allocation, not allowlist or successful conversion", async () => {
  const r = await json(base + ".json"), result = r.browserResult;
  assert.equal(r.executedHead, "2fae3ed042cd4974d23c74ad994028050cdaba2f"); assert.equal(r.inputSelection.completeOriginalSelected, true);
  assert.equal(r.privateCpuOverride.runId, 42122918540); assert.deepEqual(r.privateCpuOverride.served, { javascript: 1, wasm: 1 });
  assert.equal(r.originalStartup.limits.width, 1920); assert.equal(r.originalStartup.limits.height, 804);
  assert.equal(r.originalStartup.limits.frameRate, 24); assert.equal(r.originalStartup.limits.bitRateBps, 4000000);
  assert.equal(result.type, "error"); assert.equal(result.encoder, null); assert.equal(result.nativeBrowserCpuOnly, true);
  assert.match(result.message, /Error encoding frame: Memory allocation error/); assert.match(result.message, /Failed to allocate temporal filter buffer/);
  assert.doesNotMatch(result.message, /outside the bounded allowlist/);
  assert.equal(result.sourceFileBytes, 2958573265); assert.equal(result.sourceCopied, false);
  assert.equal(result.metrics.inputBytes, 353857); assert.equal(result.metrics.outputBytes, 485); assert.equal(result.writeAttempts, 1);
  assert.equal(result.metrics.wasmMemoryBytes, 76283904); // Last reported value, NOT exact allocator-failure heap/peak proof.
  assert.equal(r.originalStartup.passedStartupOnly, false); assert.equal(r.originalStartup.fullOriginalConverted, false);
  assert.equal(r.originalStartup.independentFullFidelityPassed, false); assert.equal(r.publicAcceptance, false);
  assert.equal(r.memory.incrementalPrivateMiB, (554868736 - 350760960) / 1048576); assert.equal(r.memory.incrementalPrivateMiB, 194.65234375);
  assert.equal(r.memory.validSamples, 32); assert.equal(r.memory.unavailableSamples, 0);
});
test("failed original output is aborted and removed; exact archived evidence/cleanup/privacy/original integrity remain", async () => {
  const r = await json(base + ".json"), manifest = await json(base + "-archive.json");
  assert.equal(r.browserResult.cleanupComplete, true); assert.equal(r.browserResult.partialOutputBytes, 0);
  assert.equal(r.originalStartup.partialOutputRemoved, true); assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.ownedStaticStageRemoved, true);
  assert.equal(r.processCleanup.length, 3); assert.ok(r.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.deepEqual(r.originalBefore, r.originalAfter); assert.deepEqual(r.forbiddenRequests, []);
  assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  const packed = await read(r.rawArchive.file), bytes = gunzipSync(packed, { maxOutputLength: 8388608 });
  assert.equal(sha(packed), r.rawArchive.sha256); assert.equal(sha(bytes), r.rawArchive.decodedSha256); assert.equal(bytes.length, 278549);
  assert.equal(manifest.retainedBytes, 99029); assert.equal(manifest.allRoundtripsVerified, true);
  assert.equal(sha(await read(base + ".json")), manifest.reports[0].compactSha256);
});
