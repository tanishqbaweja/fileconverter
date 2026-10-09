// ONE changed full-original attempt. Live PID is observable; never restart on wait timeout.
import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { deriveDriverSourcePinFiles } from "./lib/driver-source-pin-union.mjs";
import { makeSingleIdleFullDriver, verifySingleIdleAbortQualification, singleIdleFullFiles } from "./lib/single-idle-full-recipe.mjs";
import { verifySingleIdleBuildEvidence, SINGLE_IDLE_SLOT } from "./lib/single-idle-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), exec = promisify(execFile);
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const prepareOnly = process.argv[2] === "--prepare-only", stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const receiptPath = "evidence/2026-10-09T16-55-27-062Z-progress-compositing-original-full-completion.json", receiptBytes = await read(receiptPath), receipt = JSON.parse(receiptBytes);
const gzip = await read(receipt.sourceArchive.path); assert.equal(sha(gzip), receipt.sourceArchive.sha256);
const oldBytes = gunzipSync(gzip, { maxOutputLength: 8388608 }); assert.equal(sha(oldBytes), receipt.sourceArchive.restoredSha256);
const previous = JSON.parse(oldBytes); assert.equal(sha(previous.generated), receipt.sourceArchive.driverSha256);
const branch = JSON.parse(await read("evidence/mpeg2-single-idle-build-branch-2026-10-10.json"));
const buildBytes = await read("evidence/mpeg2-single-idle-build-37986418102.json"), build = JSON.parse(buildBytes); verifySingleIdleBuildEvidence(build, branch);
const qualification = JSON.parse(await read("evidence/mpeg2-single-idle-abort-layout-2026-10-10.json")); verifySingleIdleAbortQualification(qualification);
const goldens = JSON.parse(await read("evidence/2026-10-09T20-41-29-131Z-single-idle-browser-goldens.json"));
assert.equal(goldens.status, "five-headless-goldens-byte-exact-and-recovery-passed"); assert.equal(goldens.failure, null);
const hashFile = async file => { const h = createHash("sha256"); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest("hex"); };
const normal = async () => {
  assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
  assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
};
const coverage = deriveDriverSourcePinFiles(makeSingleIdleFullDriver(previous, root, path.join(root, "work/UNIT-ONLY"), branch).generated,
  [...Object.keys(receipt.sourcePins), ...singleIdleFullFiles, "scripts/lib/single-idle-build-workflow.mjs"]);
// The frozen driver union accepts code/report extensions, not build .sh/.patch.
// Add actual manifest build inputs separately, with strict path/hash/size bounds.
const files = [...new Set([...coverage.files, ...Object.keys(build.manifest.sources)])]; assert.ok(files.length <= 256);
for (const file of files) assert.ok(file.length <= 512 && !file.includes(":") && !file.includes("\\") && !file.includes("\0") &&
  !file.startsWith("/") && file.split("/").every(part => part && part !== "." && part !== ".."));
const pins = {}, preimages = {};
for (const file of files) {
  const bytes = await read(file); assert.ok(bytes.length <= 2097152); pins[file] = sha(bytes); preimages[file] = { encoding: "base64", data: bytes.toString("base64") };
  if (receipt.sourcePins[file]) assert.equal(pins[file], receipt.sourcePins[file], file);
  if (build.manifest.sources[file] && file !== branch.workflow.path) assert.equal(pins[file], build.manifest.sources[file], file);
}
assert.equal(pins[branch.workflow.path], branch.workflow.canonicalSha256);
const proof = { recordedAt: null, status: "prepared-not-executed", executions: 0, sourcePins: pins,
  previousTerminal: { path: receiptPath, sha256: sha(receiptBytes), noOldCoreRetry: true }, compiledBuildSha256: sha(buildBytes),
  failure: null, hostPreflight: null, launchHostPreflight: null, diskPreflightBytes: null,
  sourceArchive: null, driverIdentity: null, driverAbsent: null, candidate: null, buildProof: null,
  wrapper: null, wrapperAbsent: null, productionRestored: false,
  browserMode: "headless", subprocessWindowsHidden: true, requestedRuns: 3, maximumConversionMsPerRun: 21600000,
  primaryLimitMiB: 250, originalFullSourceAcceptance: false, publicAcceptance: false, conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false };
let runtime, child, done;
try {
  proof.hostPreflight = await inspectStressHostMemory(); assert.equal(proof.hostPreflight.safeToStart, true);
  const disk = await statfs(root); proof.diskPreflightBytes = disk.bavail * disk.bsize; assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3);
  await normal();
  if (!prepareOnly) {
    // No stale-state restart: check actual old launch identities; do not kill anything.
    for (const row of receipt.candidate.ownedLaunches) {
      const absence = await observeOwnedProcessExit(row.identity); assert.equal(absence.status, "owned-identity-absent");
    }
    const oldLive = (await readdir(path.join(root, "evidence"))).filter(name => name.endsWith("-single-idle-full-live.json"));
    for (const file of oldLive) {
      const value = JSON.parse(await read("evidence/" + file));
      const absence = await observeOwnedProcessExit(value.driverIdentity); assert.equal(absence.status, "owned-identity-absent", "Existing same-candidate driver live; never restart");
    }
    const rawOld = JSON.parse(gunzipSync(await read(receipt.candidate.compressedReport.path), { maxOutputLength: 33554432 }));
    assert.equal(await hashFile("C:/Program Files/Google/Chrome/Application/chrome.exe"), rawOld.progressProbe.chromeLauncherSha256);
    assert.equal(await hashFile(`C:/Program Files/Google/Chrome/Application/${rawOld.browserVersion}/chrome.dll`), rawOld.progressProbe.chromeLibrarySha256);
  }
  runtime = await createOwnedRuntimeScratch("single-idle-full-wrapper-"); proof.wrapper = runtime.directory;
  if (!prepareOnly) {
    const buildPath = `evidence/${stamp}-progress-compositing-build.json`;
    await exec(process.execPath, ["scripts/build-progress-compositing-candidate.mjs", stamp, "--for-browser"],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
    const bytes = await read(buildPath), ui = JSON.parse(bytes); assert.deepEqual(ui.asset, previous.expectedAsset);
    assert.deepEqual(ui.stylesheet, { url: previous.stylesheet.url, bytes: previous.stylesheet.bytes, sha256: previous.stylesheet.sha256 });
    proof.buildProof = { path: buildPath, sha256: sha(bytes) };
  }
  const recipe = makeSingleIdleFullDriver(previous, root, runtime.directory, branch);
  const traceMatch = previous.traceHelper.match(/"H:\\\\Github Repositories.*?-post-cancel-partial-blink\.json\.gz"/);
  assert.ok(traceMatch); const traceHelper = previous.traceHelper.replace(traceMatch[0], JSON.stringify(path.join(root, "outputs/reports", `${stamp}-single-idle-full-post-cancel-partial-blink.json.gz`)));
  for (const text of [recipe.generated, traceHelper]) {
    const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: text, encoding: "utf8", windowsHide: true }); assert.equal(checked.status, 0, checked.stderr);
  }
  const sourceBytes = Buffer.from(JSON.stringify({ ...recipe, traceHelper, sourcePreimages: preimages })), compressed = gzipSync(sourceBytes, { level: 9 });
  assert.ok(sourceBytes.length <= 8388608); assert.deepEqual(gunzipSync(compressed), sourceBytes);
  const archivePath = `outputs/reports/${stamp}-single-idle-full-executed-sources.json.gz`; await writeFile(path.join(root, archivePath), compressed, { flag: "wx" });
  proof.sourceArchive = { path: archivePath, bytes: compressed.length, sha256: sha(compressed), restoredBytes: sourceBytes.length,
    restoredSha256: sha(sourceBytes), driverSha256: sha(recipe.generated), traceHelperSha256: sha(traceHelper), preimageCount: files.length };
  await writeFile(path.join(runtime.directory, "probe.mjs"), recipe.generated, { flag: "wx" });
  await writeFile(path.join(runtime.directory, "trace-helper.mjs"), traceHelper, { flag: "wx" });
  if (!prepareOnly) {
    proof.launchHostPreflight = await inspectStressHostMemory(); assert.equal(proof.launchHostPreflight.safeToStart, true);
    const reportsRoot = path.join(root, "outputs/reports"), before = new Set(await readdir(reportsRoot));
    child = spawn(process.execPath, [path.join(runtime.directory, "probe.mjs")],
      { cwd: root, env: { ...runtime.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: SINGLE_IDLE_SLOT }, windowsHide: true, stdio: "inherit" });
    done = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => signal ? reject(new Error(`Full driver signalled ${signal}`)) : resolve(code)); });
    proof.executions = 1; proof.driverIdentity = await queryProcessIdentity(child.pid); assert.ok(proof.driverIdentity && proof.driverIdentity.parentPid === process.pid);
    const livePath = `evidence/${stamp}-single-idle-full-live.json`;
    await writeFile(path.join(root, livePath), JSON.stringify({ ...proof, status: "actual-changed-full-driver-launched-not-acceptance", recordedAt: new Date().toISOString() }, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ livePath, driverIdentity: proof.driverIdentity, wrapper: runtime.directory, sourceArchive: archivePath }));
    const code = await done; proof.driverAbsent = await observeOwnedProcessExit(proof.driverIdentity); assert.equal(proof.driverAbsent.status, "owned-identity-absent");
    const names = (await readdir(reportsRoot)).filter(name => !before.has(name) && name.endsWith("-private-mpeg2-single-idle-full-native-100ms.json"));
    assert.equal(names.length, 1, "Missing terminal evidence is not permission to retry");
    const file = path.join(reportsRoot, names[0]), identity = await lstat(file, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
    assert.equal(await realpath(file), file); const rawBytes = await readFile(file); assert.ok(rawBytes.length <= 33554432); const raw = JSON.parse(rawBytes);
    const zipped = gzipSync(rawBytes, { level: 9 }), archive = `outputs/reports/${stamp}-single-idle-full-raw.json.gz`;
    await writeFile(path.join(root, archive), zipped, { flag: "wx" }); assert.deepEqual(gunzipSync(await read(archive)), rawBytes);
    const now = await lstat(file, { bigint: true }); for (const field of ["dev", "ino", "size"]) assert.equal(now[field], identity[field]);
    assert.equal(sha(await readFile(file)), sha(rawBytes)); await unlink(file);
    proof.candidate = { actualExitCode: code, status: raw.status, failure: raw.failure,
      compressedReport: { path: archive, bytes: zipped.length, sha256: sha(zipped), restoredBytes: rawBytes.length, restoredSha256: sha(rawBytes) },
      requestedRuns: raw.requestedRuns, completedConversions: raw.runs.filter(row => row.state?.jobState === "complete" && row.independentValidation).length,
      abortDiagnostic: raw.abortDiagnostic, cleanup: raw.cleanup, runtimeDirectory: raw.runtimeDirectory, ownedLaunches: raw.ownedLaunches,
      driverSourceHashes: raw.sourceHashes, rawRemovedAfterLosslessArchive: true };
    assert.deepEqual(raw.manifest, build.manifest); assert.equal(raw.limitMiB, 250); assert.equal(raw.requestedRuns, 3);
    assert.equal(raw.progressProbe.maximumConversionMs, 21600000); assert.equal(raw.progressProbe.partialOutputStopEnabled, false);
    assert.deepEqual(raw.forbiddenRequests, []); assert.equal(raw.conversionJsReport, null);
    for (const [file, hash] of Object.entries(raw.sourceHashes)) assert.equal(hash, pins[file], file);
    for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(raw.cleanup[field], true);
    assert.ok(!raw.cleanup.errors?.length); await assert.rejects(access(raw.runtimeDirectory), { code: "ENOENT" });
    if (code === 0) { assert.equal(raw.status, "passed-private-protected-session"); assert.equal(proof.candidate.completedConversions, 3); }
    else { assert.equal(code, 1); assert.equal(raw.status, "failed"); assert.equal(typeof raw.failure?.message, "string"); }
    proof.status = "actual-full-attempt-terminal-independent-analysis-pending";
  }
} catch (error) { proof.failure = String(error.stack ?? error).slice(0, 8192); proof.status = "failed-or-incomplete"; process.exitCode = 1; console.error(proof.failure); }
finally {
  // Do not remove a live driver's scratch or kill it on observation timeout.
  if (done && child?.exitCode === null && child?.signalCode === null) await done;
  if (runtime) {
    try {
      try { await normal(); } catch {
        await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
        await normal();
      }
      proof.productionRestored = true;
    } catch (error) { proof.failure = `${proof.failure ?? ""}\nRestoration: ${error}`; proof.status = "failed-or-incomplete"; process.exitCode = 1; }
    finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); proof.wrapperAbsent = true; }
  }
}
proof.postSourcePins = {}; for (const file of files) proof.postSourcePins[file] = sha(await read(file)); assert.deepEqual(proof.postSourcePins, pins);
proof.recordedAt = new Date().toISOString();
const output = `evidence/${stamp}-single-idle-original-full${prepareOnly ? "-preparation" : "-terminal"}.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, executions: proof.executions, wrapperAbsent: proof.wrapperAbsent }));
assert.equal(proof.failure, null);
