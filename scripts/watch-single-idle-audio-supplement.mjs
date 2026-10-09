// Launch ONE guarded read-only watcher for the actual live run. Never restart the conversion.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { makeSingleIdleAudioSupplement, SINGLE_IDLE_LIVE_RECEIPT, SINGLE_IDLE_AUDIO_RUNTIME, singleIdleAudioFiles } from "./lib/single-idle-audio-supplement-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const prepareOnly = process.argv[2] === "--prepare-only", stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const liveBytes = await read(SINGLE_IDLE_LIVE_RECEIPT), live = JSON.parse(liveBytes);
const archiveBytes = await read(live.sourceArchive.path); assert.equal(sha(archiveBytes), live.sourceArchive.sha256);
const archivedBytes = gunzipSync(archiveBytes, { maxOutputLength: 8388608 }); assert.equal(sha(archivedBytes), live.sourceArchive.restoredSha256);
const executed = JSON.parse(archivedBytes); assert.equal(sha(executed.generated), live.sourceArchive.driverSha256);
for (const [file, hash] of Object.entries(live.sourcePins)) assert.equal(sha(await read(file)), hash, file);
const recipe = makeSingleIdleAudioSupplement((await read("scripts/watch-original-audio-supplement.mjs")).toString(), root, live, SINGLE_IDLE_AUDIO_RUNTIME);
assert.equal(sha(await readFile(recipe.driverFile)), live.sourceArchive.driverSha256);
const actualDriver = await queryProcessIdentity(live.driverIdentity.pid); assert.deepEqual(actualDriver, live.driverIdentity, "Same original owner must still be live; no restart");
// Do not attach a second watcher to this driver, even after an observation timeout.
for (const name of (await readdir(path.join(root, "evidence"))).filter(name => name.endsWith("-single-idle-audio-supplement-live.json"))) {
  const prior = JSON.parse(await read("evidence/" + name));
  assert.equal((await observeOwnedProcessExit(prior.watcherIdentity)).status, "owned-identity-absent", "A same-run audio watcher is already live");
}
const controls = JSON.parse(await read("evidence/abortable-audio-validator-controls-2026-10-07.json"));
assert.equal(controls.status, "passed-native-cancellation-controls-only");
for (const [file, hash] of Object.entries(controls.sourcePins)) assert.equal(sha(await read(file)), hash, file);
const files = [...new Set([...singleIdleAudioFiles, ...Object.keys(controls.sourcePins), "scripts/watch-original-audio-supplement.mjs",
  "scripts/lib/closed-original-output-probe.mjs", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/owned-process-exit-observation.mjs",
  "scripts/lib/host-memory-preflight.mjs"] )];
const sourcePins = {}, sourcePreimages = {};
for (const file of files) { const bytes = await read(file); assert.ok(bytes.length <= 65536);
  sourcePins[file] = sha(bytes); sourcePreimages[file] = { encoding: "base64", data: bytes.toString("base64") }; }
const proof = { recordedAt: null, status: "prepared-not-attached", executions: 0,
  originalLiveReceipt: { path: SINGLE_IDLE_LIVE_RECEIPT, sha256: sha(liveBytes) }, originalDriverIdentity: live.driverIdentity,
  originalDriverSha256: live.sourceArchive.driverSha256, originalRuntime: SINGLE_IDLE_AUDIO_RUNTIME,
  sourcePins, all203OriginalSourcePinsUnchanged: true, sourceArchive: null, hostPreflight: null,
  watcherIdentity: null, wrapper: null, wrapperAbsent: false, failure: null, watcherExitCode: null,
  actualNewConversions: 0, generatedMediaCopies: 0, applicationOrEngineChanged: false,
  originalFullAudioValidated: false, conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false };
let runtime, child, done;
try {
  proof.hostPreflight = await inspectStressHostMemory(); assert.equal(proof.hostPreflight.safeToStart, true);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, windowsHide: true, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  runtime = await createOwnedRuntimeScratch("single-idle-audio-wrapper-"); proof.wrapper = runtime.directory;
  const bytes = Buffer.from(JSON.stringify({ ...recipe, sourcePreimages })), compressed = gzipSync(bytes, { level: 9 });
  assert.ok(bytes.length <= 1048576); assert.deepEqual(gunzipSync(compressed), bytes);
  const archive = `outputs/reports/${stamp}-single-idle-audio-supplement-sources.json.gz`;
  await writeFile(path.join(root, archive), compressed, { flag: "wx" });
  proof.sourceArchive = { path: archive, bytes: compressed.length, sha256: sha(compressed), restoredBytes: bytes.length,
    restoredSha256: sha(bytes), generatedSha256: recipe.generatedSha256 };
  const script = path.join(runtime.directory, "watch.mjs"); await writeFile(script, recipe.generated, { flag: "wx" });
  if (!prepareOnly) {
    assert.deepEqual(await queryProcessIdentity(live.driverIdentity.pid), live.driverIdentity);
    child = spawn(process.execPath, [script, String(live.driverIdentity.pid), live.driverIdentity.createdAt, SINGLE_IDLE_AUDIO_RUNTIME],
      { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
    done = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => signal ? reject(new Error(`Watcher signalled ${signal}`)) : resolve(code)); });
    proof.executions = 1; proof.watcherIdentity = await queryProcessIdentity(child.pid);
    assert.ok(proof.watcherIdentity && proof.watcherIdentity.parentPid === process.pid);
    proof.status = "actual-read-only-watcher-launched-awaiting-closed-output"; proof.recordedAt = new Date().toISOString();
    const receipt = `evidence/${stamp}-single-idle-audio-supplement-live.json`;
    await writeFile(path.join(root, receipt), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ receipt, watcherIdentity: proof.watcherIdentity, originalDriverIdentity: live.driverIdentity }));
    proof.watcherExitCode = await done;
    assert.equal((await observeOwnedProcessExit(proof.watcherIdentity)).status, "owned-identity-absent");
    proof.status = "watcher-terminal-full-evidence-join-required-not-acceptance";
  }
} catch (error) { proof.failure = String(error.stack ?? error).slice(0, 8192); proof.status = "failed-or-incomplete"; process.exitCode = 1; console.error(proof.failure); }
finally {
  // The watcher owns/awaits only its native readers. Never kill the original driver.
  if (done && child?.exitCode === null && child?.signalCode === null) await done;
  if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); proof.wrapperAbsent = true; }
}
for (const [file, hash] of Object.entries(sourcePins)) assert.equal(sha(await read(file)), hash, file);
for (const [file, hash] of Object.entries(live.sourcePins)) assert.equal(sha(await read(file)), hash, file);
proof.recordedAt = new Date().toISOString();
const receipt = `evidence/${stamp}-single-idle-audio-supplement-${prepareOnly ? "preparation" : "terminal"}.json`;
await writeFile(path.join(root, receipt), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ receipt, status: proof.status, wrapperAbsent: proof.wrapperAbsent }));
assert.equal(proof.failure, null);
