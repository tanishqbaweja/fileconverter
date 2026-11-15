import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { headerCoreH264References, readHeaderCoreH264Regressions } from "../scripts/lib/mkv-header-protected-reference.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("three genuine header-core H264 regressions retain exact old output bytes and complete recovery, metadata and decoded-content proof", async () => {
  const buffers = await Promise.all(headerCoreH264References.map(r => readFile(r.file)));
  const tools = JSON.parse(buffers[0]).candidateBuild; readHeaderCoreH264Regressions(buffers, tools);
  for (const [index, bytes] of buffers.entries()) {
    const r = JSON.parse(bytes), [a] = r.arms;
    assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "error", "complete"]);
    assert.deepEqual(a.failures, []); assert.deepEqual(a.forbiddenRequests, []); assert.deepEqual(r.failures, []);
    for (const c of [a.cases[0], a.cases[3]]) {
      const v = c.validation;
      assert.equal(v.outputSha256, headerCoreH264References[index].outputSha256);
      assert.equal(v.sourceDecodedHashes, v.outputDecodedHashes); assert.ok(v.fullDecode && v.candidateGate.passed);
      assert.ok(v.packets.clocks.every(t => t.maximumPtsErrorUs <= 1000 && t.maximumComparableDtsErrorUs <= 1000));
      assert.ok(v.packets.aac.every(t => t.initialSkipSamples === 1024));
      assert.equal(v.structure.rotationDegrees, 90); assert.deepEqual(v.structure.audioLanguages, ["eng", "spa"]);
      assert.ok(v.structure.subtitleDisclosed && v.structure.attachmentDisclosed && v.structure.chapterDisclosed);
      if (index) {
        assert.equal(v.startupDts.disclosure.exactMessageChecked, true); assert.equal(v.startupDts.disclosure.codecLabel, "H.264/HEVC");
        assert.deepEqual(v.startupDts.expectedInitialDtsUs, index === 2 ? [4833000, 4916000] : [-167000, -84000]);
      }
      assert.ok(c.metrics.maxReadChunkBytes <= 262144 && c.metrics.maxWriteChunkBytes <= 1048576 && c.metrics.peakQueuedBytes <= 1048576);
      assert.equal(c.metrics.peakPendingOperations, 1); assert.ok(c.metrics.peakWasmMemoryBytes <= 64 * 1048576);
      assert.equal(c.outputRemoved, true); assert.equal(c.binding.convertedCopyCreated, false);
    }
    assert.ok(a.cases.every(c => c.outputRemoved)); assert.deepEqual(r.originalBefore, r.originalAfter);
    assert.equal(r.headed, false); assert.equal(r.browserServicesDisabled, false); assert.equal(r.publicAcceptance, false);
    assert.equal(r.currentCoreLoopReference.noConversionReplay, true);
  }
});

test("all three native journals independently reproduce same-blank/full-tree peaks and original-idle cleanup, with missing samples never zero", async () => {
  const peaks = [211.1796875, 180.53125, 226.4375], cleanups = [55.4375, 67.46875, 49.60546875], counts = [133, 143, 143];
  for (const [index, ref] of headerCoreH264References.entries()) {
    const r = JSON.parse(await readFile(ref.file)), [a] = r.arms, packed = await readFile(a.archive.file);
    assert.equal(sha(packed), a.archive.sha256); const raw = gunzipSync(packed, { maxOutputLength: 8 * 1048576 });
    assert.equal(sha(raw), a.archive.decodedSha256);
    const all = JSON.parse(raw), active = all.filter(s => Date.parse(s.timestamp) >= a.memory.start && Date.parse(s.timestamp) <= a.memory.end);
    const valid = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
    assert.equal(valid.length, counts[index]); assert.equal(active.length - valid.length, 0);
    for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
    assert.equal((Math.max(...valid.map(s => s.privateBytes)) - a.blank.privateBytes) / 1048576, peaks[index]);
    assert.equal(a.memory.incrementalPrivateMiB, peaks[index]); assert.equal(a.memory.unavailableSamples, 0);
    assert.equal((a.cleanupStable.privateBytes - a.loaded.privateBytes) / 1048576, cleanups[index]);
    assert.equal(a.memory.cleanupAboveIdleMiB, cleanups[index]);
    assert.equal(a.browserCleanup.status, "owned-observed-pids-absent");
    assert.ok(a.serverCleanup.ownedRootAbsent && a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
  }
});

test("initial B-frame disclosure matcher failure stays immutable and incomplete, even though its produced bytes match the eventual accepted output", async () => {
  const bytes = await readFile("evidence/2026-11-15T08-15-19-262Z-mkv-hevc-header-core-h264-bframes.json");
  assert.equal(sha(bytes), "a682ee12885795d3c7987b26c61d9fe72c6e9c6a2638121322b71dd8188f8ce7");
  const r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases;
  assert.equal(r.status, "failed-not-acceptance"); assert.equal(a.cases.length, 1); assert.equal(c.state, "complete");
  assert.equal(c.validation.outputSha256, headerCoreH264References[1].outputSha256);
  assert.match(a.failures.join("\n"), /Startup scheduling must be disclosed/);
  assert.ok(c.validation.warnings.some(w => w.startsWith("Missing initial H.264/HEVC decode timestamps reconstructed")));
  assert.notEqual(c.validation.fullDecode, true); assert.equal(a.memory.cleanupAboveIdleMiB, null);
  assert.ok(a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
});
