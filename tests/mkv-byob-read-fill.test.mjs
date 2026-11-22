import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { mkvReadAbOrder, summarizeMkvReadAb, withMkvReadFill } from "../scripts/lib/mkv-byob-read-fill.mjs";
import { buildMkvIoProfileModule, readMkvIoProfile } from "../scripts/lib/mkv-direct-io-profile.mjs";
import { assertInstalledChromePinsEqual } from "../scripts/lib/installed-chrome-pin.mjs";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";

test("read fill uses the native target in place and preserves exact offsets, EOF, and cancellation", async () => {
  const target = new Uint8Array(8), offsets = [], abort = new DOMException("Cancelled", "AbortError");
  const largeOffset = 2 ** 32 + 123;
  let busy = false, fail = false;
  const bridge = { async read(offset, chunk) {
    assert.equal(busy, false);
    assert.equal(chunk.buffer, target.buffer);
    assert.equal(chunk.byteOffset, offset - largeOffset);
    offsets.push(offset);
    busy = true;
    try {
      await Promise.resolve();
      const n = Math.min(chunk.length, Math.max(0, largeOffset + 7 - offset), 3);
      if (fail && offset > largeOffset) throw abort;
      for (let i = 0; i < n; i++) chunk[i] = offset + i - largeOffset;
      return n;
    } finally { busy = false; }
  } };
  const candidate = withMkvReadFill({ withinBridge: bridge }).withinBridge;
  assert.equal(await candidate.read(largeOffset, target), 7);
  assert.deepEqual(offsets, [0, 3, 6, 7].map(n => largeOffset + n));
  assert.deepEqual([...target.slice(0, 7)], [0, 1, 2, 3, 4, 5, 6]);
  fail = true;
  await assert.rejects(candidate.read(largeOffset, target), err => err === abort);
  await assert.rejects(candidate.read(0, new Uint8Array(262145)), /bounds/);
  await assert.rejects(candidate.read(Number.MAX_SAFE_INTEGER, target), /bounds/);
});

test("tiny fragments and invalid pull extents cannot cause unbounded loops", async () => {
  let pulls = 0;
  const candidate = withMkvReadFill({ withinBridge: { read: async () => { pulls++; return 1; } } }).withinBridge;
  assert.equal(await candidate.read(0, new Uint8Array(256)), 4);
  assert.equal(pulls, 4);
  const bad = withMkvReadFill({ withinBridge: { read: async () => NaN } }).withinBridge;
  await assert.rejects(bad.read(0, new Uint8Array(256)), /short-read extent/);
});

test("comparison requires the same exact qualified loader and only the candidate adds input fill", async () => {
  const b = await readFile(new URL("../fixtures/qualification-tools/within-test-mkv-header-core.mjs", import.meta.url));
  const hash = createHash("sha256").update(b).digest("hex"), normal = buildMkvIoProfileModule(b, hash);
  const a = buildMkvIoProfileModule(b, hash, "control"), c = buildMkvIoProfileModule(b, hash, "fill");
  assert.deepEqual(a.body, normal.body);
  assert.notDeepEqual(a.body, c.body);
  assert.match(c.body.toString(), /for \(let pulls = 0; filled < target.byteLength && pulls < 4; pulls\+\+\)/);
  assert.doesNotMatch(a.body.toString(), /withMkvReadFill/);
});

test("a slow order, worse memory, or failed gate cannot qualify a read optimization", () => {
  const arm = (byobMode, elapsedMs, memory = 200, status = "passed-loop-source-fidelity-control") => ({
    byobMode, status, ownedRuntimeRemoved: true, memory: { incrementalPrivateMiB: memory, cleanupAboveIdleMiB: 12 },
    cases: [{ outputRemoved: true, validation: { candidateGate: { passed: true }, outputSha256: "same" },
      ioProfile: { elapsedMs, read: { ms: byobMode === "fill" ? 9 : 10, calls: byobMode === "fill" ? 50 : 100 }, fileWrite: { ms: 10 } } }],
  });
  const baseline = mkvReadAbOrder.map(m => arm(m, m === "fill" ? 90 : 100));
  assert.equal(summarizeMkvReadAb(baseline).decision, "promising-private-needs-production-integration");
  assert.equal(summarizeMkvReadAb(baseline.with(1, arm("fill", 105))).decision, "do-not-adopt-no-consistent-safe-win");
  assert.equal(summarizeMkvReadAb(baseline.with(1, arm("fill", 90, 220))).decision, "do-not-adopt-no-consistent-safe-win");
  assert.equal(summarizeMkvReadAb(baseline.with(1, arm("fill", 90, 220, "failed-not-acceptance"))).comparable, false);
});

test("matched real 5.35 GB A/B reproduces all four timings, exact outputs, memory and the decision not to adopt", async () => {
  const read = f => readFile(new URL(`../${f}`, import.meta.url));
  const sha = b => createHash("sha256").update(b).digest("hex");
  const prefix = "evidence/2026-11-22T07-21-26-089Z-mkv-hevc-header-core-production-direct-scale-5gb-read-ab";
  const bytes = await read(prefix + ".json");
  assert.equal(sha(bytes), "36062e0adbf797b4e7de6948eba6337d1012809a7ef20074d2cba466e3218251");
  const r = JSON.parse(bytes);
  assert.equal(r.status, "completed-production-direct-5gb-read-ab-not-acceptance");
  assert.equal(r.publicAcceptance, false); assert.equal(r.speedGainProven, false);
  assert.equal(r.fixture.bytes, 5347972392); assert.equal(r.fixtureRuntimeRemoved, true);
  assert.deepEqual(r.originalAfter, r.originalBefore);
  assert.equal(r.readAb.unchangedWasmSha256, r.candidateBuild.build.artifacts["within-direct.wasm"].sha256);
  assert.equal(r.readAb.freshBrowserPerArm, true); assert.equal(r.readAb.cacheFlushed, false);
  assert.equal(new Set(r.arms.map(a => JSON.stringify(a.identity))).size, 4);
  const decisions = summarizeMkvReadAb(r.arms);
  assert.deepEqual(decisions, r.readAb.result);
  assert.equal(decisions.decision, "do-not-adopt-no-consistent-safe-win");
  assert.deepEqual(decisions.comparables.map(c => Math.round(c.elapsedMs)), [84157, 51362, 86507, 52289]);
  assert.deepEqual(decisions.comparables.map(c => c.nativeReadCalls), [37724, 20401, 20401, 39756]);
  assert.ok(decisions.pairs[0].elapsedRatio < 1 && decisions.pairs[1].elapsedRatio > 1);
  const loader = await read("fixtures/qualification-tools/within-test-mkv-header-core.mjs");
  for (const [i, a] of r.arms.entries()) {
    const [c] = a.cases;
    assertInstalledChromePinsEqual(a.browser, r.arms[0].browser);
    assert.equal(a.releaseWorker.sha256, r.productionDirectRecoveryReference.workerSha256);
    assert.deepEqual(a.ioProfileModule, buildMkvIoProfileModule(loader, r.candidateBuild.build.artifacts["within-direct.mjs"].sha256, a.byobMode).proof);
    assert.deepEqual(a.forbiddenRequests, []);
    assert.equal(a.releaseWorker.overrides, false); assert.equal(a.workerResponses, 0);
    assert.equal(a.serverCleanup.ownedRootAbsent, true); assert.ok(a.browserCleanup.status === "owned-observed-pids-absent" || a.birthCleanup?.allObservedBirthsAbsent);
    assert.equal(c.metrics.outputBytes, 5350648699); assert.equal(c.validation.outputSha256, r.productionDirectScaleContentReference.outputSha256);
    assert.deepEqual(readMkvIoProfile(["MKV_IO_PROFILE_V1 " + c.ioProfileRaw], c.metrics, r.fixture.bytes), c.ioProfile);
    assert.equal(a.archive.file, `${prefix}-production-direct-${i + 1}-${a.byobMode}-native.json.gz`);
    const archived = await read(a.archive.file); assert.equal(sha(archived), a.archive.sha256);
    const raw = gunzipSync(archived, { maxOutputLength: 32 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
    const samples = JSON.parse(raw), memory = summarizeProtectedWindow(samples, c.conversionWindow, a.blank.privateBytes);
    assert.equal(samples.length, [1158, 840, 1147, 870][i]);
    for (const key of ["incrementalPrivateMiB", "peak", "validSamples", "unavailableSamples"]) assert.deepEqual(memory[key], a.memory[key]);
    assert.equal(a.memory.unavailableSamples, i === 0 ? 1 : 0);
    assert.equal(a.memory.cleanupAboveIdleMiB, (a.cleanupStable.privateBytes - a.loaded.privateBytes) / 1048576);
  }
});
