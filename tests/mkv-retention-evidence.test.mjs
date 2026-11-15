import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { summarizeMkvRetention, renderMkvRetention, extractRetentionBlinkHeaps } from "../scripts/lib/mkv-retention-report.mjs";
import { summarizeLifecycleTrace } from "../scripts/lib/lifecycle-allocation-attribution.mjs";
import { readHeaderProtectedReference, headerProtectedReference } from "../scripts/lib/mkv-header-protected-reference.mjs";
const file = "evidence/2026-11-15T09-26-19-641Z-mkv-hevc-header-core-protected-retention-diagnostic.json";
const read = name => readFile(new URL(`../${name}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("actual retention diagnostic remains failed above250; first original passes content, second cancelled; no smaller total or unknown-process omission", async () => {
  const bytes = await read(file); assert.equal(sha(bytes), "989c37d1b261ddc6e0989b8cfed6707929b442e58fca932eea9f32fe79c538d9");
  const r = JSON.parse(bytes), [a] = r.arms;
  const packed = await read(a.archive.file); assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 16 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
  const samples = JSON.parse(raw); assert.equal(samples.length, 1088);
  const s = summarizeMkvRetention(r, samples);
  assert.equal(s.status, "failed-not-acceptance"); assert.equal(s.conversion.incrementalPrivateMiB, 262.46875);
  assert.equal(s.conversion.validSamples, 754); assert.equal(s.conversion.unavailableSamples, 2);
  const unknownChild = s.conversion.processes.find(p => p.pid === 31892);
  assert.equal(unknownChild.privateBytes, 105742336); assert.equal(unknownChild.classification, null);
  assert.equal(a.cases.length, 2); assert.equal(a.cases[1].state, undefined);
  const reference = readHeaderProtectedReference(await read(headerProtectedReference.file), r.candidateBuild), [c] = a.cases;
  assert.equal(c.state, "complete"); assert.equal(c.metrics.outputBytes, reference.outputBytes);
  assert.equal(c.validation.outputSha256, reference.outputSha256);
  assert.equal(c.validation.fullVideoDecode, false); assert.ok(c.validation.fullVideoDecodeInheritedThroughWholeOutputIdentity);
  assert.equal(c.metrics.elapsedMs, 61436.714999973774); assert.equal(c.memory.incrementalPrivateMiB, 236.8515625);
  assert.equal(c.cleanupAboveIdleMiB, 11.8359375); assert.equal(c.outputRemoved, true);
  assert.equal(a.preCleanupJob.state, "running"); assert.ok(a.preCleanupJob.metrics.outputBytes > 1048576);
  assert.equal(a.jobCleanup.cancellationRequested, true); assert.equal(a.jobCleanup.terminalState, "cancelled");
  assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.toolDownloadRemoved);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(a.browserCleanup.observedPids.length, 49);
  assert.deepEqual(r.originalBefore, r.originalAfter); assert.equal(r.originalAfter.bytes, 2958573265);
  assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(a.forbiddenRequests, []); assert.equal(a.retention.closed, true);
  assert.equal(a.retention.realmOwnership.closed, true); assert.equal(a.retention.realmOwnership.peakLeasedEntries, 3);
  assert.equal(a.retention.realmOwnership.retirementFailures, 1); // retained, not relabelled successful detach
  assert.equal(a.retention.forcedGc, false); assert.equal(a.retention.perturbsMemory, true);
  for (const field of ["publicAcceptance", "headed", "browserServicesDisabled", "nativeConversionUsed", "speedGainProven"]) assert.equal(r[field], false);
  assert.equal(r.sourcePins["scripts/lib/mkv-retention-diagnostic.mjs"], sha(await read("scripts/lib/mkv-retention-diagnostic.mjs")));
});

test("authenticated allocator dumps narrow committed Blink retention but do not prove a callsite, repeated leak, or purpose of unknown child", async () => {
  const r = JSON.parse(await read(file)), [a] = r.arms, blinkHeapStatistics = [];
  for (const point of a.retention.allocation.checkpoints) {
    assert.equal(point.error, null); assert.equal(point.detached, true);
    const packed = await read(point.rawArchive.path); assert.equal(sha(packed), point.rawArchive.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: 8388608 }); assert.equal(sha(raw), point.rawArchive.restoredSha256);
    const trace = JSON.parse(raw);
    assert.deepEqual(summarizeLifecycleTrace(trace, { success: true, dumpGuid: point.summary.guid }, point.processes), point.summary);
    blinkHeapStatistics.push(extractRetentionBlinkHeaps(trace, point));
  }
  const main = blinkHeapStatistics.map(p => p.rows.find(r => r.pid === 25980 && r.name === "blink_gc/main/heap"));
  assert.deepEqual(main.map(r => r.committedBytes), [3276800, 8781824]);
  assert.deepEqual(main.map(r => r.allocatedObjectsBytes), [3144664, 1778600]);
  assert.ok(main.every(r => r.callsiteCauseProven === false && r.valuesOverlap));
  const first = a.retention.checkpoints[0], cleanup = a.retention.checkpoints[3];
  const page = point => point.realms.targets.find(t => t.type === "page");
  assert.equal(page(first).allocatedJSHeapBytes, 5562368); assert.equal(page(cleanup).allocatedJSHeapBytes, 5263360);
  assert.equal(page(cleanup).backingStorageBytes, 626746);
  assert.equal(cleanup.realms.targets.filter(t => t.type === "worker").length, 1);
  const packed = await read(a.archive.file), samples = JSON.parse(gunzipSync(packed));
  const summary = { ...summarizeMkvRetention(r, samples), blinkHeapStatistics };
  // JSON intentionally omits unavailable undefined terminal fields on the
  // interrupted second job; compare the actual serialized artifact contract.
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), JSON.parse(await read(file.replace(/\.json$/, ".analysis.json"))));
  const rendered = renderMkvRetention(summary);
  assert.equal(rendered.csv, (await read(file.replace(/\.json$/, ".csv"))).toString());
  assert.equal(rendered.html, (await read(file.replace(/\.json$/, ".html"))).toString());
  assert.match(rendered.html, /262\.469/); assert.match(rendered.html, /failure is retained/);
  assert.match(rendered.html, /Allocation callsite cause and flat long-session stability remain unproven/);
  assert.doesNotMatch(rendered.html, /<script|https?:\/\//);
  const incomplete = structuredClone(r); incomplete.arms[0].retention.checkpoints[0].realms.targets[0].error = "unavailable";
  const missing = summarizeMkvRetention(incomplete, samples).checkpoints[0];
  assert.equal(missing.usedJSHeapBytes, null); assert.equal(missing.allocatedJSHeapBytes, null);
});
