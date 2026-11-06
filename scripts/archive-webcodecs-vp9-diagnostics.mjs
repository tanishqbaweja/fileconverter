// One-shot lossless archival of redundant raw sampler detail, never media data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, ".."), evidence = path.join(root, "evidence");
const rebuilt = process.argv[2] === "--rebuilt-controls";
const allocation = process.argv[2] === "--allocation-controls";
const single = process.argv[2] === "--single-core-control";
const fidelity = process.argv[2] === "--isolated-fidelity-control";
const platformQualification=process.argv[2]==="--platform-original-qualification-control";
const platformStartup=process.argv[2]==="--platform-original-startup-control";
const platformAllocation=process.argv[2]==="--platform-original-allocation-control";
const platformOriginal=platformQualification||platformStartup||platformAllocation;
const platformOriginalKind=platformQualification?"qualification":platformAllocation?"allocation":"startup";
const tokenRetry=process.argv[2]==="--token-qualification-retry-control";
const tokenQualification=process.argv[2]==="--token-qualification-control"||tokenRetry;
const lazyQualification=process.argv[2]==="--lazy-qualification-control"||tokenQualification;
const allocationQualification = process.argv[2] === "--allocation-qualification-control"||lazyQualification;
const temporal = process.argv[2] === "--temporal-qualification-control" || allocationQualification;
const recovery = process.argv[2] === "--recovery-qualification-control" || temporal;
const stream = process.argv[2] === "--stream-duration-fidelity-control" || recovery;
const stored = process.argv[2] === "--duration-stored-timing-control" || stream;
const duration = process.argv[2] === "--duration-fixed-control" || stored || platformOriginal, runId = duration ? process.argv[3] : null;
if (duration) assert.match(runId ?? "", /^\d{8,14}$/);
const isolated = process.argv[2] === "--isolated-control" || fidelity || duration;
assert.ok(process.argv.length === 2 || (process.argv.length === (duration ? 4 : 3) && (rebuilt || allocation || single || isolated)));
const prefix = temporal || platformOriginal ? "2026-11-06" : isolated ? "2026-11-05" : "2026-11-01";
const family = temporal ? "vp9" : "webcodecs-vp9";
const names = platformOriginal ? ["original-"+platformOriginalKind+"-"+runId] : recovery ? ["recovery-qualification-" + runId] : stream ? ["stream-duration-fidelity-" + runId] : stored ? ["duration-stored-timing-" + runId] : duration ? ["duration-fixed-" + runId] : fidelity ? ["isolated-fidelity"] : isolated ? ["isolated-fallback"] : single ? ["comparison-single-core-preflight-recovery"] : allocation ? ["fallback-realms", "comparison-default-core"] : rebuilt ? ["rebuilt-native", "rebuilt-cpu-fallback"] :
  ["first-smoke", "functional-diagnostic", "native-color-diagnostic", "explicit-color-fixture", "frame-color-fixture", "encoder-preference-fallback"];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const legacyOutput = path.join(evidence, prefix + "-webcodecs-vp9-" + (recovery ? "recovery-qualification-control-" + runId + "-archive" : stream ? "stream-duration-fidelity-control-" + runId + "-archive" : stored ? "duration-stored-timing-control-" + runId + "-archive" : duration ? "duration-fixed-control-" + runId + "-archive" : fidelity ? "isolated-fidelity-control-archive" : isolated ? "isolated-control-archive" : single ? "single-core-control-archive" : allocation ? "allocation-control-archives" : rebuilt ? "rebuilt-control-archives" : "diagnostic-archives") + ".json");
const output = platformOriginal?path.join(evidence,prefix+"-webcodecs-vp9-original-"+platformOriginalKind+"-control-"+runId+"-archive.json"):
  allocationQualification ? path.join(evidence,prefix+"-vp9-"+(tokenQualification?"token":lazyQualification?"lazy":"allocation")+"-qualification-control-"+runId+(tokenRetry?"-attempt2":"")+"-archive.json") : legacyOutput;
await assert.rejects(access(output), { code: "ENOENT" });
const prepared = [];
// Preflight every terminal before mutating any owned receipt.
for (const name of names) {
  const label = allocationQualification ? (tokenQualification?"token":lazyQualification?"lazy":"allocation")+"-qualification-" + runId+(tokenRetry?"-attempt2":"") : temporal ? "temporal-qualification-" + runId : name;
  const file = `${prefix}-${family}-${label}.json`, original = await readFile(path.join(evidence, file));
  assert.ok(original.length > 0 && original.length <= (platformStartup||platformAllocation?8388608:4194304));
  const report = JSON.parse(original); assert.match(report.status, /^(?:passed-one-small-private-browser|passed-private-vp9-recovery-sequence|passed-private-platform-original-startup-only|completed-perturbed-original-platform-allocation-diagnostic-not-acceptance|failed-private-vp9-browser)/);
  assert.ok(report.finishedAt && report.ownedRuntimeRemoved); assert.equal(report.rawArchive, undefined);
  const archive = file.replace(/\.json$/, ".raw.json.gz"); await assert.rejects(access(path.join(evidence, archive)), { code: "ENOENT" });
  const compressed = gzipSync(original, { level: 9 }); assert.deepEqual(gunzipSync(compressed), original);
  prepared.push({ file, archive, original, report, compressed });
}
const results = [];
for (const { file, archive, original, report, compressed } of prepared) {
  await writeFile(path.join(evidence, archive), compressed, { flag: "wx" });
  assert.deepEqual(gunzipSync(await readFile(path.join(evidence, archive))), original);
  const compact = { ...report,
    rawArchive: { file: "evidence/" + archive, bytes: compressed.length, sha256: sha(compressed),
      decodedBytes: original.length, decodedSha256: sha(original), exactRoundtripVerifiedBeforeReplacement: true },
    blankSamples: report.blankSamples.map(({ processes, ...sample }) => ({ ...sample, processCount: processes?.length ?? null })),
    nativeMemory: report.nativeMemory ? { ...report.nativeMemory, graphBuckets: undefined,
      graphDetail: "Preserved byte-exactly in rawArchive, not omitted from the calculation" } : null };
  if(platformAllocation&&compact.platformAllocation)compact.platformAllocation={...compact.platformAllocation,
    checkpoints:compact.platformAllocation.checkpoints.map(row=>({...row,result:row.result?{...row.result,
      summary:row.result.summary.map(phase=>({...phase,processes:phase.processes.map(({liveAllocatorCounters,...process})=>{
        assert.ok(liveAllocatorCounters);return process;
      })})),liveAllocatorCounterDetail:"Preserved byte-exactly in rawArchive and bounded trace archives; overlapping, never summed"}:null}))};
  const compactBytes = Buffer.from(JSON.stringify(compact, null, 2) + "\n");
  await writeFile(path.join(evidence, file), compactBytes);
  assert.equal(sha(gunzipSync(await readFile(path.join(evidence, archive)))), sha(original));
  results.push({ file: "evidence/" + file, archive: compact.rawArchive, compactBytes: compactBytes.length, compactSha256: sha(compactBytes) });
}
const report = { scope: "Lossless sampler receipt storage reduction; original failed/passed results and thresholds unchanged", reports: results,
  originalBytes: prepared.reduce((sum, row) => sum + row.original.length, 0),
  retainedBytes: results.reduce((sum, row) => sum + row.compactBytes + row.archive.bytes, 0),
  allRoundtripsVerified: true, convertedFilesRead: false, privateNativeToolRemoved: false, publicAcceptance: false };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, originalBytes: report.originalBytes, retainedBytes: report.retainedBytes, allRoundtripsVerified: true }));
