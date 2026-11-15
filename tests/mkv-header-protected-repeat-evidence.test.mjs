import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readHeaderProtectedReference, headerProtectedReference } from "../scripts/lib/mkv-header-protected-reference.mjs";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
import { renderProtectedRepeatReport } from "../scripts/lib/mkv-protected-repeat-report.mjs";
import { mkvProtectedCopy } from "../scripts/lib/mkv-protected-copy-contract.mjs";

const file = "evidence/2026-11-15T09-13-19-493Z-mkv-hevc-header-core-protected-repeats.json";
const read = name => readFile(new URL(`../${name}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("corrected core completes real original 3+1 repeats; all bytes bind to fresh SAME-native video/codec/PCM proof, not another decode", async () => {
  const bytes = await read(file);
  assert.equal(sha(bytes), "d56b4c7cc38504aec24778d6f0e5776ca96dcf441010d56a690276b2617bedef");
  const r = JSON.parse(bytes);
  assert.equal(r.status, "passed-header-core-protected-repeats-not-public-acceptance");
  assert.ok(r.hevcHeaderProtectedCandidate && r.hevcHeaderProtectedRepeats && r.originalMediaSelected);
  assert.deepEqual(r.arms.map(a => a.cases.length), [3, 1]);
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 });
  assert.deepEqual(r.originalBefore, r.originalAfter);
  const ref = readHeaderProtectedReference(await read(headerProtectedReference.file), r.candidateBuild);
  assert.deepEqual(r.protectedReference, ref);
  assert.equal(r.candidateBuild.build.artifacts["within-direct.wasm"].sha256, "41c4a075de285d0d906b2711c5e5420a401235ab89e1f185abe5d48a830a3eba");
  const peaks = [], cleanups = [], times = [], counts = [], missing = [], pids = [], totals = [];
  for (const a of r.arms) {
    assert.equal(a.status, "passed-protected-repeat-session"); assert.ok(a.blank.stable && a.loaded.stable);
    const packed = await read(a.archive.file); assert.equal(sha(packed), a.archive.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: 16 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
    const samples = JSON.parse(raw); totals.push(samples.length);
    for (const s of samples) {
      if (s.privateBytes === null) continue;
      assert.ok(Array.isArray(s.processes));
      assert.equal(s.processes.reduce((sum, p) => sum + p.privateBytes, 0), s.privateBytes);
    }
    for (const c of a.cases) {
      assert.equal(c.state, "complete"); assert.equal(c.metrics.inputBytes, mkvProtectedCopy.bytes);
      assert.equal(c.metrics.outputBytes, ref.outputBytes); assert.equal(c.validation.outputSha256, ref.outputSha256);
      assert.equal(c.validation.independentValidation.exactCurrentNativeBuildVerified, true);
      assert.equal(c.validation.independentValidation.noValidationReplay, true);
      assert.equal(c.validation.independentValidation.fullDecodedVideoFrames, 296160);
      assert.equal(c.validation.fullVideoDecode, false);
      assert.equal(c.validation.fullVideoDecodeInheritedThroughWholeOutputIdentity, true);
      assert.equal(c.validation.completeVideo, undefined);
      assert.ok(c.validation.candidateGate.passed && c.outputRemoved);
      const v = c.validation.structure;
      assert.ok(v.streamPropertiesMatch && v.languagePreserved && v.subtitleDisclosed && v.artworkDisclosed);
      assert.ok(v.durationDeltaSeconds < 0.05);
      assert.equal(c.validation.serializedTimeline.tracks[1].edits[0].mediaTimeTicks, "5058");
      const memory = summarizeProtectedWindow(samples, c.conversionWindow, a.blank.privateBytes);
      assert.deepEqual(memory, c.memory);
      assert.equal(c.cleanupAboveIdleMiB, (c.cleanupStable.privateBytes - a.loaded.privateBytes) / 1048576);
      assert.ok(c.cleanupAboveIdleMiB <= 96);
      peaks.push(memory.incrementalPrivateMiB); cleanups.push(c.cleanupAboveIdleMiB);
      times.push(c.metrics.elapsedMs); counts.push(memory.validSamples); missing.push(memory.unavailableSamples);
      assert.equal(c.metrics.peakWasmMemoryBytes, 48562176);
      assert.ok(c.metrics.maxReadChunkBytes <= 262144 && c.metrics.maxWriteChunkBytes <= 1048576);
      assert.ok(c.metrics.peakQueuedBytes <= 1048576); assert.equal(c.metrics.peakPendingOperations, 1);
      assert.equal(c.metrics.pendingOperations, 0); assert.equal(c.metrics.queuedBytes, 0);
      assert.equal(c.selection.completeOriginalSelected, true);
      for (const field of ["remotePlaywrightUpload", "sourceCopyCreated", "alternateConversionPath"]) assert.equal(c.selection[field], false);
      assert.equal(c.binding.convertedCopyCreated, false); assert.equal(c.binding.allOutputBytesCompared, false);
    }
    assert.deepEqual(a.forbiddenRequests, []); assert.deepEqual(a.failures, []);
    assert.equal(a.observer.processNameOrSandboxExclusions, false);
    assert.equal(a.browserCleanup.status, "owned-observed-pids-absent"); pids.push(a.browserCleanup.observedPids.length);
    assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent);
  }
  assert.deepEqual(peaks, [211.1953125, 146.67578125, 206.984375, 207.78515625]);
  assert.deepEqual(cleanups, [5.5546875, 16.390625, 39.02734375, -5.234375]);
  assert.deepEqual(times, [31092.884999990463, 30535.25, 34938.83499997854, 34823.75]);
  assert.deepEqual(counts, [285, 281, 321, 318]); assert.deepEqual(missing, [0, 0, 0, 1]);
  assert.deepEqual(pids, [45, 44]); assert.deepEqual(totals, [1542, 727]);
  assert.ok(r.diskPreflight.availableBytes >= r.diskPreflight.requiredBytes && r.hostPreflight.safeToStart);
  assert.equal(r.toolDownloadRemoved, true); assert.deepEqual(r.failures, []);
  for (const field of ["nativeConversionUsed", "headed", "browserServicesDisabled", "productionFilesReplaced", "speedGainProven", "publicAcceptance"]) assert.equal(r[field], false);
});

test("repeat CSV/HTML is reproducible and discloses rising cleanup without claiming no leak or fresh native decoding", async () => {
  const r = JSON.parse(await read(file)), rendered = renderProtectedRepeatReport(r);
  assert.equal(rendered.csv, (await read(file.replace(/\.json$/, ".csv"))).toString());
  assert.equal(rendered.html, (await read(file.replace(/\.json$/, ".html"))).toString());
  assert.match(rendered.html, /SAME authenticated native build; no fresh full native decode/);
  assert.match(rendered.html, /5\.555 → 16\.391 → 39\.027/);
  assert.match(rendered.html, /33\.473 MiB/);
  assert.match(rendered.html, /does NOT establish flat retained memory or long-session stability/);
  assert.doesNotMatch(rendered.html, /<script|https?:\/\//);
  assert.match(rendered.csv, /207\.78515625,-5\.234375,318,1/);
});
