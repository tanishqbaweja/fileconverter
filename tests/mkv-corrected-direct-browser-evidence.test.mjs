import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { hevcHeaderLoopReference } from "../scripts/lib/mkv-hevc-header-core-reference.mjs";

const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const mib = 1048576;
const receipt = name => `evidence/2026-11-21T${name}-mkv-hevc-header-core-production-direct-small.json`;
const outputSha256 = "19adadcc74ba2a2acde01de262303ba2dcc43035de371999160c115eb7d750e9";
const original = { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" };

test("small production direct browser receipt proves exact genuine MP4, payload cancel, bounded write failure and exact recoveries", async () => {
  const bytes = await read(receipt("18-11-17-379Z"));
  assert.equal(sha(bytes), "e60193130080011dd1b91c5fa5d3f11a79f3d55d5640c0a3c7c33365eccc2d22");
  const r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(r.status, "passed-unmodified-production-direct-small-not-public-or-scale-acceptance");
  for (const flag of ["headed", "originalMediaSelected", "browserServicesDisabled", "publicAcceptance", "speedGainProven", "nativeConversionUsed"]) assert.equal(r[flag], false);
  assert.deepEqual(r.originalBefore, original);
  assert.deepEqual(r.originalAfter, original);
  assert.equal(r.fixtureRuntimeRemoved, true);
  assert.equal(a.ownedRuntimeRemoved, true);
  assert.equal(a.serverCleanup.ownedRootAbsent, true);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent");
  const expected = await read(hevcHeaderLoopReference.file);
  assert.equal(sha(expected), hevcHeaderLoopReference.sha256);
  assert.equal(r.fixture.sha256, JSON.parse(expected).fixture.sha256);
  assert.equal(r.currentCoreLoopReference.outputSha256, outputSha256);
  assert.equal(a.mode, "production-direct");
  assert.equal(a.overlay, undefined);
  assert.equal(a.workerResponses, 0);
  assert.equal(a.productionWorkerBinding.browserWorkerResponseOverridden, false);
  assert.equal(a.releaseWorker.sha256, a.productionWorkerBinding.sha256);
  assert.ok(a.releaseWorker.requests > 0);
  assert.deepEqual(a.engineResponses, { module: 5, wasm: 5 });
  assert.deepEqual(a.directEngineRequests, a.engineResponses);
  assert.deepEqual(a.forbiddenRequests, []);
  assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "complete", "error", "complete"]);
  for (const c of a.cases) {
    assert.deepEqual(c.destination, { profileId: "mkv-to-mp4", corrected: true, mode: "handle", realFileHandle: true, hasStagingName: false, fault: c.fault ? "write" : null });
    assert.equal(c.outputRemoved, true);
    for (const key of ["scratchBytes", "peakScratchBytes", "maxScratchReadChunkBytes", "maxScratchWriteChunkBytes"]) assert.equal(c.metrics[key] ?? 0, 0);
    assert.ok(c.metrics.maxReadChunkBytes <= 262144);
    assert.ok(c.metrics.maxWriteChunkBytes > 0 && c.metrics.maxWriteChunkBytes <= mib);
    assert.ok(c.metrics.peakQueuedBytes > 0 && c.metrics.peakQueuedBytes <= mib);
    assert.equal(c.metrics.peakPendingOperations, 1);
    assert.equal(c.metrics.pendingOperations, 0);
    if (c.state !== "complete") { assert.equal(c.onlyEmptyPlaceholders, true); continue; }
    assert.equal(c.metrics.outputBytes, 11894121);
    assert.equal(c.validation.outputSha256, outputSha256);
    for (const flag of ["fullDecode", "completeEncodedStreamHashesEqual", "completeDecodedVideoAndPcmEqual"]) assert.equal(c.validation[flag], true);
    assert.equal(c.validation.candidateGate.passed, true);
  }
  assert.equal(a.cases[1].selection.selectedFileBytes, 142615516);
  assert.equal(a.cases[1].cancellationBefore.outputBytes, 14930949);
  assert.match(a.cases[3].error, /destination rejected a bounded write/);
  assert.deepEqual(a.failures, []);
  assert.deepEqual(r.failures, []);

  const packed = await read(a.archive.file);
  assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 16 * mib });
  assert.equal(sha(raw), a.archive.decodedSha256);
  const active = JSON.parse(raw).filter(s => Date.parse(s.timestamp) >= a.memory.start && Date.parse(s.timestamp) <= a.memory.end);
  const valid = active.filter(s => s.sampleError === null && Number.isFinite(s.privateBytes));
  assert.equal(valid.length, 245);
  assert.equal(active.length - valid.length, 0);
  for (const s of valid) assert.equal(s.processes.reduce((total, p) => total + p.privateBytes, 0), s.privateBytes);
  const peak = valid.reduce((high, current) => high.privateBytes >= current.privateBytes ? high : current);
  assert.deepEqual(peak, a.memory.peak);
  assert.equal(a.memory.incrementalPrivateMiB, (peak.privateBytes - a.blank.privateBytes) / mib);
  assert.equal(a.memory.incrementalPrivateMiB, 158.69921875);
  assert.equal(a.memory.cleanupAboveIdleMiB, (a.cleanupStable.privateBytes - a.loaded.privateBytes) / mib);
  assert.equal(a.memory.cleanupAboveIdleMiB, 42.7890625);
});

test("first small receipt preserves missed cancellation independently of the successful follow-up", async () => {
  const bytes = await read(receipt("18-08-48-264Z"));
  assert.equal(sha(bytes), "49f3aeface3dc08127943bea04a12eb249a73357aa684e4d89f5fd5e57478097");
  const r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(r.status, "failed-not-acceptance");
  assert.equal(a.cases[0].validation.outputSha256, outputSha256);
  assert.match(a.failures[0], /Timeout 20000ms exceeded/);
  assert.equal(a.cases[1].state, undefined);
  assert.equal(a.jobCleanup.terminalState, "complete");
  assert.equal(a.memory.cleanupAboveIdleMiB, null);
  assert.equal(sha(await read(a.archive.file)), a.archive.sha256);
  assert.equal(a.ownedRuntimeRemoved, true);
  assert.equal(r.fixtureRuntimeRemoved, true);
  assert.deepEqual(r.originalAfter, original);
});
