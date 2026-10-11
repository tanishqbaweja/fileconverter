// One changed full-original diagnostic. The original browser driver owns every
// conversion and validator. This parent only qualifies, launches and retains it.
import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, readdir, realpath, stat, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { verifyBitrateFullPrerequisites } from "./lib/encoder-plane-bitrate-full-recipe.mjs";
import { loadHistoricalFullSourceBase, captureLayeredFullSourcePins, writeLayeredFullSourceArchive, materializeLayeredFullSourceArchive } from "./lib/layered-full-source-archive.mjs";
import { loadQualifiedAttemptMediaSources } from "./lib/qualified-attempt-full-stager.mjs";
import { createAttemptPlaneCandidate, verifyAttemptPlaneCandidate } from "./lib/allocation-attempt-plane-candidate.mjs";
import { makeAllocationAttemptFullDriver } from "./lib/allocation-attempt-full-driver.mjs";
import { validateCompositeAllocationFailureRecord } from "./lib/composite-allocation-failure-record.mjs";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const prepareOnly = process.argv[2] === "--prepare-only", root = path.resolve(import.meta.dirname, "..");
const read = file => readFile(path.join(root, file)), exec = promisify(execFile), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const hashFile = async file => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const protectedSource = async () => {
  const source = path.join(root, "test.mkv"), bytes = (await stat(source)).size;
  assert.equal(bytes, 2958573265); const sha256 = await hashFile(source);
  assert.equal(sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  return { bytes, sha256, wholeFileReadOnly: true };
};
const normal = async () => {
  assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
  assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
};
const base = await loadHistoricalFullSourceBase(root), media = await loadQualifiedAttemptMediaSources(root);
const prerequisites = await verifyBitrateFullPrerequisites(root);
const callerFiles = ["scripts/run-allocation-attempt-original-full.mjs", "scripts/lib/allocation-attempt-full-driver.mjs",
  "scripts/lib/layered-full-source-archive.mjs", "scripts/lib/qualified-attempt-full-stager.mjs", "scripts/lib/composite-allocation-failure-record.mjs",
  "scripts/stage-allocation-attempt-full.mjs", "tests/layered-full-preparation.test.mjs", "tests/allocation-attempt-full-driver.test.mjs",
  "tests/allocation-attempt-full-caller.test.mjs", "AGENTS.md", "MONITORING.md", media.reference.path, media.proof.generatedArchive.path, media.proof.report.archive.path];
const snapshot = await captureLayeredFullSourcePins(root, [...Object.keys(media.proof.sourcePins), ...callerFiles]);
const proof = { status: "prepared-not-executed", recordedAt: null, executions: 0, failure: null, cleanupErrors: [],
  sourcePins: snapshot.pins, postSourcePins: null, sourceLayers: { base: snapshot.base, limits: snapshot.limits, historicalFilesRetained: 256, additiveFiles: snapshot.additiveFiles.length },
  qualifiedMedia: media.reference, previousTerminal: base.reference.receipt, prerequisites,
  hostPreflight: null, launchHostPreflight: null, diskPreflightBytes: null, protectedBefore: null, protectedAfter: null,
  sourceArchive: null, wrapper: null, wrapperAbsent: null, candidateDirectory: null, candidateAbsent: null, composition: null,
  driverIdentity: null, driverAbsent: null, candidate: null, buildProof: null, productionRestored: false,
  browserMode: "headless", subprocessWindowsHidden: true, requestedRuns: 3, maximumConversionMsPerRun: 21600000,
  primaryLimitMiB: 250, nativeBitRate: 4000000, originalFullSourceAcceptance: false, publicAcceptance: false,
  conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false };
let runtime, candidateRuntime, child, done;
try {
  proof.hostPreflight = await inspectStressHostMemory(); assert.equal(proof.hostPreflight.safeToStart, true);
  const disk = await statfs(root); proof.diskPreflightBytes = disk.bavail * disk.bsize; assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3);
  await normal(); proof.protectedBefore = await protectedSource();
  if (!prepareOnly) {
    // Locks and old JSON statuses are NOT liveness. Check exact process births.
    for (const identity of prerequisites.ownedIdentities) assert.equal((await observeOwnedProcessExit(identity)).status, "owned-identity-absent");
    const oldFull = JSON.parse(await read(base.reference.receipt.path));
    for (const row of oldFull.candidate.ownedLaunches) assert.equal((await observeOwnedProcessExit(row.identity)).status, "owned-identity-absent");
    assert.equal((await observeOwnedProcessExit(oldFull.driverIdentity)).status, "owned-identity-absent");
    for (const file of (await readdir(path.join(root, "evidence"))).filter(name => /-(?:single-idle|encoder-plane(?:-staged|-title|-clock|-bitrate)?|allocation-attempt)-full-live\.json$/.test(name))) {
      const value = JSON.parse(await read("evidence/" + file));
      assert.equal((await observeOwnedProcessExit(value.driverIdentity)).status, "owned-identity-absent", "A birth-qualified driver is still live; never duplicate or restart it");
    }
    const oldRaw = JSON.parse(gunzipSync(await read(oldFull.candidate.compressedReport.path), { maxOutputLength: 33554432 }));
    assert.equal(await hashFile("C:/Program Files/Google/Chrome/Application/chrome.exe"), oldRaw.progressProbe.chromeLauncherSha256);
    assert.equal(await hashFile(`C:/Program Files/Google/Chrome/Application/${oldRaw.browserVersion}/chrome.dll`), oldRaw.progressProbe.chromeLibrarySha256);
  }
  runtime = await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-"); proof.wrapper = runtime.directory;
  candidateRuntime = await createOwnedRuntimeScratch("allocation-attempt-media-"); proof.candidateDirectory = candidateRuntime.directory;
  proof.composition = await createAttemptPlaneCandidate(root, candidateRuntime.directory);
  assert.deepEqual(await verifyAttemptPlaneCandidate(root, candidateRuntime.directory), media.report.manifest);
  const candidateName = path.basename(candidateRuntime.directory);
  const recipe = await makeAllocationAttemptFullDriver(root, runtime.directory, candidateName, snapshot.files);
  const traceMatch = base.archive.traceHelper.match(/"H:\\\\Github Repositories.*?-post-cancel-partial-blink\.json\.gz"/);
  assert.ok(traceMatch);
  const traceHelper = base.archive.traceHelper.replace(traceMatch[0], JSON.stringify(path.join(root, "outputs/reports", `${stamp}-allocation-attempt-full-post-cancel-partial-blink.json.gz`)));
  for (const text of [recipe.generated, traceHelper]) {
    const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: text, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(checked.status, 0, checked.stderr);
  }
  proof.sourceArchive = await writeLayeredFullSourceArchive(root, stamp, snapshot, { ...recipe, traceHelper, generatedCaller: await readFile(import.meta.filename, "utf8") });
  const restored = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.deepEqual(restored.sourcePins, snapshot.pins); assert.equal(restored.generated, recipe.generated);
  await writeFile(path.join(runtime.directory, "probe.mjs"), recipe.generated, { flag: "wx" });
  await writeFile(path.join(runtime.directory, "trace-helper.mjs"), traceHelper, { flag: "wx" });
  if (!prepareOnly) {
    const buildPath = `evidence/${stamp}-progress-compositing-build.json`;
    await exec(process.execPath, ["scripts/build-progress-compositing-candidate.mjs", stamp, "--for-browser"],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
    const bytes = await read(buildPath), ui = JSON.parse(bytes); assert.deepEqual(ui.asset, base.archive.expectedAsset);
    assert.deepEqual(ui.stylesheet, { url: base.archive.stylesheet.url, bytes: base.archive.stylesheet.bytes, sha256: base.archive.stylesheet.sha256 });
    proof.buildProof = { path: buildPath, sha256: sha(bytes) };
    proof.launchHostPreflight = await inspectStressHostMemory(); assert.equal(proof.launchHostPreflight.safeToStart, true);
    const reportsRoot = path.join(root, "outputs/reports"), before = new Set(await readdir(reportsRoot));
    child = spawn(process.execPath, [path.join(runtime.directory, "probe.mjs")],
      { cwd: root, env: { ...runtime.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: candidateName }, windowsHide: true, stdio: "inherit" });
    done = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => signal ? reject(new Error(`Full driver signalled ${signal}`)) : resolve(code)); });
    proof.executions = 1; proof.driverIdentity = await queryProcessIdentity(child.pid);
    assert.ok(proof.driverIdentity && proof.driverIdentity.parentPid === process.pid);
    const livePath = `evidence/${stamp}-allocation-attempt-full-live.json`;
    await writeFile(path.join(root, livePath), JSON.stringify({ ...proof, status: "actual-changed-full-driver-launched-not-acceptance", recordedAt: new Date().toISOString() }, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ livePath, driverIdentity: proof.driverIdentity, wrapper: runtime.directory, candidateDirectory: candidateRuntime.directory, sourceArchive: proof.sourceArchive.path }));
    const code = await done; proof.driverAbsent = await observeOwnedProcessExit(proof.driverIdentity); assert.equal(proof.driverAbsent.status, "owned-identity-absent");
    const names = (await readdir(reportsRoot)).filter(name => !before.has(name) && name.endsWith("-private-mpeg2-allocation-attempt-full-native-100ms.json"));
    assert.equal(names.length, 1, "Missing terminal evidence is not permission to retry");
    const file = path.join(reportsRoot, names[0]), identity = await lstat(file, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
    assert.equal(await realpath(file), file); const rawBytes = await readFile(file); assert.ok(rawBytes.length <= 33554432); const raw = JSON.parse(rawBytes);
    const zipped = gzipSync(rawBytes, { level: 9 }), archive = `outputs/reports/${stamp}-allocation-attempt-full-raw.json.gz`;
    await writeFile(path.join(root, archive), zipped, { flag: "wx" }); assert.deepEqual(gunzipSync(await read(archive)), rawBytes);
    const now = await lstat(file, { bigint: true }); for (const field of ["dev", "ino", "size"]) assert.equal(now[field], identity[field]);
    assert.equal(sha(await readFile(file)), sha(rawBytes)); await unlink(file);
    proof.candidate = { actualExitCode: code, status: raw.status, failure: raw.failure,
      compressedReport: { path: archive, bytes: zipped.length, sha256: sha(zipped), restoredBytes: rawBytes.length, restoredSha256: sha(rawBytes) },
      requestedRuns: raw.requestedRuns, completedConversions: raw.runs.filter(row => row.state?.jobState === "complete" && row.independentValidation).length,
      abortDiagnostic: raw.abortDiagnostic, cleanup: raw.cleanup, runtimeDirectory: raw.runtimeDirectory, ownedLaunches: raw.ownedLaunches,
      driverSourceHashes: raw.sourceHashes, rawRemovedAfterLosslessArchive: true };
    assert.deepEqual(raw.manifest, media.report.manifest); assert.equal(raw.limitMiB, 250); assert.equal(raw.requestedRuns, 3);
    assert.equal(raw.progressProbe.maximumConversionMs, 21600000); assert.equal(raw.progressProbe.partialOutputStopEnabled, false);
    assert.deepEqual(raw.forbiddenRequests, []); assert.equal(raw.conversionJsReport, null); assert.equal(raw.abortDiagnostic.captureError, null);
    for (const row of raw.abortDiagnostic.records) validateCompositeAllocationFailureRecord(row);
    assert.deepEqual(raw.sourceHashes, snapshot.pins);
    for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(raw.cleanup[field], true);
    assert.ok(!raw.cleanup.errors?.length); await assert.rejects(access(raw.runtimeDirectory), { code: "ENOENT" });
    for (const row of raw.ownedLaunches) assert.equal((await observeOwnedProcessExit(row.identity)).status, "owned-identity-absent");
    if (code === 0) { assert.equal(raw.status, "passed-private-protected-session"); assert.equal(proof.candidate.completedConversions, 3); }
    else { assert.equal(code, 1); assert.equal(raw.status, "failed"); assert.equal(typeof raw.failure?.message, "string"); }
    proof.status = "actual-full-attempt-terminal-independent-analysis-pending";
  }
} catch (error) { proof.failure = String(error.stack ?? error).slice(0, 8192); proof.status = "failed-or-incomplete"; process.exitCode = 1; console.error(proof.failure); }
finally {
  // Observation timeouts never revoke live-driver ownership or authorize removal.
  if (done && child?.exitCode === null && child?.signalCode === null) {
    try { await done; } catch (error) { proof.cleanupErrors.push(String(error).slice(0, 1024)); }
  }
  const actions = [async () => { if (proof.protectedBefore) { proof.protectedAfter = await protectedSource(); assert.deepEqual(proof.protectedAfter, proof.protectedBefore); } }];
  if (runtime) actions.push(async () => {
    try {
      if (!prepareOnly) { try { await normal(); } catch { await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 }); } }
      await normal(); proof.productionRestored = true;
    } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); proof.wrapperAbsent = true; }
  });
  if (candidateRuntime) actions.push(async () => { await candidateRuntime.close(); await assert.rejects(access(candidateRuntime.directory), { code: "ENOENT" }); proof.candidateAbsent = true; });
  try { await finishOwnedCleanup(actions); } catch (error) { proof.cleanupErrors.push(String(error.stack ?? error).slice(0, 8192)); }
}
try { proof.postSourcePins = (await captureLayeredFullSourcePins(root, snapshot.files)).pins; assert.deepEqual(proof.postSourcePins, snapshot.pins); }
catch (error) { proof.cleanupErrors.push(String(error.stack ?? error).slice(0, 8192)); }
if (proof.cleanupErrors.length) { proof.status = "failed-or-incomplete"; process.exitCode = 1; }
proof.recordedAt = new Date().toISOString();
const output = `evidence/${stamp}-allocation-attempt-original-full${prepareOnly ? "-preparation" : "-terminal"}.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, executions: proof.executions, wrapperAbsent: proof.wrapperAbsent, candidateAbsent: proof.candidateAbsent }));
assert.equal(proof.failure, null); assert.deepEqual(proof.cleanupErrors, []);
