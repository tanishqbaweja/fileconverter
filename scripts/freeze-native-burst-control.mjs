// Compact a real control, retaining the exact executed runner even if a later
// control changes it. No media, copies, source titles, or acceptance promotion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const [relative, label] = process.argv.slice(2);
assert.match(relative ?? "", /^output\/playwright\/[a-z0-9TZ-]+-native-burst-attribution-control\.json$/);
assert.ok(["initial", "passed"].includes(label));
const file = path.join(root, relative), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.ok((await stat(file)).size <= 2 * 1048576);
const raw = await readFile(file), report = JSON.parse(raw);
assert.equal(report.originalRead, false); assert.equal(report.converterLoaded, false);
assert.equal(report.conversionsPerformed, 0); assert.equal(report.generatedMediaCopies, 0);
assert.equal(report.publicAcceptance, false); assert.equal(report.completeChromiumMemoryAcceptance, false);
for (const value of Object.values(report.cleanup)) assert.equal(value, true);
const archivedExecutedSources = {};
for (const [file, digest] of Object.entries(report.sourcePins)) {
  let bytes = await readFile(path.join(root, file));
  if (label === "initial" && file === "scripts/probe-native-burst-attribution.mjs" && sha(bytes) !== digest) {
    // The freezer's initial path regexp rejected the timestamp's Z before an
    // archive was written. Recover ONLY the exact three-line control change,
    // and require the actual original report's digest; never repin history.
    const added = "  // Do not allocate until an actual pre-allocation native row exists IN this\n  // phase. The tracker intentionally refuses to compare different phases.\n  await observer.through(phaseAt);\n";
    const current = bytes.toString(); assert.equal(current.split(added).length, 2);
    bytes = Buffer.from(current.replace(added, ""));
  }
  assert.equal(sha(bytes), digest, file);
  if (file === "scripts/probe-native-burst-attribution.mjs") archivedExecutedSources[file] = bytes.toString();
}
assert.equal(report.native.error, null); assert.equal(report.bursts.unavailableSamples, 0);
const phasePeaks = report.native.phases.map(p => ({ phase: p.phase, firstSequence: p.firstSequence,
  lastSequence: p.lastSequence, validSamples: p.validSamples, unavailableSamples: p.unavailableSamples,
  peak: p.peak, last: p.last }));
if (label === "initial") {
  assert.equal(report.status, "failed-diagnostic");
  assert.match(report.failure, /Actual native burst must trigger/);
  assert.equal(report.bursts.callbacks.length, 0);
} else {
  assert.equal(report.status, "completed-diagnostic"); assert.equal(report.failure, null);
  assert.deepEqual(report.errors, []); assert.ok(report.bursts.callbacks.some(row => row.status === "completed"));
  assert.equal(report.trace.status, "completed-diagnostic");
  assert.equal(report.trace.trace.overflow, false); assert.equal(report.trace.trace.dataLossOccurred, false);
}
const evidence = { recordedAt: new Date().toISOString(), status: report.status, scope: report.scope,
  rawReport: { path: relative, bytes: raw.length, sha256: sha(raw) },
  browserVersion: report.browserVersion, sourcePins: report.sourcePins, archivedExecutedSources,
  flags: report.flags, identicalOriginalFlags: report.identicalOriginalFlags,
  syntheticAllocationBytes: report.syntheticAllocationBytes,
  allocationStartedAt: report.allocationStartedAt, allocationReleasedAt: report.allocationReleasedAt,
  native: { intervalMs: report.native.intervalMs, identities: report.native.identities,
    sequence: report.native.sequence, observerCpuDeltaMs: report.native.observerCpuDeltaMs,
    error: report.native.error, phases: phasePeaks },
  bursts: report.bursts,
  trace: { status: report.trace.status, limits: report.trace.limits, trace: report.trace.trace,
    dumps: report.trace.dumps, allocatorSummary: report.trace.allocatorSummary,
    realmRowsRetained: report.trace.realmRows.length, realmRowsEvicted: report.trace.realmRowsEvicted,
    samplingError: report.trace.samplingError, summedAllocatorTotal: report.trace.summedAllocatorTotal },
  failure: report.failure, errors: report.errors, cleanup: report.cleanup,
  ownedChromePid: report.ownedChromePid, ownedObserverPid: report.ownedObserverPid,
  runtimeDirectory: report.runtimeDirectory, caveat: report.caveat,
  originalRead: false, converterLoaded: false, conversionsPerformed: 0, generatedMediaCopies: 0,
  publicAcceptance: false, completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false,
  allocationSourceOfOriginalFailure: null,
  next: label === "initial" ? "The known allocation occurred before the first native row in its phase; establish native acquisition coverage in the control phase BEFORE allocating. Keep phase-gap rejection intact; do not change the threshold or original conversion."
    : "Use verified bounded native-trigger instrumentation in a changed original diagnostic; control is not original-cause attribution or acceptance." };
evidence.freezerSourceSha256 = sha(await readFile(new URL(import.meta.url)));
const json = JSON.stringify(evidence, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 262144);
const output = path.join(root, `evidence/native-burst-control-${label}-2026-10-07.json`);
await writeFile(output, json, { flag: "wx" }); console.log(output);
