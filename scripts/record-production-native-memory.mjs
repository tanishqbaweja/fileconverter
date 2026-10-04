// Retain compact, independently reconstructed profiler evidence. No conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rawPath = path.resolve(root, process.argv[2] ?? "");
assert.ok(rawPath.startsWith(path.join(root, "outputs/reports") + path.sep));
const rawBytes = await stat(rawPath); assert.ok(rawBytes.size < 32 * 1024 ** 2);
const bytes = await readFile(rawPath), raw = JSON.parse(bytes);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const memory = raw.nativeMemory; assert.ok(memory && memory.error == null);
assert.equal(raw.profileId, "mkv-to-mp4"); assert.equal(raw.destinationMode, "direct-handle");
assert.equal(raw.source.bytes, 2958573265);
assert.equal(raw.source.sha256.toLowerCase(), "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(raw.blankBaseline.stable, true); assert.equal(raw.loadedIdle.stable, true);
assert.ok(memory.identities.length <= 512 && memory.phases.length <= 128 && memory.transitions.length <= 256);
assert.ok(memory.graphBuckets.length <= 4096);
const validateRow = (row) => {
  if (!row) return;
  assert.ok(row[0] >= 1 && row[0] <= memory.sequence);
  if (row[6] != null) { assert.equal(row[3], null); assert.equal(row[4], null); assert.equal(row[7], null); return; }
  assert.ok(row[7].length > 0 && row[7].length <= 128);
  assert.equal(row[3], row[7].reduce((sum, p) => sum + p[1], 0));
  assert.equal(row[4], row[7].reduce((sum, p) => sum + p[2], 0));
  for (const [index, privateBytes, rssBytes] of row[7]) {
    assert.ok(memory.identities[index] && privateBytes > 0 && rssBytes >= 0);
    assert.ok(["browser", "unknown"].includes(memory.identities[index].type));
  }
};
for (const aggregate of [...memory.phases, ...memory.graphBuckets]) {
  assert.ok(aggregate.validSamples + aggregate.unavailableSamples > 0);
  for (const row of [aggregate.peak, aggregate.rssPeak, aggregate.last, ...aggregate.unavailableExamples]) validateRow(row);
}
assert.equal(memory.sequence, memory.phases.reduce((sum, p) => sum + p.validSamples + p.unavailableSamples, 0));
const runs = raw.runs ?? raw.completedRuns ?? [];
for (const run of runs) {
  const phases = memory.phases.filter((p) => [`pre-conversion-${run.run}`, `conversion-${run.run}`].includes(p.phase));
  const nativePeak = Math.max(...phases.map((p) => p.peak?.[3] ?? -Infinity));
  assert.equal(run.nativePeaks.peak.privateBytes, nativePeak);
  assert.equal(run.nativePeaks.validSamples, phases.reduce((sum, p) => sum + p.validSamples, 0));
  assert.equal(run.peakPrivateBytes, Math.max(run.cimPeakPrivateBytes, nativePeak));
  assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - raw.blankBaseline.privateBytes) / 1024 ** 2);
  assert.ok(run.maxReadChunkBytes <= 262144 && run.maxWriteChunkBytes <= 1048576);
  assert.ok(run.peakQueuedBytes <= 1048576 && run.peakPendingOperations <= 1);
  assert.ok(run.mediaProbe?.withinValidation?.compressedPacketStreamHash);
}
if (raw.passed) {
  assert.equal(runs.length, 3); assert.ok(Object.values(raw.checks).every(Boolean));
  assert.ok(raw.incrementalPrivateMiB <= 250);
}
let fixtureBytes = 0; const fixtureHash = createHash("sha256");
for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: 1048576 })) {
  fixtureBytes += chunk.length; fixtureHash.update(chunk);
}
assert.equal(fixtureBytes, raw.source.bytes); assert.equal(fixtureHash.digest("hex"), raw.source.sha256.toLowerCase());
// No deletion here. Inspect exact expected-owned scratch/profile absence.
const remaining = (await import("node:fs/promises")).readdir;
const names = await remaining(path.join(root, "work"));
assert.ok(!names.some((name) => name === "memory-profile-chrome" || name.startsWith("memory-observer-") || name.startsWith("profile-runtime-")));
const sourceHashes = {};
for (const [file, expected] of Object.entries(raw.sourceHashes)) {
  sourceHashes[file] = sha(await readFile(path.join(root, file))); assert.equal(sourceHashes[file], expected);
}
const artifactBase = rawPath.slice(0, -5), artifacts = [];
for (const suffix of [".json", ".csv", ".html", "-native-peaks.csv"]) {
  const file = `${artifactBase}${suffix}`, data = await readFile(file);
  artifacts.push({ path: path.relative(root, file).replaceAll("\\", "/"), bytes: data.length, sha256: sha(data) });
}
const evidence = {
  recordedAt: new Date().toISOString(), scope: "Changed general production profiler integration; not broad route recertification or speed A/B",
  status: raw.passed === true ? "passed-three-repeat-session" : "failed-gate",
  raw: { path: path.relative(root, rawPath).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha(bytes) }, artifacts,
  executedSources: raw.sourceHashes, currentSources: sourceHashes, browser: raw.browser ?? null,
  source: { bytes: raw.source.bytes, sha256: raw.source.sha256 },
  blankBaseline: raw.blankBaseline, loadedIdle: raw.loadedIdle,
  peakPrivateBytes: raw.peakPrivateBytes ?? null, incrementalPrivateMiB: raw.incrementalPrivateMiB ?? null,
  checks: raw.checks ?? null, failure: raw.failure ?? null, cancellationCheck: raw.cancellationCheck,
  runs, nativeMemory: { ...memory, graphBuckets: undefined },
  graph: { retainedBuckets: memory.graphBuckets.length, evictedBuckets: memory.graphBucketsEvicted, durationMs: 1000 },
  cleanup: { protectedFixturePostHashVerified: true, profileAndObserverScratchAbsent: true,
    convertedPayloadInsideRemovedProfile: true, evidenceRecorderDoesNotDelete: true,
    runtimeScratchAbsent: raw.runtimeScratch ? !names.includes(path.basename(raw.runtimeScratch.directory)) : null },
  limitations: ["Test-selected real OPFS directory handle uses production selected-handle output; not native OS picker/manual physical-drive proof",
    "Historical route reports are not rewritten or recertified by this instrumentation change",
    "No codec, quality, heap, buffer, queue or production engine change; no conversion-speed or zero-observer-cost claim",
    "One browser session does not prove every category, clean-session scaling, current browser/device or full original goal"],
};
const destination = path.join(root, "evidence", `production-native-memory-${raw.generatedAt.slice(0, 10)}.json`);
await writeFile(destination, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${destination}\n${JSON.stringify({ status: evidence.status, runs: runs.length,
  increment: evidence.incrementalPrivateMiB, nativeSnapshots: memory.sequence, cleanup: evidence.cleanup })}\n`);
