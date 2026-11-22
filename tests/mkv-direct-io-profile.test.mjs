import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { buildMkvIoProfileModule, instrumentMkvIoFactory, readMkvIoProfile } from "../scripts/lib/mkv-direct-io-profile.mjs";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";

const fromRoot = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("I/O instrumentation times and forwards original calls, distinguishes nested file writes and close, then restores methods", async () => {
  let time = 0;
  const warnings = [], data = new Uint8Array([0, 1, 2, 3]), stream = {
    __proto__: null,
    marker: true,
    async write(value) { assert.equal(this, stream); assert.equal(value.data, data); time += 9; },
    async close() { assert.equal(this, stream); time += 7; return 12; },
  };
  const realWrite = stream.write, realClose = stream.close;
  const bridge = {
    async read(offset, dest) { assert.equal(this, bridge); assert.equal(offset, 8); dest[0] = 23; time += 3; return dest.length; },
    async write(offset, value) {
      assert.equal(this, bridge); assert.equal(value, data); time++;
      await stream.write({ type: "write", position: offset, data: value });
      time++;
      return value.length;
    },
    async truncate() { time++; },
    async flush() { time += 2; },
    message(type, text) { assert.equal(type, 1); warnings.push(text); },
  };
  const job = await instrumentMkvIoFactory(async ({ withinBridge: b }) => {
    time += 5;
    return { async ccall(name, number) {
      assert.equal(name, "within_remux"); assert.equal(number, 7);
      time += 6;
      const dest = new Uint8Array(4);
      assert.equal(await b.read(8, dest), 4); assert.equal(dest[0], 23);
      assert.equal(await b.write(16, data), 4); await b.truncate(20); await b.flush();
      return 0;
    } };
  }, { withinBridge: bridge }, () => time, stream);
  assert.equal(await job.ccall("within_remux", 7), 0);
  assert.equal(warnings.length, 0);
  assert.equal(await stream.close(), 12);
  assert.equal(stream.write, realWrite); assert.equal(stream.close, realClose);
  const result = readMkvIoProfile(warnings, { elapsedMs: time + 4, outputBytes: 4 }, 8);
  assert.equal(result.read.bytes, 4);
  assert.equal(result.sourceFileBytes, 8);
  assert.equal(result.initializeMs, 5); assert.equal(result.nativeMs, 23);
  assert.equal(result.read.ms, 3); assert.equal(result.fileWrite.ms, 9);
  assert.equal(result.bridgeWriteOutsideFileApiMs, 2); assert.equal(result.close.ms, 7);
  assert.equal(result.nativeOutsideTimedCallbacksMs, 6); assert.equal(result.otherJobMs, 4);
  assert.equal(result.positionalFileWrites, 1);
  assert.throws(() => readMkvIoProfile([...warnings, ...warnings], { elapsedMs: time, outputBytes: 4 }, 4));
  const overlap = warnings[0].replace('"peakPending":1', '"peakPending":2');
  assert.throws(() => readMkvIoProfile([overlap], { elapsedMs: time, outputBytes: 4 }, 4));
});

test("wrapper generation is pinned to the exact local loader and claims no Wasm, worker, or acceptance change", async () => {
  const cached = await readFile(new URL("../fixtures/qualification-tools/within-test-mkv-header-core.mjs", import.meta.url));
  const hash = createHash("sha256").update(cached).digest("hex"), built = buildMkvIoProfileModule(cached, hash);
  assert.equal(built.proof.originalModuleSha256, hash);
  assert.notEqual(built.proof.instrumentedModuleSha256, hash);
  for (const key of ["workerReplaced", "wasmBytesChanged", "productionAcceptance"]) assert.equal(built.proof[key], false);
  assert.match(built.body.toString(), /export default options =>/);
  assert.throws(() => buildMkvIoProfileModule(cached, "0".repeat(64)));
  const bad = Buffer.concat([cached, Buffer.from("export default createWithinRemuxCore;")]);
  assert.throws(() => buildMkvIoProfileModule(bad, createHash("sha256").update(bad).digest("hex")));
});

test("near-10 GB diagnostic's numeric record and full-Chrome memory are replayable without claiming release or a speedup", async () => {
  const prefix = "evidence/2026-11-21T18-50-22-864Z-mkv-hevc-header-core-production-direct-scale-near10gb-io-profile";
  const bytes = await fromRoot(prefix + ".json"), r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases;
  assert.equal(sha(bytes), "384216adc928c232502f723e8c0f168512a0d1644d17cc59b6ddb70b8ec058fa");
  assert.equal(r.status, "completed-production-direct-near10gb-io-attribution-not-acceptance");
  assert.equal(r.speedGainProven, false);
  assert.equal(r.publicAcceptance, false);
  assert.equal(a.releaseWorker.overrides, false);
  assert.equal(r.ioProfileModule.wasmBytesChanged, false);
  assert.equal(r.ioProfileModule.unchangedWasmSha256, r.candidateBuild.build.artifacts["within-direct.wasm"].sha256);
  assert.equal(c.validation.outputSha256, r.productionDirectScaleContentReference.outputSha256);
  assert.equal(c.metrics.outputBytes, 9512261399);
  const profile = readMkvIoProfile(["MKV_IO_PROFILE_V1 " + c.ioProfileRaw], c.metrics, r.fixture.bytes);
  assert.deepEqual(profile, c.ioProfile);
  assert.equal(r.fixture.bytes - profile.read.bytes, 202435);
  assert.equal(profile.read.calls, 73443); assert.equal(profile.fileWrite.calls, 9602);
  assert.equal(profile.positionalFileWrites, 0);
  assert.equal(profile.write.bytes, profile.outputFileBytes);
  assert.ok(profile.fileWrite.ms > profile.elapsedMs / 2 && profile.bridgeWriteOutsideFileApiMs < profile.elapsedMs * 0.02);
  assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.ok(c.outputRemoved && a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved && a.serverCleanup.ownedRootAbsent);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent");
  assert.deepEqual(a.forbiddenRequests, []);
  const packed = await fromRoot(prefix + "-production-direct-native.json.gz");
  assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 32 * 1048576 });
  assert.equal(sha(raw), a.archive.decodedSha256);
  const samples = JSON.parse(raw), memory = summarizeProtectedWindow(samples, c.conversionWindow, a.blank.privateBytes);
  assert.equal(samples.length, 1300); assert.equal(memory.validSamples, 766); assert.equal(memory.unavailableSamples, 0);
  assert.equal(memory.incrementalPrivateMiB, 249.73828125);
  assert.equal(memory.incrementalPrivateMiB, a.memory.incrementalPrivateMiB);
  assert.deepEqual(memory.peak, a.memory.peak);
  assert.equal(a.memory.cleanupAboveIdleMiB, (a.cleanupStable.privateBytes - a.loaded.privateBytes) / 1048576);
  assert.equal(a.memory.cleanupAboveIdleMiB, 8.38671875);
});

test("earlier terminal browser result is not mislabeled as a completed diagnostic", async () => {
  const file = "evidence/2026-11-21T18-44-29-802Z-mkv-hevc-header-core-production-direct-scale-near10gb-io-profile.json";
  const bytes = await fromRoot(file), r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases;
  assert.equal(sha(bytes), "5e874cfe3c24fe80ab965fcd3c4163aced815f402cd9a8939e7fe1688c6bdca3");
  assert.equal(r.status, "failed-not-acceptance");
  assert.equal(c.state, "complete");
  assert.equal(c.validation, undefined);
  assert.equal(c.ioProfile, undefined);
  assert.equal(a.memory.cleanupAboveIdleMiB, null);
  assert.ok(a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved);
  assert.deepEqual(r.originalAfter, r.originalBefore);
  assert.equal(sha(await fromRoot(a.archive.file)), a.archive.sha256);
});
