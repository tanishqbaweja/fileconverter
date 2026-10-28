import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, readFile, statfs, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { makeReproducedSvgStressQualification } from "./lib/reproduced-svg-stress-recipe.mjs";
import { makeReproducedSvgDirectStressQualification } from "./lib/reproduced-svg-direct-stress-recipe.mjs";
import { reproducedSvgBasePins } from "./lib/reproduced-svg-browser-recipe.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";

assert.equal(process.platform, "win32");
const args = process.argv.slice(2), listOnly = args.includes("--list-only"), directHandle = args.includes("--direct-handle");
assert.equal(new Set(args).size, args.length); assert.ok(args.length <= 2 && args.every(arg => ["--list-only", "--direct-handle"].includes(arg)));
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", sourcePins: {}, generatedSourceArchives: {}, failures: [],
  listOnly, publicEngineReplacement: false, originalGoalComplete: false,
  destinationMode: directHandle ? "direct-handle-test-directory; native OS picker unverified" : "Existing bounded production OPFS test adapter; direct-handle stress is a separate pending gate",
  scope: directHandle ? "Three same-browser 8M direct-handle grid repeats; no native OS picker/effects/OOM/recovery/full release acceptance" : "Three same-browser 8M grid repeats only; no direct-handle/effects/clean-session/OOM/recovery/full release acceptance" };
let runtime, child, birth, log = "";
try {
  for (const file of ["scripts/test-reproduced-svg-stress.mjs", "scripts/lib/reproduced-svg-stress-recipe.mjs", "scripts/lib/reproduced-svg-direct-stress-recipe.mjs", "scripts/lib/reproduced-svg-browser-recipe.mjs",
    "scripts/lib/exact-rgba-validation.mjs",
    "workers/conversion.worker.ts", "app/converter/ConverterApp.tsx", "lib/conversion-protocol.ts", "lib/svg-memory-observation.ts",
    "lib/vendor/resvg-binding.mjs", "lib/vendor/resvg-binding.d.mts", "images/resvg-source/observed-binding-contract.mjs",
    "scripts/generate-svg-stress-fixture.py", "fixtures/stress/images/svg-grid-8m.svg.json", "images/resvg-source/repeated-processed-input.json",
    "lib/staged-worker-coordinator.ts", ...Object.keys(reproducedSvgBasePins)]) report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  if (!listOnly) {
    report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
    const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3);
  }
  runtime = await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  const recipe = directHandle ? makeReproducedSvgDirectStressQualification : makeReproducedSvgStressQualification;
  const generated = recipe({ root, runtime: runtime.directory,
    driverBytes: await readFile(path.join(root, "scripts/test-source-built-svg-candidate.mjs")),
    suiteBytes: await readFile(path.join(root, "tests/browser/image-conversions.spec.ts")),
    generatorBytes: await readFile(path.join(root, "scripts/generate-svg-stress-fixture.py")) });
  report.generation = generated.proof;
  for (const [name, file, source] of [["driver", generated.driverPath, generated.driver], ["suite", generated.suitePath, generated.suite],
    ["config", generated.configPath, generated.config], ["generator", generated.generatorPath, generated.generator]]) {
    report.generatedSourceArchives[name] = { bytes: Buffer.byteLength(source), sha256: sha(source), gzipBase64: gzipSync(source, { level: 9 }).toString("base64") };
    await writeFile(file, source, { flag: "wx" });
  }
  if (!listOnly) {
    const python = "C:/Users/slato/AppData/Local/Programs/Python/Python311/python.exe";
    const fixtureEnv = { ...runtime.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONPYCACHEPREFIX: path.join(runtime.directory, "pycache") };
    const version = spawnSync(python, ["-c", "import sys,PIL; print(sys.version.split()[0]); print(PIL.__version__)"],
      { cwd: root, env: fixtureEnv, windowsHide: true, timeout: 10000, encoding: "utf8", maxBuffer: 4096 });
    assert.ifError(version.error); assert.equal(version.status, 0, version.stderr); assert.equal(version.stdout.trim().replaceAll("\r", ""), "3.11.9\n11.3.0");
    const fixture = spawnSync(python, [generated.generatorPath], { cwd: root, env: fixtureEnv, windowsHide: true, timeout: 30000, encoding: "utf8", maxBuffer: 8192 });
    assert.ifError(fixture.error); assert.equal(fixture.status, 0, fixture.stderr);
    const metadata = JSON.parse(fixture.stdout), expected = JSON.parse(await readFile(path.join(root, "fixtures/stress/images/svg-grid-8m.svg.json")));
    for (const key of ["bytes", "sha256", "width", "height", "elements", "validationBytes", "validationSha256"]) assert.equal(metadata[key], expected[key], key);
    for (const [file, bytes, digest] of [["svg-grid-8m.svg", expected.bytes, expected.sha256], ["svg-grid-8m-reference.png", expected.validationBytes, expected.validationSha256]]) {
      const raw = await readFile(path.join(generated.fixtureRoot, file)); assert.equal(raw.length, bytes); assert.equal(sha(raw), digest);
    }
    report.fixture = { pythonVersion: "3.11.9", pillowVersion: "11.3.0", metadata, sameHistoricalSourceAndReferenceBytes: true };
  }
  const childArgs = listOnly ? ["node_modules/@playwright/test/cli.js", "test", "image-conversions.spec.ts", "--config=" + generated.configPath, "--grep", "8m-grid-repeat-[123]", "--list"] : [generated.driverPath];
  child = spawn(process.execPath, childArgs, { cwd: root, env: { ...runtime.env, WITHIN_TEST_VIDEO: "off" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const pipe of [child.stdout, child.stderr]) pipe.on("data", bytes => { log = (log + bytes).slice(-65536); });
  const completed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => { report.childSignal = signal; resolve(code); }); });
  birth = await queryReliableProcessIdentity(child.pid); assert.ok(birth); report.childBirth = birth; report.childExitCode = await completed;
  if (listOnly) {
    assert.equal(report.childExitCode, 0, log); assert.equal(report.childSignal, null); assert.match(log, /Total: 3 tests in 1 file/);
    report.status = "listed-exactly-three-stress-cases-no-browser-or-conversion";
  } else {
    const summaries = log.split(/\r?\n/).filter(line => line.startsWith('{"path":')); assert.equal(summaries.length, 1, log);
    const summary = JSON.parse(summaries[0]); assert.match(summary.path.replaceAll("\\", "/"), /^evidence\/[\w-]+-source-svg-browser\.json$/);
    const raw = await readFile(path.join(root, summary.path)); assert.ok(raw.length <= 4 * 1024 ** 2); const actual = JSON.parse(raw);
    report.browserReceipt = { path: summary.path.replaceAll("\\", "/"), bytes: raw.length, sha256: sha(raw) };
    report.stats = actual.stats ?? null; report.memory = actual.memory ?? null; report.stressRuns = actual.stressRuns ?? null; report.innerFailures = actual.failures;
    report.ownedBrowserRuntimeRemoved = actual.ownedRuntimeRemoved;
    assert.equal(actual.generatedQualification.driverSha256, generated.proof.driverSha256); assert.equal(actual.generatedQualification.suiteSha256, generated.proof.suiteSha256);
    const pins = JSON.parse(await readFile(path.join(root, "images/resvg-source/repeated-processed-input.json"))); assert.equal(actual.candidatePin.wasmSha256, pins.wasmSha256);
    assert.equal(report.childSignal, null); assert.equal(report.childExitCode, 0, log);
    assert.equal(actual.status, directHandle ? "passed-three-private-svg-grid-8m-direct-repeats-not-full-stress-or-release-acceptance" : "passed-three-private-svg-grid-8m-repeats-not-full-stress-or-release-acceptance");
    assert.deepEqual([actual.stats.expected, actual.stats.unexpected, actual.stats.skipped, actual.stats.flaky], [3,0,0,0]);
    assert.equal(actual.stressRuns.length, 3); assert.ok(actual.stressRuns.every(row => row.result?.independentlyValidatedRgbaPixels));
    for (const run of actual.stressRuns) {
      if (directHandle) assert.equal(run.result.destinationMode, "direct-handle-test-directory");
      const observation = run.result.metrics.svgMemoryObservation;
      assert.equal(observation.phase, "released"); assert.equal(observation.available, true); assert.equal(observation.unavailableObservations, 0);
      assert.equal(observation.observations, 6); assert.equal(observation.maximumBytes, null);
      assert.equal(Object.keys(observation.phaseBytes).length, 6); assert.ok(observation.phaseBytes.initialized > 0);
      assert.equal(observation.phaseBytes.released, observation.currentBytes);
      assert.equal(observation.currentPages * 65536, observation.currentBytes); assert.equal(observation.maximumPages, null);
      assert.ok(observation.currentBytes > 0 && observation.peakBytes >= observation.currentBytes && observation.peakBytes <= pins.experimentalMaximumBytes);
      assert.equal(run.result.metrics.peakWasmMemoryBytes, observation.peakBytes); assert.equal(run.result.metrics.wasmMemories.resvg, observation.currentBytes);
    }
    assert.equal(actual.ownedRuntimeRemoved, true); assert.ok(actual.processCleanup.every(row => row.status === "owned-identity-absent"));
    assert.equal(actual.domSnapshotRecording, true); assert.equal(actual.networkHarRecording, true); assert.equal(actual.baselineAdjusted, false); assert.equal(actual.browserServicesDisabledByDriver, false);
    assert.ok(actual.memory.incrementalPrivateMiB <= 250); assert.deepEqual(actual.protectedOriginalBefore, actual.protectedOriginalAfter);
    report.status = directHandle ? "passed-three-same-browser-svg-grid-8m-direct-repeats-not-full-svg-or-release-acceptance" : "passed-three-same-browser-svg-grid-8m-repeats-not-full-svg-or-release-acceptance";
  }
} catch (error) { report.status = "failed-reproduced-svg-grid-stress"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    assert.ok(!child || child.pid === undefined || (child.exitCode !== null && child.signalCode === null), "Do not dispose a live/interrupted stress owner runtime");
    if (birth) { report.processCleanup = await observeOwnedProcessExit(birth); assert.equal(report.processCleanup.status, "owned-identity-absent"); }
    await runtime?.close(); report.ownedGenerationAndFixtureRuntimeRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  } catch (error) { report.failures.push("Owned stress cleanup/source verification: " + error); report.status = "failed-reproduced-svg-grid-stress"; process.exitCode = 1; }
  report.logTail = log.slice(-16384); report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", stamp + "-reproduced-svg-grid-stress.json"); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, stats: report.stats ?? null,
    incrementalPrivateMiB: report.memory?.incrementalPrivateMiB ?? null, cleanup: report.ownedGenerationAndFixtureRuntimeRemoved, failures: report.failures }));
}
