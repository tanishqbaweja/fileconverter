// Matched diagnostic pair, NOT full conversion/stress/speed acceptance.
import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { access, lstat, readFile, readdir, realpath, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeStableUiProgressProbe } from "./lib/stable-ui-progress-probe-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), reports = path.join(root, "outputs", "reports");
const read = file => readFile(path.join(root, file)), exec = promisify(execFile);
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const prepareOnly = process.argv[2] === "--prepare-only", stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const oldArchivePath = "outputs/reports/2026-10-08T12-49-20-004Z-js-progress-executed-sources.json.gz";
const oldCompressed = await read(oldArchivePath); assert.equal(sha(oldCompressed), "4a6efcecb5b1509e44a29452460461bc06c0b8551dafaf52741d5fd5708325fe");
const executed = JSON.parse(gunzipSync(oldCompressed, { maxOutputLength: 1048576 }));
assert.equal(sha(executed.traceHelper), "606ca17a465e8b1f05f7abf5e4e10fd60e1774d17d4128786d6fc06ff7135604");
const prior = JSON.parse(await read("evidence/mpeg2-js-progress-terminal-2026-10-08.json"));
const matched = JSON.parse(await read("evidence/2026-10-08T21-50-57-923Z-stable-ui-headless-baseline-validation.json"));
assert.equal(matched.geometryMaximumDeltaCssPixels, 0); assert.equal(matched.goldenConversions, 3);
const candidateProof = JSON.parse(await read("evidence/2026-10-08T13-49-53-644Z-stable-progress-ui-build.json"));
const candidateBinding = candidateProof.assets[0]; assert.equal(candidateBinding.sha256, "d884d80703f4157695736f4fd632f8c1bab06f8a815cff8bb4ea9b6b23514143");
const sourcePins = { ...prior.sourcePins };
for (const file of ["scripts/diagnose-stable-ui-real-progress.mjs", "scripts/lib/stable-ui-progress-probe-recipe.mjs", "tests/stable-ui-progress-probe.test.mjs",
  "scripts/build-stable-progress-ui-candidate.mjs", "scripts/lib/stable-progress-ui-recipe.mjs", "scripts/lib/conversion-js-allocation-duration-bound.mjs",
  "tests/conversion-js-allocation-duration.test.mjs", "evidence/2026-10-08T21-50-57-923Z-stable-ui-headless-baseline-validation.json"])
  sourcePins[file] = sha(await read(file));
for (const [file, digest] of Object.entries(sourcePins)) assert.equal(sha(await read(file)), digest, file);
const check = code => { const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: code, encoding: "utf8", windowsHide: true }); assert.equal(result.status, 0, result.stderr); };
const makeTraceHelper = traceArchive => {
  const before = 'const rawArchivePath="H:\\\\Github Repositories\\\\fileconverter\\\\outputs\\\\reports\\\\2026-10-08T12-49-20-004Z-js-progress-partial-blink-trace.json.gz";';
  assert.equal(executed.traceHelper.split(before).length, 2);
  const helper = executed.traceHelper.replace(before, `const rawArchivePath=${JSON.stringify(traceArchive)};`);
  assert.equal(helper.replace(`const rawArchivePath=${JSON.stringify(traceArchive)};`, before), executed.traceHelper);
  check(helper); return helper;
};
const verifyBinding = async binding => { const bytes = await read("dist/client" + binding.url); assert.equal(bytes.length, binding.bytes); assert.equal(sha(bytes), binding.sha256); };
let failure = null, host, diskBytes, productionRestored = false;
const executions = [], templates = {};
if (prepareOnly) {
  makeTraceHelper(path.join(reports, `${stamp}-prepared-not-executed-trace.json.gz`));
  for (const [mode, binding] of [["baseline", baselineBinding], ["candidate", candidateBinding]]) {
    const source = makeStableUiProgressProbe(executed.generated, root, "file:///owned/trace-helper.mjs", binding, mode); check(source);
    templates[mode] = { bytes: Buffer.byteLength(source), sha256: sha(source) };
  }
} else {
  try {
    host = await inspectStressHostMemory(); console.log(JSON.stringify({ host })); assert.equal(host.safeToStart, true);
    const disk = await statfs(root); diskBytes = disk.bavail * disk.bsize; assert.ok(diskBytes >= 32 * 1024 ** 3);
    await verifyBinding(baselineBinding);
    for (const [mode, binding] of [["baseline", baselineBinding], ["candidate", candidateBinding]]) {
      const fresh = await inspectStressHostMemory(); console.log(JSON.stringify({ mode, host: fresh })); assert.equal(fresh.safeToStart, true);
      const runtime = await createOwnedRuntimeScratch(`stable-ui-progress-${mode}-`);
      try {
        if (mode === "candidate") {
          const built = await exec(process.execPath, ["scripts/build-stable-progress-ui-candidate.mjs", stamp], { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 ** 2 });
          console.log(built.stdout.slice(-1200)); await verifyBinding(binding);
        }
        const traceArchive = path.join(reports, `${stamp}-ui-progress-${mode}-partial-blink.json.gz`);
        const traceHelper = makeTraceHelper(traceArchive);
        const traceFile = path.join(runtime.directory, "trace-helper.mjs"), driverFile = path.join(runtime.directory, "probe.mjs");
        const generated = makeStableUiProgressProbe(executed.generated, root, pathToFileURL(traceFile).href, binding, mode); check(generated);
        const sourceArchive = gzipSync(Buffer.from(JSON.stringify({ generated, traceHelper })), { level: 9 }); assert.ok(sourceArchive.length <= 65536);
        const sourceRecord = { path: `outputs/reports/${stamp}-ui-progress-${mode}-executed-sources.json.gz`, bytes: sourceArchive.length, sha256: sha(sourceArchive), driverSha256: sha(generated), traceHelperSha256: sha(traceHelper) };
        await writeFile(path.join(root, sourceRecord.path), sourceArchive, { flag: "wx" });
        await writeFile(traceFile, traceHelper, { flag: "wx" }); await writeFile(driverFile, generated, { flag: "wx" });
        const existing = new Set(await readdir(reports));
        const child = spawn(process.execPath, [driverFile], { cwd: root, env: { ...runtime.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: "mpeg2-split-pipeline-37739125738" }, windowsHide: true, stdio: "inherit" });
        const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (exitCode, signal) => signal ? reject(new Error(`Diagnostic child signalled ${signal}`)) : resolve(exitCode)); });
        const names = (await readdir(reports)).filter(name => !existing.has(name) && name.endsWith(`-private-mpeg2-ui-progress-${mode}-native-100ms.json`));
        assert.equal(names.length, 1, "Exactly one actual child report, never reconstruct a missing run");
        const file = path.join(reports, names[0]), identity = await lstat(file, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink()); assert.equal(await realpath(file), file);
        const raw = await readFile(file); assert.ok(raw.length <= 32 * 1024 ** 2); const report = JSON.parse(raw);
        const compressed = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(compressed), raw);
        const compressedPath = `outputs/reports/${stamp}-ui-progress-${mode}-raw.json.gz`;
        await writeFile(path.join(root, compressedPath), compressed, { flag: "wx" }); assert.equal(sha(gunzipSync(await read(compressedPath))), sha(raw));
        const current = await lstat(file, { bigint: true }); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino); assert.equal(sha(await readFile(file)), sha(raw)); await unlink(file);
        const run = { mode, actualExitCode: code, rawStatus: report.status, failure: report.failure, sourceArchive: sourceRecord,
          rawReport: { path: path.relative(root, file).replaceAll("\\", "/"), bytes: raw.length, sha256: sha(raw) },
          compressedReport: { path: compressedPath, bytes: compressed.length, sha256: sha(compressed) }, rawRemovedAfterLosslessArchive: true,
          progressProbe: report.progressProbe ?? null, conversionJsReport: report.conversionJsReport ?? null,
          browserVersion: report.browserVersion, blankBaseline: report.blankBaseline,
          runs: report.runs, cleanup: report.cleanup, runtimeDirectory: report.runtimeDirectory, forbiddenRequests: report.forbiddenRequests };
        executions.push(run); console.log(JSON.stringify({ mode, actualExitCode: code, checkpoint: run.progressProbe?.checkpointReached, failure: run.failure?.message }));
        assert.equal(code, 1, "Normal checkpoint cancellation must NOT pass the full-conversion gate");
        assert.equal(report.status, "failed"); assert.equal(report.failure?.name, "AssertionError");
        assert.match(report.failure?.message ?? "", /cancelled[\s\S]*complete/);
        assert.equal(report.progressProbe?.checkpointReached, true); assert.equal(report.progressProbe?.afterCancellation?.jobState, "cancelled");
        assert.equal(report.progressProbe?.profilerClosed, true); assert.equal(report.progressProbe?.cancellation?.cancellationRequested, true);
        assert.equal(report.progressProbe?.beforeCancellation?.metrics?.wasmMemoryBytes, 50331648);
        assert.ok(report.progressProbe.beforeCancellation.metrics.outputBytes >= 16777216);
        assert.equal(report.conversionJsReport.maximumSamplingMs, 90000); assert.equal(report.conversionJsReport.stopped, true);
        assert.deepEqual(report.conversionJsReport.errors, []); assert.equal(report.conversionJsReport.conversionStoppedByProfiler, false);
        for (const phase of ["before-real-conversion", "output-1048576", "output-8388608", "output-16777216"])
          assert.ok(report.conversionJsReport.records.some(row => row.phase === phase && row.status === "captured"), phase);
        const asset = report.conversionJsReport.servedScripts.find(row => row.asset === binding.url); assert.ok(asset); assert.equal(asset.bytes, binding.bytes); assert.equal(asset.sha256, binding.sha256);
        assert.deepEqual(report.forbiddenRequests, []); assert.ok(report.runs[0].incrementalPrivateMiB <= 250);
        for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true, key);
        assert.ok(!report.cleanup.errors?.length); await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
        if (executions.length === 2) {
          const other = executions[0]; assert.equal(run.browserVersion, other.browserVersion);
          for (const key of ["chromeLauncherSha256", "chromeLibrarySha256", "viewport", "checkpointOutputBytes", "maximumConversionMs"]) assert.deepEqual(run.progressProbe[key], other.progressProbe[key], key);
        }
      } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
    }
  } catch (error) { failure = String(error.stack ?? error).slice(0, 8192); console.error(failure); process.exitCode = 1; }
  finally {
    try { const result = await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 ** 2 }); console.log(result.stdout.slice(-700)); await verifyBinding(baselineBinding); productionRestored = true; }
    catch (error) { failure = `${failure ?? ""}\nRestoration: ${error.stack ?? error}`.slice(0, 12288); process.exitCode = 1; }
  }
}
const postSourcePins = {};
for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await read(file)); assert.deepEqual(postSourcePins, sourcePins);
const proof = { recordedAt: new Date().toISOString(), status: prepareOnly ? "prepared-not-browser-executed" : failure ? "failed-or-incomplete" : "paired-real-progress-diagnostic-returned-independent-analysis-pending",
  failure, sourcePins, postSourcePins, templates, executions, hostPreflight: host ?? null, diskPreflightBytes: diskBytes ?? null, productionRestored,
  publicAcceptance: false, originalFullSourceAcceptance: false, conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false };
const proofPath = `evidence/${stamp}-stable-ui-real-progress${prepareOnly ? "-preparation" : ""}.json`;
const proofBytes = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(proofBytes) <= 2 * 1024 ** 2);
await writeFile(path.join(root, proofPath), proofBytes, { flag: "wx" }); console.log(JSON.stringify({ proofPath, status: proof.status, executions: executions.length, productionRestored }));
assert.equal(failure, null);
