// CDP/session doubles only, no real native profile or browser acceptance.
import assert from "node:assert/strict";
import { lstat, readFile, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { NATIVE_PROFILE_LIMITS, startNativeAllocationProfile, validateNativeAllocationProfile } from "../scripts/lib/native-allocation-profile.mjs";
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
