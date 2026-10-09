// Reuse the checked terminal baseline; execute only the previously blocked candidate.
import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { access, lstat, readFile, readdir, realpath, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { loadRetainedCopyProgress, retainedCopyReceipt, retainedCopyReceiptSha256 } from "./lib/retained-split-copy-progress.mjs";
import { correctSplitCopyStagedGuard, copyAdapterBinding } from "./lib/split-copy-staged-guard-recipe.mjs";
import { makeSplitCopyProgressDriver, makeSplitCopyProgressTraceHelper } from "./lib/split-copy-progress-recipe.mjs";
import { splitRenderNativeFacts } from "./lib/split-render-progress-evidence.mjs";
import { compareOutputWorkWindows } from "./lib/split-copy-work-checkpoints.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const exec = promisify(execFile), reports = path.join(root, "outputs/reports");
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const prepareOnly = process.argv[2] === "--prepare-only", stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const retained = await loadRetainedCopyProgress(root);
const newFiles = ["scripts/diagnose-split-copy-candidate-only.mjs", "scripts/lib/retained-split-copy-progress.mjs",
  "scripts/lib/split-copy-staged-guard-recipe.mjs", "tests/split-copy-staged-guard.test.mjs", "AGENTS.md"];
const sourcePins = { ...retained.receipt.sourcePins };
for (const file of newFiles) sourcePins[file] = sha(await read(file));
const syntax = source => {
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
};
const makeDriver = helperUri => {
  const previous = makeSplitCopyProgressDriver(retained.executed.generated, root, helperUri, baselineBinding, "candidate");
  const corrected = correctSplitCopyStagedGuard(previous.generated);
  const before = "const sourceFiles = [", after = before + newFiles.map(file => JSON.stringify(file) + ",").join("");
  assert.equal(corrected.generated.split(before).length, 2);
  const generated = corrected.generated.replace(before, after); syntax(generated);
  assert.equal(generated.replace(after, before), corrected.generated);
  return { generated, previous, corrected, sourcePinPatch: [before, after], generatedSha256: sha(generated) };
};
const verifyNormal = async () => {
  const bytes = await read("dist/client" + baselineBinding.url);
  assert.equal(bytes.length, baselineBinding.bytes); assert.equal(sha(bytes), baselineBinding.sha256);
};
const proof = { recordedAt: null, status: "prepared-not-browser-executed", failure: null, executions: 0,
  reusedBaseline: { receipt: retainedCopyReceipt, sha256: retainedCopyReceiptSha256,
    rawArchive: retained.baseline.record.compressedReport, sourceArchive: retained.baseline.record.sourceArchive,
    native: retained.native, workCheckpoints: retained.baseline.raw.progressProbe.workCheckpoints,
    noBaselineRerun: true, cancelledPartialOnly: true },
  sourcePins, postSourcePins: null, adapterBinding: copyAdapterBinding,
  terminalPreviousFailureVerified: true, priorCandidateBrowserNeverLaunched: true,
  preparation: null, sourceArchive: null, candidate: null, workWindows: null,
  hostPreflight: null, diskPreflightBytes: null, ownedBaselineProcessesAbsent: null,
  productionRestored: false, browserMode: "headless", subprocessWindowsHidden: true,
  publicAcceptance: false, originalFullSourceAcceptance: false, conversionSpeedAcceptance: false,
  completeChromiumMemoryAcceptance: false };
if (prepareOnly) {
  const recipe = makeDriver("file:///UNIT_ONLY_NOT_EXECUTED/trace-helper.mjs");
  proof.preparation = { bytes: Buffer.byteLength(recipe.generated), sha256: recipe.generatedSha256,
    adapterGuardPatches: recipe.corrected.patches, expectedAsset: baselineBinding,
    checkpointOutputBytes: 67108864, maximumConversionMs: 300000 };
} else {
  let runtime;
  try {
    // Birth-bound read-only observation: old process IDs alone are not ownership.
    const identities = retained.baseline.raw.nativeMemory.identities;
    const filter = identities.map(row => `ProcessId = ${row.pid}`).join(" OR ");
    const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{ pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
    { windowsHide: true, timeout: 15000, maxBuffer: 65536 });
    const current = JSON.parse(stdout); assert.ok(Array.isArray(current));
    for (const identity of identities) assert.ok(!current.some(row => row.pid === identity.pid &&
      Math.abs(Date.parse(row.createdAt) - Date.parse(identity.createdAt)) <= 1), "Old owned Chrome identity still live: do not restart");
    proof.ownedBaselineProcessesAbsent = { acquiredAt: new Date().toISOString(), identities, current, noProcessesKilled: true };
    const base = retained.baseline.raw;
    assert.equal(sha(await readFile("C:/Program Files/Google/Chrome/Application/chrome.exe")), base.progressProbe.chromeLauncherSha256);
    assert.equal(sha(await readFile(`C:/Program Files/Google/Chrome/Application/${base.browserVersion}/chrome.dll`)), base.progressProbe.chromeLibrarySha256);
    proof.hostPreflight = await inspectStressHostMemory(); console.log(JSON.stringify({ host: proof.hostPreflight, stamp }));
    assert.equal(proof.hostPreflight.safeToStart, true);
    const disk = await statfs(root); proof.diskPreflightBytes = disk.bavail * disk.bsize;
    assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3); await verifyNormal();
    runtime = await createOwnedRuntimeScratch("split-copy-goldens-corrected-candidate-");
    const traceFile = path.join(runtime.directory, "trace-helper.mjs"), driverFile = path.join(runtime.directory, "probe.mjs");
    const traceHelper = makeSplitCopyProgressTraceHelper(retained.executed.traceHelper,
      path.join(reports, `${stamp}-split-copy-corrected-candidate-post-cancel-partial-blink.json.gz`));
    const recipe = makeDriver(pathToFileURL(traceFile).href); syntax(traceHelper);
    const sourceBytes = Buffer.from(JSON.stringify({ ...recipe, traceHelper })), compressedSource = gzipSync(sourceBytes, { level: 9 });
    assert.ok(compressedSource.length <= 65536);
    const sourcePath = `outputs/reports/${stamp}-split-copy-corrected-candidate-executed-sources.json.gz`;
    await writeFile(path.join(root, sourcePath), compressedSource, { flag: "wx" });
    assert.deepEqual(gunzipSync(await read(sourcePath)), sourceBytes);
    proof.sourceArchive = { path: sourcePath, bytes: compressedSource.length, sha256: sha(compressedSource),
      restoredSha256: sha(sourceBytes), driverSha256: sha(recipe.generated), traceHelperSha256: sha(traceHelper) };
    await writeFile(traceFile, traceHelper, { flag: "wx" }); await writeFile(driverFile, recipe.generated, { flag: "wx" });
    const before = new Set(await readdir(reports));
    const child = spawn(process.execPath, [driverFile], { cwd: root, env: { ...runtime.env,
      WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: "mpeg2-split-pipeline-37739125738", WITHIN_SPLIT_COPY_STATE_DIR: runtime.directory },
    windowsHide: true, stdio: "inherit" });
    proof.executions = 1;
    console.log(JSON.stringify({ driverPid: child.pid, wrapper: runtime.directory, sourceArchive: sourcePath }));
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (exitCode, signal) =>
      signal ? reject(new Error(`Candidate signalled ${signal}`)) : resolve(exitCode)); });
    const names = (await readdir(reports)).filter(name => !before.has(name) && name.endsWith("-private-mpeg2-split-copy-candidate-native-100ms.json"));
    assert.equal(names.length, 1, "Never fabricate missing evidence or automatically restart");
    const file = path.join(reports, names[0]), identity = await lstat(file, { bigint: true });
    assert.ok(identity.isFile() && !identity.isSymbolicLink()); assert.equal(await realpath(file), file);
    const rawBytes = await readFile(file); assert.ok(rawBytes.length <= 32 * 1024 ** 2);
    const raw = JSON.parse(rawBytes), compressed = gzipSync(rawBytes, { level: 9 });
    const compressedPath = `outputs/reports/${stamp}-split-copy-corrected-candidate-raw.json.gz`;
    await writeFile(path.join(root, compressedPath), compressed, { flag: "wx" });
    assert.deepEqual(gunzipSync(await read(compressedPath)), rawBytes);
    const present = await lstat(file, { bigint: true });
    for (const key of ["dev", "ino", "size"]) assert.equal(present[key], identity[key]);
    assert.equal(sha(await readFile(file)), sha(rawBytes)); await unlink(file);
    await assert.rejects(access(file), { code: "ENOENT" });
    proof.candidate = { actualExitCode: code, status: raw.status, failure: raw.failure,
      compressedReport: { path: compressedPath, bytes: compressed.length, sha256: sha(compressed) },
      rawReport: { path: path.relative(root, file).replaceAll("\\", "/"), bytes: rawBytes.length, sha256: sha(rawBytes) },
      rawRemovedAfterLosslessArchive: true, browserVersion: raw.browserVersion, progressProbe: raw.progressProbe,
      splitFinalSamples: raw.splitFinalSamples, native: raw.nativeMemory && raw.runs.length ? splitRenderNativeFacts(raw, "candidate") : null,
      ownedPids: raw.ownedPids, cleanup: raw.cleanup, runtimeDirectory: raw.runtimeDirectory };
    assert.equal(code, 1); assert.equal(raw.status, "failed");
    assert.deepEqual(raw.progressProbe.actualServedAsset, baselineBinding); assert.deepEqual(raw.forbiddenRequests, []);
    assert.deepEqual(raw.source, base.source); assert.deepEqual(raw.manifest, base.manifest);
    assert.deepEqual(raw.actualWasmMemoryLimits, base.actualWasmMemoryLimits);
    assert.equal(raw.limitMiB, 250); assert.equal(raw.conversionJsReport, null);
    assert.equal(raw.browserVersion, base.browserVersion);
    for (const key of ["chromeLauncherSha256", "chromeLibrarySha256", "viewport", "checkpointOutputBytes", "maximumConversionMs"])
      assert.deepEqual(raw.progressProbe[key], base.progressProbe[key]);
    for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
      assert.equal(raw.cleanup[key], true, key);
    assert.ok(!raw.cleanup.errors?.length); await assert.rejects(access(raw.runtimeDirectory), { code: "ENOENT" });
    assert.deepEqual(raw.abortDiagnostic.stagedAdapters.map(({ bytes, sha256 }) => ({ bytes, sha256 })), Array(3).fill(copyAdapterBinding));
    assert.ok(raw.progressProbe.checkpointReached || /exceeds 250MiB|deadline reached|cancelled|complete|memory|abort/i.test(raw.failure?.message ?? ""));
    proof.workWindows = compareOutputWorkWindows(base.progressProbe.workCheckpoints, raw.progressProbe.workCheckpoints);
    proof.status = "candidate-diagnostic-returned-independent-analysis-pending";
  } catch (error) {
    proof.failure = String(error.stack ?? error).slice(0, 8192); proof.status = "failed-or-incomplete";
    process.exitCode = 1; console.error(proof.failure);
  } finally {
    if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
    const restoration = await createOwnedRuntimeScratch("split-copy-corrected-restoration-");
    try {
      await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"],
        { cwd: root, env: restoration.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
      await verifyNormal(); proof.productionRestored = true;
    } catch (error) {
      proof.failure = `${proof.failure ?? ""}\nRestoration: ${error.stack ?? error}`.slice(0, 12288);
      proof.status = "failed-or-incomplete"; process.exitCode = 1;
    } finally { await restoration.close(); await assert.rejects(access(restoration.directory), { code: "ENOENT" }); }
  }
}
proof.postSourcePins = {};
for (const file of Object.keys(sourcePins)) proof.postSourcePins[file] = sha(await read(file));
assert.deepEqual(proof.postSourcePins, sourcePins); proof.recordedAt = new Date().toISOString();
const proofPath = `evidence/${stamp}-split-copy-corrected-candidate${prepareOnly ? "-preparation" : ""}.json`;
const proofBytes = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(proofBytes) <= 2 * 1024 ** 2);
await writeFile(path.join(root, proofPath), proofBytes, { flag: "wx" });
console.log(JSON.stringify({ proofPath, status: proof.status, executions: proof.executions, productionRestored: proof.productionRestored,
  workWindows: proof.workWindows, noBaselineRerun: true }));
assert.equal(proof.failure, null);
