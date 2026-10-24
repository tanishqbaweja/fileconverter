// Experimental CDP native allocation samples, not JS heap, private-byte
// acceptance or proof that sampled totals equal resident/private memory.
// Protocol: https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Memory.pdl
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
export const NATIVE_PROFILE_LIMITS = Object.freeze({ intervalBytes: 262144, deadlineMs: 3000, rawBytes: 2 * 1048576,
  samples: 4096, modules: 256, stackFrames: 128, frameChars: 1024, largestSamples: 16,
  shortWindowMs: 15000, lateWindowMs: 120000 });
const approved = path.resolve(import.meta.dirname, "../../output/playwright"), sha = b => createHash("sha256").update(b).digest("hex");
async function deadline(operation, ms, stage) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Native profile deadline: " + stage)), ms); })]); }
  finally { clearTimeout(timer); }
}
export function validateNativeAllocationProfile(profile) {
  assert.ok(profile && Reflect.ownKeys(profile).map(String).sort().join(",") === "modules,samples");
  assert.ok(profile && Array.isArray(profile.samples) && profile.samples.length <= NATIVE_PROFILE_LIMITS.samples);
  assert.ok(Array.isArray(profile.modules) && profile.modules.length <= NATIVE_PROFILE_LIMITS.modules);
  for (const sample of profile.samples) {
    assert.equal(Reflect.ownKeys(sample).map(String).sort().join(","), "size,stack,total");
    for (const n of [sample.size, sample.total]) assert.ok(Number.isSafeInteger(n) && n >= 0);
    assert.ok(Array.isArray(sample.stack) && sample.stack.length <= NATIVE_PROFILE_LIMITS.stackFrames);
    assert.ok(sample.stack.every(s => typeof s === "string" && s.length <= NATIVE_PROFILE_LIMITS.frameChars));
  }
  for (const loadedModule of profile.modules) {
    assert.equal(Reflect.ownKeys(loadedModule).map(String).sort().join(","), "baseAddress,name,size,uuid");
    assert.ok(typeof loadedModule.name === "string" && loadedModule.name.length <= 2048 && typeof loadedModule.uuid === "string" && loadedModule.uuid.length <= 128);
    assert.ok(typeof loadedModule.baseAddress === "string" && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(loadedModule.baseAddress));
    assert.ok(Number.isSafeInteger(loadedModule.size) && loadedModule.size >= 0);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(profile)) <= NATIVE_PROFILE_LIMITS.rawBytes);
  return profile;
}
async function checkedArchivePath(archivePath, browser = false) {
  archivePath = path.resolve(archivePath); assert.equal(path.dirname(archivePath), approved);
  assert.equal(await realpath(approved), approved); assert.equal((await lstat(approved)).isSymbolicLink(), false);
  assert.match(path.basename(archivePath), browser ? /^[0-9TZ.-]+-original-browser-native-profile\.json\.gz$/ : /^[0-9TZ.-]+-original-native-profile\.json\.gz$/);
  return archivePath;
}
async function archiveProfile(profile, archivePath, startedAt) {
  validateNativeAllocationProfile(profile);
  const raw = Buffer.from(JSON.stringify({ schemaVersion: 1, startedAt, capturedAt: new Date().toISOString(), profile }));
  assert.ok(raw.length <= NATIVE_PROFILE_LIMITS.rawBytes);
  const packed = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(packed), raw);
  await writeFile(archivePath, packed, { flag: "wx" }); assert.equal(sha(await readFile(archivePath)), sha(packed));
  return { status: profile.samples.length ? "captured-native-allocation-samples" : "empty-native-allocation-samples",
    samples: profile.samples.length, modules: profile.modules.length,
    largestSamples: [...profile.samples].sort((a, b) => b.total - a.total).slice(0, NATIVE_PROFILE_LIMITS.largestSamples),
    stackStringsCaptured: profile.samples.some(s => s.stack.length > 0), symbolizedStacksVerified: false,
    acceptanceMetric: false, perturbsMemory: true, processTreeCoverage: false, sampledTotalsAreNotPrivateBytes: true,
    archive: { path: archivePath, bytes: packed.length, sha256: sha(packed), restoredBytes: raw.length, restoredSha256: sha(raw) } };
}
export async function captureBrowserNativeAllocationProfile(session, archivePath, { deadlineMs = NATIVE_PROFILE_LIMITS.deadlineMs } = {}) {
  assert.ok(Number.isInteger(deadlineMs) && deadlineMs > 0 && deadlineMs <= NATIVE_PROFILE_LIMITS.deadlineMs);
  try {
    archivePath = await checkedArchivePath(archivePath, true);
    const startedAt = new Date().toISOString();
    const { profile } = await deadline(session.send("Memory.getBrowserSamplingProfile"), deadlineMs, "getBrowserSamplingProfile");
    return { ...await archiveProfile(profile, archivePath, startedAt), scope: "already-collected browser process native samples, not renderer or full tree",
      samplingStartedByThisObserver: false, emptyProfileDoesNotProveNoAllocations: true };
  } finally { await deadline(session.detach(), deadlineMs, "browser-detach"); }
}
export async function startNativeAllocationProfile(session, archivePath, { deadlineMs = NATIVE_PROFILE_LIMITS.deadlineMs } = {}) {
  assert.ok(Number.isInteger(deadlineMs) && deadlineMs > 0 && deadlineMs <= NATIVE_PROFILE_LIMITS.deadlineMs);
  archivePath = await checkedArchivePath(archivePath);
  let attempted = false, closed = false;
  const startedAt = new Date().toISOString();
  const close = async () => {
    if (closed) return; closed = true;
    try { if (attempted) await deadline(session.send("Memory.stopSampling"), deadlineMs, "stopSampling"); }
    finally { await deadline(session.detach(), deadlineMs, "detach"); }
  };
  try {
    attempted = true;
    await deadline(session.send("Memory.startSampling", { samplingInterval: NATIVE_PROFILE_LIMITS.intervalBytes, suppressRandomness: true }), deadlineMs, "startSampling");
  } catch (error) { try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Native sampling setup and cleanup failed"); } throw error; }
  return {
    startedAt, limits: NATIVE_PROFILE_LIMITS, scope: "page renderer process native allocations; not GPU/browser/process-tree memory", close,
    async capture() {
      assert.equal(closed, false);
      try {
        const { profile } = await deadline(session.send("Memory.getSamplingProfile"), deadlineMs, "getSamplingProfile");
        return await archiveProfile(profile, archivePath, startedAt);
      } finally { await close(); }
    },
  };
}
