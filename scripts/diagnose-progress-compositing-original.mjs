// Reuse the terminal control; ONE changed App/CSS diagnostic with full original input.
import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { observeOwnedProcessExit, queryProcessIdentity } from "./lib/owned-process-exit-observation.mjs";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { loadRetainedCopyProgress, retainedCopyReceipt, retainedCopyReceiptSha256 } from "./lib/retained-split-copy-progress.mjs";
import { makeProgressCompositingProgressDriver, makeProgressCompositingTraceHelper, progressCompositingFiles } from "./lib/progress-compositing-progress-recipe.mjs";
import { splitRenderNativeFacts } from "./lib/split-render-progress-evidence.mjs";
import { compareOutputWorkWindows } from "./lib/split-copy-work-checkpoints.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), exec = promisify(execFile);
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const prepareOnly = process.argv[2] === "--prepare-only", stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const retained = await loadRetainedCopyProgress(root), base = retained.baseline.raw;
const goldenPath = "evidence/2026-10-09T15-42-44-939Z-progress-compositing-golden-analysis.json", goldenBytes = await read(goldenPath), golden = JSON.parse(goldenBytes);
assert.equal(golden.status, "independently-verified-five-goldens-with-follow-up-numeric-cleanup");
assert.equal(golden.geometry.maximumDeltaCssPixels, 0); assert.equal(golden.conversions.length, 3); assert.equal(golden.emptyStorageInventories, 5);
assert.equal(golden.publicAcceptance, false); assert.equal(sha(await read(golden.proof.path)), golden.proof.sha256);
const sourcePins = { ...retained.receipt.sourcePins };
for (const file of progressCompositingFiles) sourcePins[file] = sha(await read(file));
for (const [file, hash] of Object.entries(sourcePins)) assert.equal(sha(await read(file)), hash, file);
const syntax = source => {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, maxBuffer: 131072 });
  assert.equal(result.status, 0, result.stderr);
};
const makeDriver = helperUri => {
  const recipe = makeProgressCompositingProgressDriver(retained.executed.generated, root, helperUri, golden.actualServedApp, golden.actualServedStylesheet);
  syntax(recipe.generated); return recipe;
};
const shaFile = async file => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const normal = async () => {
  const app = await read("dist/client" + baselineBinding.url); assert.equal(app.length, baselineBinding.bytes); assert.equal(sha(app), baselineBinding.sha256);
  assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), golden.normalStylesheetArchive.rawSha256);
};
const proof = { recordedAt: null, status: "prepared-not-browser-executed", failure: null, executions: 0, sourcePins, postSourcePins: null,
  reusedBaseline: { receipt: retainedCopyReceipt, sha256: retainedCopyReceiptSha256, rawArchive: retained.baseline.record.compressedReport,
    sourceArchive: retained.baseline.record.sourceArchive, native: retained.native, workCheckpoints: base.progressProbe.workCheckpoints,
    noBaselineRerun: true, cancelledPartialOnly: true }, golden: { path: goldenPath, sha256: sha(goldenBytes) },
  expectedApp: golden.actualServedApp, expectedStylesheet: golden.actualServedStylesheet, originalJsCopyTransport: true,
  preparation: null, buildProof: null, sourceArchive: null, candidate: null, workWindows: null, hostPreflight: null, diskPreflightBytes: null,
  ownedBaselineProcessesAbsent: null, ownedDriver: null, driverAbsent: null, wrapperPath: null, wrapperAbsent: null,
  productionRestored: false, browserMode: "headless", subprocessWindowsHidden: true, headedManualValidation: false,
  publicAcceptance: false, originalFullSourceAcceptance: false, conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false };
if (prepareOnly) {
  const recipe = makeDriver("file:///UNIT_ONLY_NOT_EXECUTED/trace-helper.mjs");
  proof.preparation = { bytes: Buffer.byteLength(recipe.generated), sha256: recipe.generatedSha256, patches: recipe.patches,
    checkpointOutputBytes: 67108864, maximumConversionMs: 300000, originalAdapterBytes: 18330 };
} else {
  let runtime, child, childDone;
  try {
    const identities = base.nativeMemory.identities, filter = identities.map(row => `ProcessId = ${row.pid}`).join(" OR ");
    const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{ pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
    { windowsHide: true, timeout: 15000, maxBuffer: 65536 });
    const current = JSON.parse(stdout); assert.ok(Array.isArray(current));
    for (const identity of identities) assert.ok(!current.some(row => row.pid === identity.pid &&
      Math.abs(Date.parse(row.createdAt) - Date.parse(identity.createdAt)) <= 1), "Old Chrome identity still live: no restart");
    proof.ownedBaselineProcessesAbsent = { acquiredAt: new Date().toISOString(), identities, current, noProcessesKilled: true };
    assert.equal(await shaFile("C:/Program Files/Google/Chrome/Application/chrome.exe"), base.progressProbe.chromeLauncherSha256);
    assert.equal(await shaFile(`C:/Program Files/Google/Chrome/Application/${base.browserVersion}/chrome.dll`), base.progressProbe.chromeLibrarySha256);
    proof.hostPreflight = await inspectStressHostMemory(); console.log(JSON.stringify({ host: proof.hostPreflight, stamp }));
    assert.equal(proof.hostPreflight.safeToStart, true); const disk = await statfs(root); proof.diskPreflightBytes = disk.bavail * disk.bsize;
    assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3); await normal();
    runtime = await createOwnedRuntimeScratch("progress-compositing-original-"); proof.wrapperPath = runtime.directory;
    const buildPath = `evidence/${stamp}-progress-compositing-build.json`;
    await exec(process.execPath, ["scripts/build-progress-compositing-candidate.mjs", stamp, "--for-browser"],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
    const buildBytes = await read(buildPath), build = JSON.parse(buildBytes); assert.equal(build.forBrowser, true);
    assert.deepEqual(build.asset, golden.actualServedApp);
    assert.deepEqual(build.stylesheet, { url: golden.actualServedStylesheet.url, bytes: golden.actualServedStylesheet.bytes, sha256: golden.actualServedStylesheet.sha256 });
    proof.buildProof = { path: buildPath, sha256: sha(buildBytes) };
    const tracePath = path.join(runtime.directory, "trace-helper.mjs"), driverPath = path.join(runtime.directory, "probe.mjs");
    const traceHelper = makeProgressCompositingTraceHelper(retained.executed.traceHelper,
      path.join(root, "outputs/reports", `${stamp}-progress-compositing-post-cancel-partial-blink.json.gz`)); syntax(traceHelper);
    const recipe = makeDriver(pathToFileURL(tracePath).href), sourcePreimages = {};
    for (const file of Object.keys(sourcePins)) sourcePreimages[file] = { encoding: "base64", data: (await read(file)).toString("base64") };
    const sourceBytes = Buffer.from(JSON.stringify({ ...recipe, traceHelper, sourcePreimages })), sourceGzip = gzipSync(sourceBytes, { level: 9 });
    assert.ok(sourceBytes.length <= 8 * 1024 ** 2 && sourceGzip.length <= 2 * 1024 ** 2);
    const sourcePath = `outputs/reports/${stamp}-progress-compositing-original-executed-sources.json.gz`;
    await writeFile(path.join(root, sourcePath), sourceGzip, { flag: "wx" }); assert.deepEqual(gunzipSync(await read(sourcePath)), sourceBytes);
    proof.sourceArchive = { path: sourcePath, bytes: sourceGzip.length, sha256: sha(sourceGzip), restoredBytes: sourceBytes.length,
      restoredSha256: sha(sourceBytes), driverSha256: sha(recipe.generated), traceHelperSha256: sha(traceHelper), preimageCount: Object.keys(sourcePreimages).length };
    await writeFile(tracePath, traceHelper, { flag: "wx" }); await writeFile(driverPath, recipe.generated, { flag: "wx" });
    const reports = path.join(root, "outputs/reports"), before = new Set(await readdir(reports));
    child = spawn(process.execPath, [driverPath], { cwd: root, env: { ...runtime.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: "mpeg2-split-pipeline-37739125738" },
      windowsHide: true, stdio: "inherit" }); proof.executions = 1;
    childDone = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => signal ? reject(new Error(`Diagnostic signalled ${signal}`)) : resolve(code)); });
    proof.ownedDriver = await queryProcessIdentity(child.pid); assert.ok(proof.ownedDriver && proof.ownedDriver.parentPid === process.pid);
    console.log(JSON.stringify({ driverPid: child.pid, driverIdentity: proof.ownedDriver, wrapper: runtime.directory, sourceArchive: sourcePath }));
    const code = await childDone; proof.driverAbsent = await observeOwnedProcessExit(proof.ownedDriver); assert.equal(proof.driverAbsent.status, "owned-identity-absent");
    const names = (await readdir(reports)).filter(name => !before.has(name) && name.endsWith("-private-mpeg2-progress-compositing-native-100ms.json"));
    assert.equal(names.length, 1, "Missing evidence is not success; no automatic retry");
    const file = path.join(reports, names[0]), identity = await lstat(file, { bigint: true });
    assert.ok(identity.isFile() && !identity.isSymbolicLink()); assert.equal(await realpath(file), file);
    const rawBytes = await readFile(file); assert.ok(rawBytes.length <= 32 * 1024 ** 2); const raw = JSON.parse(rawBytes);
    const compressed = gzipSync(rawBytes, { level: 9 }), compressedPath = `outputs/reports/${stamp}-progress-compositing-original-raw.json.gz`;
    await writeFile(path.join(root, compressedPath), compressed, { flag: "wx" }); assert.deepEqual(gunzipSync(await read(compressedPath)), rawBytes);
    const present = await lstat(file, { bigint: true }); for (const key of ["dev", "ino", "size"]) assert.equal(present[key], identity[key]);
    assert.equal(sha(await readFile(file)), sha(rawBytes)); await unlink(file); await assert.rejects(access(file), { code: "ENOENT" });
    proof.candidate = { actualExitCode: code, status: raw.status, failure: raw.failure,
      compressedReport: { path: compressedPath, bytes: compressed.length, sha256: sha(compressed) },
      rawReport: { path: path.relative(root, file).replaceAll("\\", "/"), bytes: rawBytes.length, sha256: sha(rawBytes) }, rawRemovedAfterLosslessArchive: true,
      browserVersion: raw.browserVersion, progressProbe: raw.progressProbe, splitFinalSamples: raw.splitFinalSamples,
      native: raw.nativeMemory && raw.runs.length ? splitRenderNativeFacts(raw, "candidate") : null, ownedPids: raw.ownedPids, ownedLaunches: raw.ownedLaunches,
      cleanup: raw.cleanup, runtimeDirectory: raw.runtimeDirectory };
    assert.equal(code, 1); assert.equal(raw.status, "failed"); assert.equal(raw.runs.length, 1);
    assert.deepEqual(raw.progressProbe.actualServedAsset, golden.actualServedApp); assert.deepEqual(raw.forbiddenRequests, []);
    assert.deepEqual(raw.source, base.source); assert.deepEqual(raw.manifest, base.manifest); assert.deepEqual(raw.actualWasmMemoryLimits, base.actualWasmMemoryLimits);
    assert.equal(raw.limitMiB, 250); assert.equal(raw.conversionJsReport, null); assert.equal(raw.browserVersion, base.browserVersion);
    for (const key of ["chromeLauncherSha256", "chromeLibrarySha256", "viewport", "checkpointOutputBytes", "maximumConversionMs"])
      assert.deepEqual(raw.progressProbe[key], base.progressProbe[key]);
    for (const [file, hash] of Object.entries(raw.sourceHashes)) assert.equal(hash, sourcePins[file], file);
    const style = raw.cssCandidate.staticAssets; assert.equal(style.length, 1); assert.equal(raw.cssCandidate.interceptionError, null);
    assert.deepEqual({ url: new URL(style[0].url).pathname, bytes: style[0].beforeBytes, sha256: style[0].beforeSha256,
      afterBytes: style[0].afterBytes, afterSha256: style[0].afterSha256 },
    { url: golden.actualServedStylesheet.url, bytes: golden.actualServedStylesheet.bytes, sha256: golden.actualServedStylesheet.sha256,
      afterBytes: golden.actualServedStylesheet.afterBytes, afterSha256: golden.actualServedStylesheet.afterSha256 });
    assert.deepEqual(raw.abortDiagnostic.stagedAdapters.map(({ bytes, sha256 }) => ({ bytes, sha256 })),
      Array(3).fill({ bytes: 18330, sha256: "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837" }));
    for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
      assert.equal(raw.cleanup[key], true, key);
    assert.ok(!raw.cleanup.errors?.length); await assert.rejects(access(raw.runtimeDirectory), { code: "ENOENT" });
    assert.ok(raw.progressProbe.checkpointReached || /exceeds 250MiB|deadline reached|cancelled|memory|abort/i.test(raw.failure?.message ?? ""));
    proof.workWindows = compareOutputWorkWindows(base.progressProbe.workCheckpoints, raw.progressProbe.workCheckpoints);
    proof.status = "candidate-diagnostic-returned-independent-analysis-pending";
  } catch (error) { proof.failure = String(error.stack ?? error).slice(0, 8192); proof.status = "failed-or-incomplete"; process.exitCode = 1; console.error(proof.failure); }
  finally {
    // Never remove live-driver scratch. The driver owns conversion cancellation/finally.
    if (childDone && child?.exitCode === null && child?.signalCode === null) await childDone;
    if (runtime) {
      // Original stager normally restores generated App/CSS. Rebuild only when that failed,
      // including errors between a private build and the driver's stage flag.
      try {
        try { await normal(); }
        catch { await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"],
          { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 }); await normal(); }
        proof.productionRestored = true;
      } catch (error) { proof.failure = `${proof.failure ?? ""}\nRestoration: ${error.stack ?? error}`.slice(0, 12288); proof.status = "failed-or-incomplete"; process.exitCode = 1; }
      finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); proof.wrapperAbsent = true; }
    }
  }
}
proof.postSourcePins = {}; for (const file of Object.keys(sourcePins)) proof.postSourcePins[file] = sha(await read(file));
assert.deepEqual(proof.postSourcePins, sourcePins); proof.recordedAt = new Date().toISOString();
const output = `evidence/${stamp}-progress-compositing-original${prepareOnly ? "-preparation" : ""}.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, executions: proof.executions, productionRestored: proof.productionRestored,
  workWindows: proof.workWindows, noBaselineRerun: true })); assert.equal(proof.failure, null);
