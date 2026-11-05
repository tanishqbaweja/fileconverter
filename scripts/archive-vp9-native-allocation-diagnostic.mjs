// One-shot lossless report compaction; never reads a converted media file.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { analyzeVp9NativeAllocation } from "./lib/vp9-native-allocation-analysis.mjs";
const root = path.resolve(import.meta.dirname, ".."), evidence = path.join(root, "evidence");
const name = "2026-11-05-webcodecs-vp9-fallback-native-allocation", sha = bytes => createHash("sha256").update(bytes).digest("hex");
const raw = await readFile(path.join(evidence, name + ".json"));
assert.ok(raw.length > 0 && raw.length <= 8388608, "New four-dump report has an explicit8MiB archive bound; legacy archive bounds unchanged");
const report = JSON.parse(raw); assert.ok(report.finishedAt && report.ownedRuntimeRemoved && report.ownedStaticStageRemoved);
assert.equal(report.rawArchive, undefined); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
assert.deepEqual(report.originalBefore, report.originalAfter);
const analysis = analyzeVp9NativeAllocation(report), archiveName = name + ".raw.json.gz", analysisName = name + "-analysis.json";
for (const file of [archiveName, analysisName, name + "-archive.json"]) await assert.rejects(access(path.join(evidence, file)), { code: "ENOENT" });
// Authenticate every raw trace before replacing the redundant JSON counters.
for (const row of report.nativeAllocation.checkpoints) {
  const file = `2026-11-05-webcodecs-vp9-native-allocation-${row.label}.trace.json.gz`;
  assert.equal(path.resolve(row.result.archive.path), path.join(evidence, file));
  const packed = await readFile(path.join(evidence, file)), restored = gunzipSync(packed, { maxOutputLength: 8388608 });
  assert.equal(sha(packed), row.result.archive.sha256); assert.equal(sha(restored), row.result.archive.restoredSha256);
  assert.equal(packed.length, row.result.archive.bytes); assert.equal(restored.length, row.result.archive.restoredBytes);
}
const packed = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(packed), raw);
await writeFile(path.join(evidence, archiveName), packed, { flag: "wx" });
assert.deepEqual(gunzipSync(await readFile(path.join(evidence, archiveName))), raw);
const compact = { ...report, rawArchive: { file: "evidence/" + archiveName, bytes: packed.length, sha256: sha(packed),
  decodedBytes: raw.length, decodedSha256: sha(raw), exactRoundtripVerifiedBeforeReplacement: true },
  blankSamples: report.blankSamples.map(({ processes, ...row }) => ({ ...row, processCount: processes?.length ?? null })),
  nativeMemory: { ...report.nativeMemory, graphBuckets: undefined, graphDetail: "Preserved byte-exactly in rawArchive" },
  nativeAllocation: { ...report.nativeAllocation, checkpoints: report.nativeAllocation.checkpoints.map(row => ({ ...row,
    result: { ...row.result, summary: row.result.summary.map(summary => ({ ...summary,
      processes: summary.processes.map(process => ({ ...process, liveAllocatorCounters: undefined,
        detailedCounters: "Preserved byte-exactly in rawArchive and authenticated raw trace" })) })) } })) } };
const compactBytes = Buffer.from(JSON.stringify(compact, null, 2) + "\n");
await writeFile(path.join(evidence, analysisName), JSON.stringify(analysis, null, 2) + "\n", { flag: "wx" });
await writeFile(path.join(evidence, name + ".json"), compactBytes);
assert.equal(sha(gunzipSync(await readFile(path.join(evidence, archiveName)))), sha(raw));
const receipt = { report: "evidence/" + name + ".json", analysis: "evidence/" + analysisName,
  rawArchive: compact.rawArchive, compactSha256: sha(compactBytes), originalBytes: raw.length,
  retainedReportBytes: packed.length + compactBytes.length, allTraceHashesVerified: true,
  allRoundtripsVerified: true, convertedFilesRead: false, acceptanceChanged: false };
await writeFile(path.join(evidence, name + "-archive.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ originalBytes: raw.length, retainedReportBytes: receipt.retainedReportBytes,
  incrementalPrivateMiB: analysis.incrementalPrivateMiB, renderer: analysis.dominantRenderer.pid,
  deltas: analysis.loadedIdleToOutputClosedDeltas, acceptedOptimization: false }));
