// READ-ONLY supplement for an already running, identity-pinned original driver.
// Never start/restart a browser/conversion or touch dist. No media copies. Only
// the owning driver deletes its outputs; this process removes only its scratch.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { makeAbortableAudioValidator } from "./lib/abortable-audio-validator-recipe.mjs";
import { closedOutputProbe, isFinalOutputDecode, simpleWindowsNativeArguments } from "./lib/closed-original-output-probe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const [pidText, driverBornUtc, runtimeName] = process.argv.slice(2);
assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 5);
assert.match(pidText, /^[1-9][0-9]{0,8}$/); const driverPid = Number(pidText);
assert.match(driverBornUtc, /^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{7}Z$/);
assert.match(runtimeName, /^mpeg2-static-ui-original-runtime-[a-zA-Z0-9]{6}$/);
const profile = path.join(root, "work", runtimeName, "profile"), source = path.join(root, "test.mkv");
const expectedSourceBytes = 2958573265, expectedSourceSha256 = "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value => value.toLowerCase();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const startedAt = new Date().toISOString(), deadline = Date.now() + 24 * 60 * 60 * 1000;
const runtime = await createOwnedRuntimeScratch("original-audio-supplement-");
const runs = [], observedProbes = new Set(), sourcePins = {};
let failure = null, driverTerminalObserved = false, sourceUnchanged = false, sourceAudioCount = null;
let ownedNativeReadersAbsent = false, ownedRuntimeRemoved = false;
let guardPolls = 0, waitingPolls = 0, sourceProbe = null;

async function hashFile(file, signal) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 1024 ** 2, signal })) hash.update(chunk);
  return hash.digest("hex");
}
async function verifySource() {
  assert.equal((await lstat(source)).size, expectedSourceBytes);
  assert.equal(await hashFile(source), expectedSourceSha256);
}
async function snapshot() {
  // Only one known root and its immediate children. No disk inventories, CDP
  // commands, intrusive instrumentation or history of process snapshots.
  const command = `$rows = @(Get-CimInstance Win32_Process -Filter 'ProcessId = ${driverPid} OR ParentProcessId = ${driverPid}');\n` +
    `[pscustomobject]@{rows=@($rows | ForEach-Object { [pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;name=$_.Name;bornUtc=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine} })} | ConvertTo-Json -Depth 4 -Compress`;
  const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
  const rows = JSON.parse(stdout).rows; assert.ok(Array.isArray(rows) && rows.length <= 32);
  const driver = rows.find(row => row.pid === driverPid);
  if (!driver) return null;
  assert.equal(driver.bornUtc, driverBornUtc, "Original driver PID was reused");
  assert.equal(driver.name.toLowerCase(), "node.exe");
  const args = simpleWindowsNativeArguments(driver.commandLine);
  assert.equal(args.length, 2); assert.equal(args[1], "scripts/mpeg2-static-ui-original-memory.mjs");
  const children = rows.filter(row => row.parentPid === driverPid);
  for (const child of children) assert.ok(Date.parse(child.bornUtc) >= Date.parse(driverBornUtc));
  return { driver, children };
}
async function outputIdentity(file) {
  assert.equal(canonical(await realpath(profile)), canonical(profile), "Owned profile redirected");
  const absolute = path.resolve(file), relative = path.relative(profile, absolute);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Output must be within the live owned profile");
  assert.equal(canonical(await realpath(absolute)), canonical(absolute), "Output redirected");
  const info = await lstat(absolute, { bigint: true }); assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.ok(info.size >= BigInt(Math.floor(expectedSourceBytes / 2)), "Not a comparable-size full original output");
  return { dev: String(info.dev), ino: String(info.ino), bytes: Number(info.size), modifiedNs: String(info.mtimeNs) };
}
try {
  assert.ok(await snapshot(), "The original driver must actually be live before attaching");
  assert.equal(canonical(await realpath(profile)), canonical(profile));
  const controls = JSON.parse(await readFile(path.join(root, "evidence/abortable-audio-validator-controls-2026-10-07.json")));
  assert.equal(controls.status, "passed-native-cancellation-controls-only");
  assert.equal(controls.ownedNativeChildrenAbsent, true); assert.equal(controls.ownedScratchAndFixturesRemoved, true);
  for (const [file, digest] of Object.entries(controls.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  const validatorSource = await readFile(path.join(root, "scripts/lib/streaming-copied-audio-validation.mjs"), "utf8");
  const generated = makeAbortableAudioValidator(validatorSource, controls.sourcePins["scripts/lib/streaming-copied-audio-validation.mjs"]);
  assert.equal(sha(generated), controls.generatedValidatorSha256);
  const validatorModulePath = path.join(runtime.directory, "validator.mjs"); await writeFile(validatorModulePath, generated, { flag: "wx" });
  const { validateCopiedAudioFrames } = await import(pathToFileURL(validatorModulePath).href);
  for (const file of ["scripts/watch-original-audio-supplement.mjs", "scripts/lib/closed-original-output-probe.mjs",
    "scripts/lib/abortable-audio-validator-recipe.mjs", "scripts/lib/streaming-copied-audio-validation.mjs",
    "scripts/mpeg2-static-ui-original-memory.mjs", "scripts/mpeg2-split-single-navigation-memory.mjs"])
    sourcePins[file] = sha(await readFile(path.join(root, file)));
  assert.equal(sourcePins["scripts/mpeg2-split-single-navigation-memory.mjs"], "acb179454985fdc2167f9e463d1d720b777d4c829d313d8e3ee45fdf82ff3417");
  await verifySource();
  const { stdout } = await execute("C:/ffmpeg/bin/ffprobe.exe", ["-v", "error", "-select_streams", "a", "-show_streams", "-of", "json", source], {
    env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  sourceProbe = JSON.parse(stdout); sourceAudioCount = sourceProbe.streams.length;
  assert.ok(sourceAudioCount > 0 && sourceAudioCount <= 16);
  console.log(`Attached read-only audio supplement to original driver ${driverPid}/${driverBornUtc}; ${sourceAudioCount} source audio track(s). Waiting for genuine closed-output validation, no new conversion.`);
  while (Date.now() < deadline) {
    const state = await snapshot(); waitingPolls++;
    if (!state) { driverTerminalObserved = true; break; }
    const candidates = state.children.filter(child => closedOutputProbe(child.commandLine) !== null);
    assert.ok(candidates.length <= 1, "Ambiguous original output validation");
    const child = candidates[0], key = child ? `${child.pid}/${child.bornUtc}` : null;
    if (!child || observedProbes.has(key)) { await delay(10000); continue; }
    assert.ok(runs.length < 3); observedProbes.add(key);
    const output = closedOutputProbe(child.commandLine), before = await outputIdentity(output);
    const run = { number: runs.length + 1, observedAt: new Date().toISOString(),
      postCompletionProbe: child, outputPath: path.relative(root, output), before, after: null,
      outputSha256: null, audio: [], status: "validation-pending", failure: null };
    runs.push(run); console.log(`Observed run ${run.number} closed browser output (${before.bytes} bytes); validating every complete copied audio track.`);
    const controller = new AbortController(); let finished = false, guardFailure = null;
    const guard = (async () => {
      while (!finished) {
        await delay(1000); if (finished) break;
        const current = await snapshot(); guardPolls++;
        assert.ok(current, "Owning driver stopped during supplementary validation");
        // Stop well BEFORE SSIM, full-file hash and emptyOpfs. Never keep native
        // readers open while the owner tries to dispose of its browser output.
        assert.ok(!current.children.some(entry => isFinalOutputDecode(entry.commandLine, output)),
          "Supplementary window ended at owning driver's final full decode");
        assert.ok(!current.children.some(entry => entry.name?.toLowerCase() === "ffmpeg.exe" &&
          entry.commandLine?.includes("-filter_complex") && entry.commandLine?.includes(output)),
        "Supplementary window ended at owning driver's final SSIM");
        assert.deepEqual(await outputIdentity(output), before, "Closed output changed/replaced during validation");
      }
    })().catch(error => { guardFailure = error; controller.abort(); });
    try {
      for (let ordinal = 0; ordinal < sourceAudioCount; ordinal++) run.audio.push(await validateCopiedAudioFrames(source, output, {
        env: runtime.env, audioOrdinal: ordinal, maximumMs: 15 * 60 * 1000, signal: controller.signal }));
      run.outputSha256 = await hashFile(output, controller.signal);
      run.after = await outputIdentity(output); assert.deepEqual(run.after, before);
    } catch (error) { run.failure = { name: error.name, message: error.message }; }
    finally { finished = true; controller.abort(); await guard; }
    if (guardFailure) run.failure = { name: guardFailure.name, message: guardFailure.message };
    if (run.failure) { run.status = "failed-audio-supplement"; throw new Error(run.failure.message); }
    run.status = "passed-full-copied-audio-only";
    console.log(`Run ${run.number} supplemental full audio passed; native readers closed, ${run.audio.map(audio => audio.source.frames).join(",")} decoded frames. This does not certify browser memory/video/scaling.`);
  }
  assert.ok(driverTerminalObserved, "Bounded supplement observation deadline; never restart the original driver");
} catch (error) {
  failure = { name: error.name, message: error.message }; process.exitCode = 1;
} finally {
  const errors = [];
  try { await verifySource(); sourceUnchanged = true; } catch (error) { errors.push(String(error)); }
  // Every validation scope has already aborted and awaited both native readers.
  try {
    const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `@(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${process.pid} AND Name = 'ffmpeg.exe'").Count`], {
      env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 4096 });
    assert.equal(Number(stdout.trim()), 0, "Supplementary native readers must actually be absent");
    ownedNativeReadersAbsent = true;
  } catch (error) { errors.push(String(error)); }
  try { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); ownedRuntimeRemoved = true; }
  catch (error) { errors.push(String(error)); }
  if (errors.length) { failure ??= { name: "SupplementCleanupFailure", message: errors.join(" | ") }; process.exitCode = 1; }
  const report = { startedAt, recordedAt: new Date().toISOString(),
    status: failure ? "failed-audio-supplement" : runs.length === 3 ? "passed-three-full-copied-audio-supplements-only" : "incomplete-original-audio-supplement",
    scope: "Independent full decoded copied-audio validation of existing closed browser outputs, correlated by file identity and SHA256; never a new conversion or broad acceptance",
    source: { path: "test.mkv", bytes: expectedSourceBytes, sha256: expectedSourceSha256, audioProbe: sourceProbe },
    driver: { pid: driverPid, bornUtc: driverBornUtc, terminalObserved: driverTerminalObserved },
    requestedRuns: 3, runs, sourcePins, failure, waitingPolls, guardPolls,
    limits: { observationMs: 24 * 60 * 60 * 1000, validationMs: 15 * 60 * 1000, pollMs: 10000, activeGuardMs: 1000, hashChunkBytes: 1024 ** 2 },
    cleanup: { protectedSourceUnchanged: sourceUnchanged, ownedRuntimeRemoved,
      ownedNativeReadersAbsent, outputDisposalOwnedByOriginalDriver: true, errors },
    generatedMediaCopies: 0, browserConversionsStarted: 0, applicationOrEngineChanged: false,
    completeChromiumMemoryAcceptance: false, videoFidelityAcceptance: false, publicAcceptance: false };
  const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 32768);
  const reportPath = path.join(root, "outputs/reports", `${startedAt.replaceAll(/[:.]/g, "-")}-original-audio-supplement.json`);
  await writeFile(reportPath, json, { flag: "wx" }); console.log(`${report.status}: ${reportPath}`);
}
