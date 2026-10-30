// Authenticate the completed publication-gate CI artifact; never runs a converter.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { unzipSync } from "fflate";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
assert.equal(process.argv.length, 2);
const runId = 41013161607, headSha = "8b93711a90984ff30064e12acb7c19fac7c493fb", root = path.resolve(import.meta.dirname, "..");
const execute = promisify(execFile), runtime = await createOwnedRuntimeScratch("svg-publication-ci-");
const report = { schemaVersion: 1, runId, headSha, url: `https://github.com/tanishqbaweja/fileconverter/actions/runs/${runId}`,
  scope: "Fresh hosted production/public-evidence/portable/privacy/publication gates, not native/stress/whole-goal acceptance",
  failures: [], nativeReproductionSelected: false, conversionMatrixSelected: false, wholeGoalComplete: false };
try {
  const gh = async (args, maximum = 262144) => (await execute(process.env.WITHIN_GH_EXECUTABLE ?? "gh", args,
    { cwd: root, env: { ...runtime.env, GH_PROMPT_DISABLED: "true" }, windowsHide: true, timeout: 60000, maxBuffer: maximum, encoding: "buffer" })).stdout;
  const hosted = JSON.parse(await gh(["api", `repos/tanishqbaweja/fileconverter/actions/runs/${runId}`]));
  assert.equal(hosted.id, runId); assert.equal(hosted.head_sha, headSha); assert.equal(hosted.status, "completed"); assert.equal(hosted.conclusion, "success");
  report.hostedStatus = hosted.status; report.hostedConclusion = hosted.conclusion;
  const jobs = JSON.parse(await gh(["api", `repos/tanishqbaweja/fileconverter/actions/runs/${runId}/jobs?per_page=100`]));
  const verify = jobs.jobs.find(row => row.name === "verify"); assert.ok(verify); assert.equal(verify.conclusion, "success");
  report.verify = { id: verify.id, startedAt: verify.started_at, completedAt: verify.completed_at,
    steps: verify.steps.map(row => ({ name: row.name, conclusion: row.conclusion })) };
  for (const name of ["Audit public route evidence", "Run npm run lint", "Run npx tsc --noEmit --incremental false", "Run npm test",
    "Run network privacy and offline browser tests", "Remove owned CI runtime", "Post Run actions/setup-node@v4", "Post Run actions/checkout@v4"])
    assert.equal(verify.steps.find(row => row.name === name)?.conclusion, "success", name);
  report.unselectedJobs = jobs.jobs.filter(row => row !== verify).map(row => ({ name: row.name, conclusion: row.conclusion }));
  assert.ok(report.unselectedJobs.every(row => row.conclusion === "skipped"));
  const log = await gh(["run", "view", String(runId), "--repo", "tanishqbaweja/fileconverter", "--job", String(verify.id), "--log"], 16777216);
  report.log = { bytes: log.length, sha256: sha(log) };
  const summaryLine = log.toString().split(/\r?\n/).find(line => line.includes('{"summary":'));
  assert.ok(summaryLine); const unit = JSON.parse(summaryLine.slice(summaryLine.indexOf('{"summary":')));
  assert.equal(unit.summary.success, true); assert.equal(unit.summary.counts.failed, 0); assert.equal(unit.qualificationNotRun, true);
  report.portableUnits = unit.summary; report.qualificationNotRun = true;
  const artifacts = JSON.parse(await gh(["api", `repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`]));
  const matches = artifacts.artifacts.filter(row => row.name === "verification-results"); assert.equal(matches.length, 1);
  const artifact = matches[0]; assert.equal(artifact.expired, false); assert.equal(artifact.workflow_run.head_sha, headSha); assert.equal(artifact.workflow_run.id, runId);
  const zip = await gh(["api", `repos/tanishqbaweja/fileconverter/actions/artifacts/${artifact.id}/zip`], 4194304);
  assert.equal(artifact.digest, "sha256:" + sha(zip));
  const seen = new Set(), members = unzipSync(zip, { filter: entry => {
    assert.equal(entry.name, "verify-results.json"); assert.equal(seen.has(entry.name), false); seen.add(entry.name);
    assert.ok(entry.originalSize > 0 && entry.originalSize <= 2097152); return true;
  } });
  assert.deepEqual(Object.keys(members), ["verify-results.json"]);
  const bytes = Buffer.from(members["verify-results.json"]), result = JSON.parse(bytes);
  assert.deepEqual([result.stats.expected, result.stats.unexpected, result.stats.skipped, result.stats.flaky], [21, 0, 0, 0]);
  const cases = []; const collect = suites => { for (const suite of suites) { for (const spec of suite.specs ?? []) cases.push({ title: spec.title, ok: spec.ok }); collect(suite.suites ?? []); } };
  collect(result.suites); assert.equal(cases.length, 21); assert.ok(cases.every(row => row.ok));
  assert.ok(cases.some(row => row.title.startsWith("public SVG input"))); assert.ok(cases.some(row => row.title.startsWith("explicit localhost qualification")));
  report.artifact = { id: artifact.id, bytes: zip.length, sha256: sha(zip), expiresAt: artifact.expires_at };
  report.browser = { stats: result.stats, cases, resultBytes: bytes.length, resultSha256: sha(bytes),
    resultArchiveEncoding: "gzip-base64", resultArchive: gzipSync(bytes, { level: 9 }).toString("base64") };
  report.status = "verified-hosted-publication-gate-build-portable-and21-browser-checks-not-svg-conversion-acceptance";
} catch (error) { report.status = "failed-hosted-publication-verification"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  await runtime.close(); report.ownedInspectionRuntimeRemoved = true;
  const output = "evidence/2026-10-30-svg-publication-ci-terminal.json";
  await writeFile(path.join(root, output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, status: report.status, portableUnits: report.portableUnits?.counts, browserStats: report.browser?.stats, failures: report.failures }));
}
