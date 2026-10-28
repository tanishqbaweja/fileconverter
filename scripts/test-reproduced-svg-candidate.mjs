// Run the existing full small SVG suite against the new reproduced private bytes.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { makeReproducedSvgBrowserQualification, reproducedSvgBasePins } from "./lib/reproduced-svg-browser-recipe.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
assert.equal(process.platform, "win32");
const lifecycleDiagnostic = process.argv[2] === "--lifecycle-diagnostic";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && lifecycleDiagnostic));
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", failures: [],
  scope: "Same existing ten SVG correctness/recovery/security cases with exact reproduced candidate; not stress/OOM/release acceptance",
  publicEngineReplacement: false, originalGoalComplete: false, generatedSourceArchives: {}, sourcePins: {},
  lifecycleDiagnostic, diagnosticAcceptanceMetric: false };
let runtime, child, birth, log = "";
try {
  for (const file of ["scripts/test-reproduced-svg-candidate.mjs", "scripts/lib/reproduced-svg-browser-recipe.mjs",
    "images/resvg-source/repeated-processed-input.json", ...Object.keys(reproducedSvgBasePins)])
    report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  runtime = await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  const generated = makeReproducedSvgBrowserQualification({ root, runtime: runtime.directory,
    driverBytes: await readFile(path.join(root, "scripts/test-source-built-svg-candidate.mjs")),
    suiteBytes: await readFile(path.join(root, "tests/browser/image-conversions.spec.ts")), lifecycleDiagnostic });
  report.generation = generated.proof;
  for (const [name, file, source] of [["driver", generated.driverPath, generated.driver], ["suite", generated.suitePath, generated.suite], ["config", generated.configPath, generated.config]]) {
    report.generatedSourceArchives[name] = { path: path.relative(root, file), bytes: Buffer.byteLength(source), sha256: sha(source), gzipBase64: gzipSync(source, { level: 9 }).toString("base64") };
    await writeFile(file, source, { flag: "wx" });
  }
  child = spawn(process.execPath, [generated.driverPath], { cwd: root, env: { ...runtime.env, WITHIN_TEST_VIDEO: "off" },
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const pipe of [child.stdout, child.stderr]) pipe.on("data", bytes => { log = (log + bytes).slice(-65536); });
  const completed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => { report.childSignal = signal; resolve(code); }); });
  birth = await queryReliableProcessIdentity(child.pid); assert.ok(birth); report.childBirth = birth;
  report.childExitCode = await completed;
  const summaries = log.split(/\r?\n/).filter(line => line.startsWith('{"path":')); assert.equal(summaries.length, 1, log);
  const summary = JSON.parse(summaries[0]); assert.match(summary.path.replaceAll("\\", "/"), /^evidence\/\d{4}-\d{2}-\d{2}T[\w-]+-source-svg-browser\.json$/);
  const raw = await readFile(path.join(root, summary.path)); assert.ok(raw.length <= 4 * 1024 ** 2);
  const actual = JSON.parse(raw), pins = JSON.parse(await readFile(path.join(root, "images/resvg-source/repeated-processed-input.json")));
  report.browserReceipt = { path: summary.path.replaceAll("\\", "/"), bytes: raw.length, sha256: sha(raw) };
  report.browserStatus = actual.status; report.stats = actual.stats ?? null; report.incrementalPrivateMiB = actual.memory?.incrementalPrivateMiB ?? null;
  report.innerFailures = actual.failures; report.ownedBrowserRuntimeRemoved = actual.ownedRuntimeRemoved;
  report.lifecycleObservations = actual.lifecycleDiagnostic ?? null;
  assert.equal(actual.candidatePin.wasmSha256, pins.wasmSha256);
  assert.equal(actual.generatedQualification.driverSha256, report.generation.driverSha256);
  assert.equal(actual.generatedQualification.suiteSha256, report.generation.suiteSha256);
  assert.deepEqual(actual.generatedQualification.baseSourcePins, reproducedSvgBasePins);
  assert.equal(report.childSignal, null); assert.equal(report.childExitCode, 0, log);
  assert.equal(actual.status, lifecycleDiagnostic ? "completed-reproduced-svg-lifecycle-diagnostic-not-memory-acceptance" : "passed-ten-private-small-svg-browser-cases-not-public-stress-acceptance");
  assert.deepEqual([actual.stats.expected, actual.stats.unexpected, actual.stats.skipped, actual.stats.flaky], [10, 0, 0, 0]);
  assert.equal(actual.ownedRuntimeRemoved, true); assert.ok(actual.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(actual.domSnapshotRecording, true); assert.equal(actual.networkHarRecording, true);
  assert.equal(actual.browserServicesDisabledByDriver, false); assert.equal(actual.baselineAdjusted, false);
  assert.ok(actual.memory.incrementalPrivateMiB <= 250); assert.deepEqual(actual.protectedOriginalAfter, actual.protectedOriginalBefore);
  report.status = lifecycleDiagnostic ? "completed-reproduced-svg-lifecycle-diagnostic-not-release-acceptance" : "passed-reproduced-private-svg-ten-case-browser-qualification-not-stress-or-release";
} catch (error) { report.status = "failed-reproduced-private-svg-browser-qualification"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    assert.ok(!child || child.pid === undefined || (child.exitCode !== null && child.signalCode === null), "Do not remove a live or interrupted generated driver's runtime");
    if (birth) { report.processCleanup = await observeOwnedProcessExit(birth); assert.equal(report.processCleanup.status, "owned-identity-absent"); }
    await runtime?.close(); report.ownedGenerationRuntimeRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  } catch (error) { report.failures.push("Owned generation cleanup/source verification: " + error); report.status = "failed-reproduced-private-svg-browser-qualification"; process.exitCode = 1; }
  report.logTail = log.slice(-16384); report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", stamp + "-reproduced-svg-browser.json");
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ wrapperReport: path.relative(root, file), status: report.status, stats: report.stats ?? null,
    incrementalPrivateMiB: report.incrementalPrivateMiB ?? null, ownedGenerationRuntimeRemoved: report.ownedGenerationRuntimeRemoved, failures: report.failures }));
}
