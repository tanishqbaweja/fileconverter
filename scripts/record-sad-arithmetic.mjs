import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, stat, realpath, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const gh = "D:\\Program Files\\GitHub CLI\\gh.exe", runId = process.argv[2];
assert.match(runId, /^\d+$/);
const directory = path.join(root, "outputs/reports", `sad-arithmetic-${runId}`);
assert.equal(await realpath(directory), directory, "Owned report directory must not be redirected");
const file = path.join(directory, "sad-arithmetic.json");
assert.ok((await stat(file)).size <= 65536);
const raw = await readFile(file), report = JSON.parse(raw);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const runGh = async (args) => (await exec(gh, [...args, "--repo", "tanishqbaweja/fileconverter"], { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 ** 2 })).stdout;
const api = async (args) => (await exec(gh, ["api", ...args], { cwd: root, windowsHide: true, maxBuffer: 1024 ** 2 })).stdout;
const run = JSON.parse(await runGh(["run", "view", runId, "--json", "status,conclusion,headSha,jobs,url"]));
assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success");
assert.equal(run.jobs[0].steps.find((s) => s.name === "Remove repository-local build data").conclusion, "success");
assert.equal(report.status, "passed-private-sad-proof-and-primitive-cost-only");
assert.equal(report.publicAcceptance, false); assert.equal(report.browserConversions, 0);
assert.equal(report.conversionBuildsChanged, false); assert.equal(report.speedGainClaim, null);
assert.equal(report.emscriptenVersion, "6.0.4");
assert.equal(report.initialWasmMemoryBytes, 33554432); assert.equal(report.maximumWasmMemoryBytes, 33554432);
assert.equal(report.upstream.sha256, "82c47be2c051aa92079ac0c731818c4a33612c6dbe61534ada5c0ac5c33667ae");
assert.equal(report.totalCases, 529564);
assert.deepEqual(report.cases, {
  exhaustiveUniformBytePairs: 262144, exhaustiveMixedSignBytePairs: 262144,
  singlePixelLaneAndRow: 1152, seededRandomIndependentStrideAndAlignment: 4096,
  zeroAndOverlappingNonnegativeStrides: 20, inputEndsExactlyAtWasmBoundary: 8,
});
assert.deepEqual(report.shapes, ["8x8", "16x8", "8x16", "16x16"]);
assert.equal(report.benchmarks.length, 4);
const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];
for (const [index, bench] of report.benchmarks.entries()) {
  assert.equal(bench.shape, report.shapes[index]); assert.equal(bench.pairs.length, 7);
  assert.ok(bench.iterations >= 100000 && bench.iterations <= 2000000);
  for (const [round, pair] of bench.pairs.entries()) {
    assert.deepEqual(pair.order, round & 1 ? ["simd", "scalar"] : ["scalar", "simd"]);
    assert.equal(pair.simd.checksum, pair.scalar.checksum);
    for (const entry of [pair.simd, pair.scalar]) {
      assert.equal(entry.iterations, bench.iterations);
      assert.ok(Number.isFinite(entry.elapsedMs) && entry.elapsedMs > 0);
    }
  }
  assert.equal(bench.scalarMedianMs, median(bench.pairs.map((p) => p.scalar.elapsedMs)));
  assert.equal(bench.simdMedianMs, median(bench.pairs.map((p) => p.simd.elapsedMs)));
  assert.equal(bench.scalarOverSimdRatio, bench.scalarMedianMs / bench.simdMedianMs);
}
for (const [source, expected] of Object.entries(report.sourceHashes)) {
  const { stdout } = await exec("git", ["show", `${run.headSha}:${source}`], { cwd: root, windowsHide: true, encoding: "buffer", maxBuffer: 1024 ** 2 });
  assert.equal(sha(stdout), expected, `Actual executed Git bytes ${source}`);
}
const log = await runGh(["run", "view", runId, "--log"]);
const artifacts = JSON.parse(await api([`repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`]));
assert.equal(artifacts.total_count, 1);
const artifact = artifacts.artifacts[0];
assert.equal(artifact.name, `private-sad-arithmetic-${runId}`);
const currentSources = {};
for (const source of [...Object.keys(report.sourceHashes), "scripts/record-sad-arithmetic.mjs"]) currentSources[source] = sha(await readFile(path.join(root, source)));
const output = path.join(root, "evidence/openh264-sad-arithmetic-2026-10-04.json");
// Do not delete anything if a compact record already exists.
try { await stat(output); throw new Error("SAD evidence already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
await api(["--method", "DELETE", `repos/tanishqbaweja/fileconverter/actions/artifacts/${artifact.id}`]);
const remaining = JSON.parse(await api([`repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`]));
assert.equal(remaining.total_count, 0);
await writeFile(output, `${JSON.stringify({ recordedAt: new Date().toISOString(), requirement: "M-04",
  status: "compiled-private-sad-equivalence-and-primitive-cost-not-integrated",
  publicAcceptance: false, browserConversions: 0, speedGainClaim: null,
  run, report, reportSha256: sha(raw), logSha256: sha(log),
  artifact: { id: artifact.id, bytes: artifact.size_in_bytes, remaining: 0 }, currentSources,
  cleanup: { hostedSdkBuildScratchRemoved: true, hostedArtifactsRemaining: 0,
    localCompilerOrConvertedMediaGenerated: false, downloadedReportCompactedThenRemoved: true },
  remaining: ["Private opt-in production conversion build only if primitive result justifies it",
    "Identical-input/settings production Chromium speed A/B, output validation and whole-tree <=250 MiB",
    "All existing H264 control, cold/startup-overlap, direct/recovery, larger-file, licensing and release gates"],
}, null, 2)}\n`, { flag: "wx" });
await unlink(file); await rmdir(directory);
process.stdout.write(`${output}\n529564 compiled exact-result cases passed; primitive ratios only:\n`);
for (const bench of report.benchmarks) process.stdout.write(`${bench.shape}: ${bench.scalarOverSimdRatio.toFixed(3)}x scalar/SIMD warm primitive ratio\n`);
