// CDP/session doubles only, no real native profile or browser acceptance.
import assert from "node:assert/strict";
import { lstat, readFile, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { NATIVE_PROFILE_LIMITS, startNativeAllocationProfile, validateNativeAllocationProfile, captureBrowserNativeAllocationProfile } from "../scripts/lib/native-allocation-profile.mjs";
const profile = () => ({ samples: [{ size: 1024, total: 262144, stack: ["0x123", "allocator-function"] }],
  modules: [{ name: "owned-browser-module", uuid: "pinned", baseAddress: "0x100", size: 4096 }] });
const target = () => fileURLToPath(new URL(`../output/playwright/2026-10-24T00-00-${randomUUID().replaceAll(/[a-f]/g, "0")}-original-native-profile.json.gz`, import.meta.url));
function session(overrides = {}) {
  const calls = []; let detached = false;
  return { calls, get detached() { return detached; }, async send(method, params) {
    calls.push({ method, params }); if (overrides[method]) return overrides[method]();
    return method === "Memory.getSamplingProfile" ? { profile: profile() } : {};
  }, async detach() { detached = true; } };
}
test("native profile keeps bounded actual sample fields, never fabricates private totals or symbolization", () => {
  assert.equal(validateNativeAllocationProfile(profile()).samples.length, 1);
  for (const change of [p => p.samples.push(...Array(4096).fill(p.samples[0])), p => p.samples[0].stack.push("x".repeat(1025)),
    p => p.samples[0].stack = Array(129).fill("x"), p => p.samples[0].total = NaN, p => p.modules[0].baseAddress = "bad",
    p => p.modules[0].name = "x".repeat(2049), p => p.hidden = "not protocol", p => p.samples[0].hidden = "not protocol"]) {
    const p = profile(); change(p); assert.throws(() => validateNativeAllocationProfile(p));
  }
});
test("native sampler archives exact protocol data and stops/detaches once without GC, pressure or global tracing", async () => {
  const s = session(), file = target();
  let owned = null;
  try {
    const sampler = await startNativeAllocationProfile(s, file), result = await sampler.capture(); await sampler.close();
    owned = await lstat(file, { bigint: true });
    assert.deepEqual(s.calls.map(c => c.method), ["Memory.startSampling", "Memory.getSamplingProfile", "Memory.stopSampling"]);
    assert.deepEqual(s.calls[0].params, { samplingInterval: 262144, suppressRandomness: true }); assert.equal(s.detached, true);
    const packed = await readFile(file), raw = gunzipSync(packed);
    assert.equal(createHash("sha256").update(raw).digest("hex"), result.archive.restoredSha256);
    assert.deepEqual(JSON.parse(raw).profile, profile()); assert.equal(result.symbolizedStacksVerified, false);
    assert.equal(result.acceptanceMetric, false); assert.equal(result.processTreeCoverage, false); assert.equal(result.sampledTotalsAreNotPrivateBytes, true);
  } finally { if (owned) { const current = await lstat(file, { bigint: true }); assert.equal(current.dev, owned.dev); assert.equal(current.ino, owned.ino); await unlink(file); } }
});
test("unsupported/deadline/profile-shape failures always stop and detach; arbitrary output paths are rejected", async () => {
  for (const method of ["Memory.startSampling", "Memory.getSamplingProfile"]) {
    const s = session({ [method]: () => new Promise(() => {}) });
    await assert.rejects(async () => { const sampler = await startNativeAllocationProfile(s, target(), { deadlineMs: 5 }); await sampler.capture(); }, /deadline/);
    assert.equal(s.detached, true); assert.ok(s.calls.some(c => c.method === "Memory.stopSampling"));
  }
  const s = session({ "Memory.getSamplingProfile": () => ({ profile: { samples: [], modules: [], extra: true } }) });
  const sampler = await startNativeAllocationProfile(s, target()); await assert.rejects(sampler.capture()); assert.equal(s.detached, true);
  await assert.rejects(startNativeAllocationProfile(session(), fileURLToPath(new URL("../test.mkv", import.meta.url))));
  assert.equal(NATIVE_PROFILE_LIMITS.rawBytes, 2097152);
});
test("actual native samples preserve unresolved stacks and exact codec-size matches without claiming memory acceptance", async () => {
  const root = new URL("../", import.meta.url), hash = b => createHash("sha256").update(b).digest("hex");
  const analysis = JSON.parse(await readFile(new URL("evidence/2026-10-24-native-allocation-profile-analysis.json", root)));
  const receipt = JSON.parse(await readFile(new URL(analysis.receipt, root))), archive = receipt.nativeAllocationArchive;
  const packed = await readFile(new URL(archive.path, root)); assert.equal(hash(packed), archive.sha256);
  const bytes = gunzipSync(packed); assert.equal(hash(bytes), archive.restoredSha256);
  const p = validateNativeAllocationProfile(JSON.parse(bytes).profile);
  assert.equal(p.samples.length, 15); assert.equal(p.modules.length, 4);
  for (const row of analysis.sampleSizeMatches) {
    assert.ok(p.samples.some(s => s.size === row.codecBytes));
    assert.equal(Math.ceil(row.codecBytes / 3) * 4, row.base64Characters);
    assert.equal(row.base64Characters + 12, row.sampleBytesMatchingBase64Plus12);
    assert.ok(p.samples.some(s => s.size === row.sampleBytesMatchingBase64Plus12));
  }
  assert.equal(receipt.nativeProfileDiagnosticOnly, true); assert.equal(receipt.overallGatePassed, false);
  assert.equal(receipt.nativeProfileFiniteStop.cancellation.requested, true); assert.equal(receipt.completedCases.length, 0);
  assert.equal(receipt.nativeAllocationProfile.symbolizedStacksVerified, false);
  assert.equal(analysis.causalSavingsVerified, false); assert.equal(analysis.publicAcceptance, false);
  assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
});
test("late diagnostic covers the known56s failure but is bounded at120s, remains diagnostic, and archives browser samples separately", async () => {
  assert.equal(NATIVE_PROFILE_LIMITS.shortWindowMs, 15000); assert.equal(NATIVE_PROFILE_LIMITS.lateWindowMs, 120000);
  const harness = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(harness, /!lateNativeProfile \|\| \(nativeProfile && flags.has\("--bounded-network-observer"\)\)/);
  assert.match(harness, /Date\.now\(\) - Date\.parse\(rendererNativeProfile.startedAt\) >= nativeProfileWindowMs/);
  assert.match(harness, /report.nativeProfileDiagnosticOnly = true/);
  assert.match(harness, /budgetExceeded \|\| nativeProfileDue/);
  assert.match(harness, /Promise.allSettled\(\[rendererNativeProfile.capture\(\), browserNativeSession/);
  const file = target().replace("-original-native-profile", "-original-browser-native-profile");
  const calls = []; let detached = false, owned = null;
  try {
    const result = await captureBrowserNativeAllocationProfile({ async send(method) { calls.push(method); return { profile: { samples: [], modules: [] } }; },
      async detach() { detached = true; } }, file);
    owned = await lstat(file, { bigint: true });
    assert.deepEqual(calls, ["Memory.getBrowserSamplingProfile"]); assert.equal(detached, true);
    assert.equal(result.samplingStartedByThisObserver, false); assert.equal(result.emptyProfileDoesNotProveNoAllocations, true);
    assert.equal(result.status, "empty-native-allocation-samples"); assert.equal(result.acceptanceMetric, false);
    assert.deepEqual(JSON.parse(gunzipSync(await readFile(file))).profile, { samples: [], modules: [] });
  } finally { if (owned) { const current = await lstat(file, { bigint: true }); assert.equal(current.dev, owned.dev); assert.equal(current.ino, owned.ino); await unlink(file); } }
});
test("browser profile timeout or invalid shape detaches without starting sampling, GC or memory pressure", async () => {
  for (const reply of [() => new Promise(() => {}), () => ({ profile: { samples: [], modules: [], unbounded: true } })]) {
    let detached = false;
    await assert.rejects(captureBrowserNativeAllocationProfile({ send: reply, async detach() { detached = true; } },
      target().replace("-original-native-profile", "-original-browser-native-profile"), { deadlineMs: 5 }));
    assert.equal(detached, true);
  }
});
test("actual late failure retains16 renderer samples and explicitly empty browser samples, never a solved-allocation claim", async () => {
  const root = new URL("../", import.meta.url), receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T12-57-51.161Z-mpeg2-original-result.json", root)));
  assert.equal(receipt.nativeProfileWindowMs, 120000); assert.equal(receipt.nativeProfileDiagnosticOnly, true);
  assert.equal(receipt.nativeAllocationProfile.samples, 16); assert.equal(receipt.browserNativeAllocationProfile.samples, 0);
  assert.equal(receipt.browserNativeAllocationProfile.emptyProfileDoesNotProveNoAllocations, true);
  for (const key of ["nativeAllocationArchive", "browserNativeAllocationArchive"]) {
    const archive = receipt[key], packed = await readFile(new URL(archive.path, root));
    assert.equal(createHash("sha256").update(packed).digest("hex"), archive.sha256);
    const bytes = gunzipSync(packed); assert.equal(createHash("sha256").update(bytes).digest("hex"), archive.restoredSha256);
    validateNativeAllocationProfile(JSON.parse(bytes).profile);
  }
  assert.equal(receipt.memory.incrementalPrivateMiB, 300.0703125); assert.equal(receipt.memory.validSamples, 934);
  assert.equal(receipt.memory.unavailableSampleCount, 0); assert.equal(receipt.overallGatePassed, false);
  assert.equal(receipt.completedCases.length, 0); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
});
