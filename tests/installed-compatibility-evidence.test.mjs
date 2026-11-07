import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { INSTALLED_COMPATIBILITY_CASES, validateCompatibilityMetrics } from "../scripts/lib/installed-compatibility-plan.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = b => createHash("sha256").update(b).digest("hex");
const comparison = JSON.parse(await read("evidence/2026-11-07-installed-brave-opera-compatibility.json"));
const pins = ["1c65d398ed41379079fe58a237bacbf04047d1670fb121628566b1ddd1088ea5", "6544cc41eeccd14286aa0fb8ea54842e989a75fce7bfb4f51334d0921e6ab3e4"];
const records = [];
for (const [i, receipt] of comparison.receipts.entries()) {
  const bytes = await read(receipt.path); assert.equal(sha(bytes), receipt.sha256); assert.equal(sha(bytes), pins[i]); records.push(JSON.parse(bytes));
}
test("actual installed Brave and Opera GX fresh headless launches pin executable and DLL identity, not latest-release or user-profile claims", () => {
  assert.deepEqual(records.map(r => [r.browserId, r.browserBefore.version, r.browserProtocolVersion]),
    [["brave", "157.1.99.55", "Chrome/157.0.8103.39"], ["opera-gx", "138.0.6044.65", "Chrome/154.0.8037.99"]]);
  assert.deepEqual(records[0].build, records[1].build); assert.deepEqual(records[0].sourcePins, records[1].sourcePins);
  for (const r of records) {
    assert.equal(r.executedHead, "60f179c4f51ecd233bd46d454c6fdcb2566a8fdd");
    assert.deepEqual(r.browserBefore, r.browserAfter); assert.equal(r.headed, false); assert.equal(r.browserServicesDisabled, false);
    assert.equal(r.normalInstalledUserProfileUsed, false); assert.equal(r.launchArguments.length, 6);
    assert.deepEqual(r.launchArguments.slice(0, 2), ["--headless=new", "--remote-debugging-port=0"]);
    assert.match(r.launchArguments[2], /^--user-data-dir=.*\\work\\installed-compatibility-/);
    assert.deepEqual(r.launchArguments.slice(3), ["--no-first-run", "--no-default-browser-check", "about:blank"]);
    assert.equal(r.runtimeCapabilities.isolated, true); assert.equal(r.runtimeCapabilities.opfs, true); assert.equal(r.runtimeCapabilities.sab, true);
  }
  assert.match(records[1].browserBefore.executable.path, /\\138\.0\.6044\.65\\opera\.exe$/);
  assert.match(records[1].browserBefore.library.path, /opera_browser\.dll$/);
  assert.equal(comparison.latestVendorReleaseClaim, false); assert.equal(comparison.regularOperaNonGxVerified, false);
});
test("all eight genuine production families are independently validated; remux and lossless audio re-encode remain distinct", () => {
  assert.equal(comparison.completedOutputs, 20); assert.equal(comparison.adverseJobs, 4);
  for (const r of records) {
    assert.equal(r.cases.length, 12); assert.equal(r.cases.filter(c => c.validated).length, 10);
    const good = r.cases.filter(c => c.kind === "success"); assert.deepEqual(good.map(c => c.profileId), INSTALLED_COMPATIBILITY_CASES.map(c => c.profileId));
    for (const c of r.cases) {
      assert.equal(c.input.method, "DOM.setFileInputFiles"); assert.equal(c.input.contentPayloadsSent, 0); assert.equal(c.input.fileMetadataUnchanged, true);
      if (c.validated) { validateCompatibilityMetrics(c.metrics); assert.equal(c.binding.convertedCopyCreated, false); assert.equal(c.binding.uniquePhysicalMatch, true); }
    }
    const by = id => good.find(c => c.profileId === id).validation;
    assert.equal(by("txt-to-docx").unicodeTextAndOrderVerified, true);
    assert.equal(by("tar-to-zip").allEntryNamesSizesAndSha256Equal, true);
    assert.ok(by("png-to-webp").ssim >= .9); assert.equal(by("png-to-webp").width, 1024); assert.equal(by("png-to-webp").height, 768);
    assert.equal(by("mkv-to-mp4").streamCopyRemux, true); assert.equal(by("mkv-to-mp4").genuineReencode, false);
    assert.equal(by("wav-to-flac").genuineReencode, true); assert.equal(by("wav-to-flac").pcmSha256, "e5d848aec722d5066682d0199ce94493143734f5aa09db0c2bdd3f702644dd91");
    assert.equal(by("srt-to-vtt").cues, 2);
    const direct = r.cases.find(c => c.kind === "direct"), recovery = r.cases.at(-1);
    assert.equal(direct.destination.mode, "handle"); assert.equal(direct.destination.actualFileHandle, true);
    assert.equal(recovery.kind, "recovery"); assert.equal(recovery.outputSha256, direct.outputSha256);
  }
  assert.deepEqual(comparison.routeComparisons.filter(c => c.byteIdentical === false).map(c => c.family), ["image"]);
  assert.deepEqual(comparison.routeComparisons.find(c => c.family === "image").outputBytes, [28330, 28410]);
});
test("full native journals reproduce exact primary peaks and all original cleanup windows, two unavailable samples are not zeros", async () => {
  for (const [i, r] of records.entries()) {
    const packed = await read(r.nativeArchive.path); assert.equal(sha(packed), r.nativeArchive.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: 16777216 }); assert.equal(sha(raw), r.nativeArchive.decodedSha256);
    const samples = JSON.parse(raw), window = (a, b) => samples.filter(s => Date.parse(s.timestamp) >= a && Date.parse(s.timestamp) <= b);
    for (const s of samples) if (s.privateBytes !== null) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
    const active = window(Date.parse(r.memory.windowStart), Date.parse(r.memory.windowEnd));
    const valid = active.filter(s => s.privateBytes !== null), unavailable = active.filter(s => s.privateBytes === null);
    assert.equal(valid.length, [1077, 1042][i]); assert.equal(unavailable.length, 1); assert.equal(r.memory.unavailableSamples, 1);
    assert.equal(unavailable[0].sampleError, "Birth query process unavailable");
    const peak = Math.max(...valid.map(s => s.privateBytes)); assert.equal(peak, r.memory.peak.privateBytes);
    assert.equal((peak - r.blankBaseline.privateBytes) / 1048576, [166.015625, 185.86328125][i]);
    for (const c of r.cases) {
      const rows = window(c.startedAt, c.endedAt), available = rows.filter(s => s.privateBytes !== null);
      assert.equal(available.length, c.memory.validSamples); assert.equal(rows.length - available.length, c.memory.unavailableSamples);
      assert.equal(Math.max(...available.map(s => s.privateBytes)), c.memory.peak.privateBytes);
      assert.equal((c.memory.cleanupStable.privateBytes - r.loadedIdle.privateBytes) / 1048576, c.memory.cleanupDeltaFromLoadedMiB);
      assert.ok(c.memory.incrementalPrivateMiB <= 250 && c.memory.cleanupDeltaFromLoadedMiB <= 96);
    }
  }
});
test("unsafe/write failure, application network allowlist and complete observed ownership cleanup pass without stress/native-picker promotion", () => {
  for (const [i, r] of records.entries()) {
    assert.match(r.cases.find(c => c.kind === "unsafe-archive").error, /unsafe tar entry/i);
    assert.match(r.cases.find(c => c.kind === "write-error").error, /destination rejected a bounded write/i);
    for (const c of r.cases.filter(c => ["unsafe-archive", "write-error"].includes(c.kind))) assert.deepEqual(c.leftovers, []);
    assert.deepEqual(r.failures, []); assert.deepEqual(r.forbiddenRequests, []); assert.equal(r.requestCount, [67, 59][i]);
    assert.equal(r.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(r.browserCleanup.observedPids.length, [26, 42][i]);
    assert.deepEqual(r.browserCleanup.observations.at(-1).current, []); assert.equal(r.serverCleanup.ownedRootAbsent, true);
    assert.equal(r.ownedRuntimeRemoved, true); assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter);
    assert.deepEqual(r.protectedOriginalAfter, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
    for (const key of ["nativePickerVerified", "nativeConversionUsed", "stressAcceptance", "publicPromotion"]) assert.equal(r[key], false);
  }
  assert.equal(comparison.fullGoalComplete, false);
});
