// Independently reparse actual retained reports. Never infer browser acceptance
// from a green workflow, missing fields, another metadata scope, or another PID.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateScopedAudioTags } from "./scoped-audio-tag-validation.mjs";

const tags = { title: "Titre café — 音楽", artist: "Émile / कलाकार", album: "Album naïf",
  genre: "Essai", date: "2026", track: "3/9", comment: "αβγ & <texte>" };
const expected = { "wav-to-ogg": "pcm_s16le", "wav-to-opus": "pcm_s16le",
  "flac-to-ogg": "flac", "flac-to-opus": "flac", "m4a-to-ogg": "alac", "m4a-to-opus": "alac",
  "ogg-to-opus": "vorbis", "opus-to-ogg": "opus" };
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const integer = (value, limit) => assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= limit);
export function verifyHostedAudioScopeProof(proof) {
  assert.equal(proof.status, "collected-unverified-hosted-browser-scope-reports");
  assert.equal(proof.run.databaseId, 37684741516);
  assert.equal(proof.run.headSha, "bb45f39bd6081cf5fe8598dec43a080fedd4ef3b");
  assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.ownedDownloadRemoved, true);
  assert.equal(proof.protectedOriginalRead, false); assert.equal(proof.localBrowserLaunched, false);
  assert.equal(proof.completeChromiumMemoryAcceptance, false); assert.equal(proof.publicAcceptance, false);
  const job = proof.run.jobs.find(row => row.name === "audio-destination-scopes");
  assert.equal(job.status, "completed"); assert.equal(job.conclusion, "success");
  for (const name of ["Check TypeScript semantics before browser execution",
    "Run only genuine browser destination-scope checks", "Remove owned browser dependencies and caches"])
    assert.equal(job.steps.find(step => step.name === name)?.conclusion, "success", name);
  assert.equal(proof.run.jobs.length, 5);
  for (const other of proof.run.jobs.filter(row => row !== job)) assert.equal(other.conclusion, "skipped");
  assert.equal(proof.reports.length, 8);
  const cases = [], ids = new Set(), browsers = new Set();
  let preservedFields = 0, unavailableWrongScopeFields = 0;
  for (const record of proof.reports) {
    const bytes = Buffer.from(record.rawJson, "utf8");
    assert.ok(bytes.length > 0 && bytes.length < 256 * 1024);
    assert.equal(bytes.length, record.bytes); assert.equal(sha(bytes), record.sha256);
    const row = JSON.parse(record.rawJson);
    assert.ok(Object.hasOwn(expected, row.profileId)); assert.ok(!ids.has(row.profileId)); ids.add(row.profileId);
    assert.equal(row.status, "passed-small-destination-scope-check");
    assert.match(row.browser, /^\d+\.\d+\.\d+\.\d+$/); browsers.add(row.browser);
    for (const field of ["completeChromiumMemoryAcceptance", "lossyQualityAcceptance", "artworkAcceptance",
      "scalingAcceptance", "publicAcceptance"]) assert.equal(row[field], false);
    assert.equal(row.failure, undefined); assert.equal(row.cleanupFailure, undefined);
    assert.equal(row.fullIndependentDecode, "passed"); assert.equal(row.opfsCleanupVerified, true);
    assert.deepEqual(row.remainingOpfsEntries, []); assert.equal(row.ownedFixturesAndOutputsRemoved, true);
    assert.equal(row.sourcePinsUnchanged, true); assert.deepEqual(row.sourcePins, row.postSourcePins);
    assert.equal(Object.keys(row.sourcePins).length, 4);
    for (const hash of Object.values(row.sourcePins)) assert.match(hash, /^[0-9a-f]{64}$/);
    if (cases.length) assert.deepEqual(row.sourcePins, cases[0].sourcePins);
    const sourceScope = /^(ogg|opus)-/.test(row.profileId) ? "audio-stream" : "format";
    for (const file of [row.source, row.output]) {
      integer(file.bytes, 1024 * 1024); assert.ok(file.bytes > 0); assert.match(file.sha256, /^[0-9a-f]{64}$/);
      assert.equal(file.probe.streams.length, 1); assert.equal(file.probe.streams[0].codec_type, "audio");
      assert.equal(file.probe.streams[0].sample_rate, "48000"); assert.equal(file.probe.streams[0].channels, 1);
      const duration = Number(file.probe.format.duration); assert.ok(Number.isFinite(duration) && duration > 0);
    }
    assert.equal(row.source.probe.streams[0].codec_name, expected[row.profileId]);
    assert.equal(row.output.probe.streams[0].codec_name, row.profileId.endsWith("-ogg") ? "vorbis" : "opus");
    assert.equal(row.output.probe.format.format_name, "ogg");
    assert.ok(Math.abs(Number(row.source.probe.format.duration) - Number(row.output.probe.format.duration)) < 0.1);
    const sourceTags = validateScopedAudioTags(row.source.probe, tags, { scope: sourceScope });
    const positive = validateScopedAudioTags(row.output.probe, tags, { scope: "audio-stream" });
    const changed = validateScopedAudioTags(row.output.probe, { title: "Changed title" }, { scope: "audio-stream" });
    const wrong = validateScopedAudioTags(row.output.probe, tags, { scope: "format" });
    assert.deepEqual(sourceTags, row.source.tagValidation); assert.equal(sourceTags.status, "passed");
    assert.deepEqual(positive, row.output.positive); assert.equal(positive.status, "passed");
    assert.deepEqual(changed, row.output.changed); assert.equal(changed.fields[0].status, "changed");
    assert.deepEqual(wrong, row.output.wrongScope); assert.equal(wrong.status, "failed");
    assert.ok(wrong.fields.every(field => field.status === "missing" && field.actualValue === null));
    const state = row.browserState, metrics = state.metrics;
    assert.equal(state.jobState, "complete"); assert.equal(state.error, null);
    assert.equal(state.selectedProfileId, row.profileId); assert.equal(state.batchCompleted, 1);
    assert.equal(metrics.inputBytes, row.source.bytes); assert.equal(metrics.outputBytes, row.output.bytes);
    for (const field of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) integer(metrics[field], 262144);
    assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
    assert.equal(metrics.wasmMemoryBytes, 33554432); assert.equal(metrics.peakWasmMemoryBytes, 33554432);
    assert.equal(state.capabilities.crossOriginIsolated, true); assert.equal(state.capabilities.opfs, true);
    preservedFields += positive.fields.length; unavailableWrongScopeFields += wrong.fields.length;
    cases.push({ profileId: row.profileId, browser: row.browser, sourceBytes: row.source.bytes,
      outputBytes: row.output.bytes, sourceSha256: row.source.sha256, outputSha256: row.output.sha256,
      sourceScope, destinationScope: positive.scope, fields: positive.fields, changed, wrongScope: wrong,
      metrics, sourcePins: row.sourcePins, fullIndependentDecode: row.fullIndependentDecode,
      perConversionOpfsEmpty: true, ownedFixturesAndOutputsRemoved: true });
  }
  assert.deepEqual([...ids].toSorted(), Object.keys(expected).toSorted());
  assert.equal(browsers.size, 1); assert.equal(preservedFields, 56); assert.equal(unavailableWrongScopeFields, 56);
  return { status: "verified-small-hosted-destination-scopes-not-memory-or-quality-certification",
    browser: [...browsers][0], cases, preservedFields, changedTitleControls: 8, wrongScopeControls: 8,
    unavailableWrongScopeFields, fullIndependentDecodes: 8, perConversionOpfsEmpty: true,
    hostedOwnedCleanupStepSucceeded: true, completeChromiumMemoryAcceptance: false,
    currentStableChromeAcceptance: false, lossyQualityAcceptance: false, artworkAcceptance: false,
    scalingAcceptance: false, publicAcceptance: false };
}
