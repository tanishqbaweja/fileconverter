import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";

const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = JSON.parse(await read("evidence/2026-10-10T08-18-49-643Z-aiff-id3-sync-opfs-stress.json"));
async function restore(entry) {
  const gzip = await read(entry.path), bytes = gunzipSync(gzip);
  assert.equal(gzip.length, entry.bytes);
  assert.equal(sha(gzip), entry.sha256);
  assert.equal(bytes.length, entry.restoredBytes);
  assert.equal(sha(bytes), entry.restoredSha256);
  return bytes;
}
const raw = JSON.parse(await restore(proof.retainedReports.find(row => row.path.endsWith(".json.gz"))));

test("Actual private AIFF OPFS stress has three identical full-PCM/art/tag validated outputs; no public or scaling claim", () => {
  assert.equal(proof.status, "passed-three-private-aiff-stress-repeats-and-cancellation");
  assert.equal(proof.failure, null);
  assert.equal(proof.mode, "sync-opfs");
  assert.equal(proof.fixture.bytes, 140922233);
  assert.equal(proof.fixture.sha256, "cd5b778644222d68e391fcbbe3c4845c6872cab92b7726d85437e7720590fdee");
  assert.equal(raw.passed, true);
  assert.equal(raw.runs.length, 3);
  assert.deepEqual(raw.runs, proof.reportSummary.runs);
  for (const [index, run] of raw.runs.entries()) {
    assert.equal(run.run, index + 1);
    assert.equal(run.sourceBytes, proof.fixture.bytes);
    assert.equal(run.outputBytes, 153600760);
    assert.equal(run.sha256, "8295fda722e8b578b18fa88bad0e9c6ae24ec35a27942900c998ddd6848f0dd2");
    assert.equal(run.validationBytes, run.outputBytes);
    assert.equal(run.validationSha256, run.sha256);
    assert.equal(run.mediaProbe.withinValidation.passed, true);
    assert.equal(run.mediaProbe.withinValidation.method, "decoded-pcm-sha256");
    assert.equal(run.mediaProbe.withinValidation.sha256, proof.fixture.decodedPcmSha256);
    assert.equal(run.mediaProbe.withinValidation.mediaTraversal, "full-packet-traversal");
    const art = run.mediaProbe.withinArtworkValidation;
    assert.equal(art.passed, true);
    assert.equal(art.sha256, proof.fixture.artwork.sha256);
    assert.equal(art.bytes, 178);
    for (const [key, value] of Object.entries(proof.fixture.expectedTags)) {
      assert.equal(run.mediaProbe.format.tags[key], value);
      assert.equal(art.tags[key], value);
    }
    const audio = run.mediaProbe.streams.filter(stream => stream.codec_type === "audio");
    assert.equal(audio.length, 1);
    assert.equal(audio[0].codec_name, "pcm_s16be");
    assert.equal(audio[0].duration_ts, 38400000);
    assert.equal(audio[0].sample_rate, "48000");
    assert.equal(audio[0].channels, 2);
    assert.equal(run.maxReadChunkBytes, 262144);
    assert.equal(run.maxWriteChunkBytes, 32768);
    assert.equal(run.peakQueuedBytes, 32768);
    assert.equal(run.peakPendingOperations, 1);
    assert.equal(run.peakWasmMemoryBytes, 16777216);
  }
  for (const key of ["publicAcceptance", "multiGigabyteScalingAcceptance", "speedImprovementProven", "protectedOriginalRead"])
    assert.equal(proof[key], false);
});

test("Private stress memory uses stable blank and full tree/native+CIM maximum, preserves unavailable samples and recovery bound", () => {
  assert.equal(raw.blankBaseline.stable, true);
  assert.equal(raw.loadedIdle.stable, true);
  assert.equal(raw.blankBaseline.privateBytes, 272162816);
  assert.equal(raw.peakPrivateBytes, 488910848);
  assert.equal(raw.incrementalPrivateMiB, (raw.peakPrivateBytes - raw.blankBaseline.privateBytes) / 1048576);
  assert.equal(raw.incrementalPrivateMiB, 206.70703125);
  assert.equal(raw.limitMiB, 250);
  assert.equal(raw.cleanupRecoveryLimitMiB, 96);
  assert.ok(Object.values(raw.checks).every(value => value === true));
  assert.equal(raw.nativeMemory.intervalMs, 100);
  for (const phase of raw.nativeMemory.phases) {
    for (const row of [phase.peak, phase.rssPeak, phase.last].filter(Boolean)) {
      assert.equal(row[3], row[7].reduce((sum, process) => sum + process[1], 0));
      assert.equal(row[4], row[7].reduce((sum, process) => sum + process[2], 0));
      assert.ok(row[7].every(process => raw.nativeMemory.identities[process[0]]));
    }
  }
  const conversion = raw.nativeMemory.phases.filter(phase => /^conversion-[123]$/.test(phase.phase));
  assert.equal(conversion.length, 3);
  assert.equal(conversion.reduce((sum, phase) => sum + phase.validSamples, 0), 201);
  assert.equal(conversion.reduce((sum, phase) => sum + phase.unavailableSamples, 0), 0);
  for (const run of raw.runs) {
    assert.equal(run.peakPrivateBytes, Math.max(run.nativePeaks.peak.privateBytes, run.cimPeakPrivateBytes));
    assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - raw.blankBaseline.privateBytes) / 1048576);
    assert.ok(run.incrementalPrivateMiB <= 250);
    assert.ok(run.cleanupDeltaFromLoadedMiB <= raw.cleanupRecoveryLimitMiB);
  }
  const missing = raw.nativeMemory.phases.filter(phase => phase.unavailableSamples > 0);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].phase, "validation-2");
  assert.equal(missing[0].unavailableSamples, 1);
  assert.equal(missing[0].unavailableExamples[0][3], null);
  assert.equal(missing[0].unavailableExamples[0][4], null);
  assert.match(missing[0].unavailableExamples[0][6], /OpenProcess/);
});

test("Stress runs remain headless/hidden, losslessly archived, private and birth-owned cleaned after success/cancellation", async () => {
  assert.equal(raw.browser.headless, true);
  assert.equal(proof.browserMode, "headless");
  assert.equal(proof.subprocessWindowsHidden, true);
  assert.equal(proof.noDocker, true);
  assert.equal(proof.nativeToolsOnlyFixturesAndValidation, true);
  assert.deepEqual(proof.helperProof.forbiddenRequests, []);
  assert.equal(proof.runner.absence.status, "owned-identity-absent");
  for (const row of proof.helperProof.launches) assert.equal(row.absence.status, "owned-identity-absent");
  assert.equal(proof.assetsRestored, true);
  assert.equal(proof.ownedRuntimeRemoved, true);
  assert.equal(proof.ownedRawReportsRemoved, true);
  assert.equal(proof.helperProof.profileRemoved, true);
  assert.equal(proof.helperProof.observerScratchRemoved, true);
  for (const directory of [proof.ownedRuntime, proof.ownedRawReportDirectory, proof.helperProof.runtime])
    await assert.rejects(access(directory), { code: "ENOENT" });
  const cancel = raw.cancellationCheck;
  assert.equal(cancel.passed, true);
  assert.ok(cancel.outputBytes > 0);
  assert.equal(cancel.phaseAfterCancellation, "Cancelled");
  assert.equal(cancel.pendingOperations, 0);
  assert.equal(cancel.queuedBytes, 0);
  assert.deepEqual(cancel.projectLocalEntriesAfter, []);
  const executed = (await restore(proof.executedSource)).toString();
  assert.equal(sha(executed), proof.recipeGeneratedSha256);
  assert.ok(executed.includes('"--headless=new"'));
  assert.ok(executed.includes("windowsHide: true"));
  assert.ok(executed.includes("Refusing reused or unrelated PID cleanup"));
  assert.ok(executed.includes("source.artwork && (mp3Output || flacOutput || aiffOutput) ? 1 : 0;"));
  for (const entry of proof.retainedReports) await restore(entry);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), hash, file);
  for (const name of ["within-aiff.mjs", "within-aiff.wasm"])
    assert.equal(sha(await read("dist/client/engines/remux/" + name)), sha(await read("public/engines/remux/" + name)));
});
