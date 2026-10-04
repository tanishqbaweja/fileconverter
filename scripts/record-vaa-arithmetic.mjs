import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, stat, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const root = path.resolve(import.meta.dirname, "..");
const exec = promisify(execFile);
const gh = "D:\\Program Files\\GitHub CLI\\gh.exe";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const specs = [
  { id: "37189089815", commit: "43d5b4479592b01a85a87e86448cac7c4e7fbe90", conclusion: "failure", directory: "vaa-arithmetic-first-37189089815" },
  { id: "37189265531", commit: "be2c875a4a3e581d0afbb1040f8acd99bcdb048f", conclusion: "success", directory: "vaa-arithmetic-pass-37189265531" },
];
const runGh = async (args) => (await exec(gh, [...args, "--repo", "tanishqbaweja/fileconverter"], { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 ** 2 })).stdout;
const api = async (args) => (await exec(gh, ["api", ...args], { cwd: root, windowsHide: true, maxBuffer: 1024 ** 2 })).stdout;
const attempts = [];
for (const spec of specs) {
  const file = path.join(root, "outputs/reports", spec.directory, "vaa-arithmetic.json");
  assert.ok((await stat(file)).size <= 32768);
  const raw = await readFile(file), report = JSON.parse(raw);
  const run = JSON.parse(await runGh(["run", "view", spec.id, "--json", "status,conclusion,headSha,jobs,url"]));
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, spec.conclusion);
  assert.equal(run.headSha, spec.commit);
  assert.equal(run.jobs[0].steps.find((step) => step.name === "Remove repository-local build data").conclusion, "success");
  assert.equal(report.publicAcceptance, false); assert.equal(report.browserConversions, 0);
  assert.equal(report.conversionBuildsChanged, false); assert.equal(report.speedGainClaim, null);
  assert.equal(report.upstream.sha256, "69a57a09170a613b472a28f339bf54e72a82c2d46bc0c69e62d0abb676353b3a");
  for (const [source, expected] of Object.entries(report.sourceHashes)) {
    const { stdout } = await exec("git", ["show", `${spec.commit}:${source}`], { cwd: root, windowsHide: true, encoding: "buffer", maxBuffer: 1024 ** 2 });
    assert.equal(sha(stdout), expected, `Actual executed Git bytes ${source}`);
  }
  if (spec.conclusion === "failure") {
    assert.equal(report.totalCases, 0);
    assert.match(report.error, /HEAPU8.*not exported/);
  } else {
    assert.equal(report.status, "passed-private-arithmetic-proof-only");
    assert.equal(report.totalCases, 132101);
    assert.deepEqual(report.cases, {
      exhaustiveUniformBytePairs: 65536, exhaustiveMixedSignBytePairs: 65536,
      singlePixelQuadrantAndLane: 512, seededRandomStrideAlignmentAndDimensions: 512,
      maximumDimensionsAndFrameOverflow: 4, sourceEndsAtWasmMemoryBoundary: 1,
    });
  }
  const log = await runGh(["run", "view", spec.id, "--log"]);
  const artifacts = JSON.parse(await api([`repos/tanishqbaweja/fileconverter/actions/runs/${spec.id}/artifacts`]));
  assert.equal(artifacts.total_count, 1);
  assert.equal(artifacts.artifacts[0].name, `private-vaa-arithmetic-${spec.id}`);
  attempts.push({ run, report, reportSha256: sha(raw), logSha256: sha(log),
    artifactId: artifacts.artifacts[0].id, artifactBytes: artifacts.artifacts[0].size_in_bytes,
    localReport: path.relative(root, file).replaceAll("\\", "/") });
}
// Delete only the two identified compact temporary artifacts after complete
// local reports and their executed Git provenance have been independently read.
for (const attempt of attempts) {
  await api(["--method", "DELETE", `repos/tanishqbaweja/fileconverter/actions/artifacts/${attempt.artifactId}`]);
  const remaining = JSON.parse(await api([`repos/tanishqbaweja/fileconverter/actions/runs/${attempt.run.url.split("/").at(-1)}/artifacts`]));
  assert.equal(remaining.total_count, 0);
  attempt.remainingHostedArtifacts = 0;
}
const currentSources = {};
for (const source of [...Object.keys(attempts[1].report.sourceHashes), "scripts/record-vaa-arithmetic.mjs"]) currentSources[source] = sha(await readFile(path.join(root, source)));
const output = path.join(root, "evidence/openh264-vaa-arithmetic-2026-10-04.json");
await writeFile(output, `${JSON.stringify({
  recordedAt: new Date().toISOString(), requirement: "M-04",
  status: "compiled-private-simd-arithmetic-equivalence-passed-not-integrated",
  publicAcceptance: false, speedGainClaim: null, browserConversions: 0,
  attempts, currentSources,
  cleanup: { hostedArtifactsRemaining: 0, hostedBuildSdkAndScratchRemovalPassed: true,
    localCompilerOrMediaFilesGenerated: false, downloadedReportsCompactedThenRemoved: true },
  remaining: ["Wire opt-in private conversion build", "Production browser identical-settings speed A/B",
    "Exact file fidelity and unchanged <=250 MiB complete-process memory", "All existing H264 release and full original-goal gates"],
}, null, 2)}\n`, { flag: "wx" });
for (const attempt of attempts) {
  const file = path.join(root, attempt.localReport);
  await unlink(file);
  await rmdir(path.dirname(file));
}
process.stdout.write(`${output}\n132101 actual compiled arithmetic cases passed; no file-conversion speed or release acceptance\n`);
