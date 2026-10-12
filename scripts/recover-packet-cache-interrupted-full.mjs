// Post-interruption recovery ONLY. Never rerun a converter or fabricate peaks.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/packet-cache-layered-source-archive.mjs";
import { verifyAttemptPlaneCandidate } from "./lib/packet-cache-candidate.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const stamp = "2026-10-12T05-53-16-380Z", output = `evidence/${stamp}-packet-cache-original-full-interruption-recovery.json`;
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const livePath = `evidence/${stamp}-packet-cache-full-live.json`, liveBytes = await read(livePath), live = JSON.parse(liveBytes);
assert.equal(live.executions, 1); assert.equal(live.driverIdentity.pid, 39080); assert.equal(live.driverIdentity.parentPid, 40872);
assert.equal(live.driverIdentity.createdAt, "2026-10-12T05:54:01.1507380Z");
assert.equal(live.composition.manifest.artifacts["within-mpeg2-split.wasm"], "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
const archive = await materializeLayeredFullSourceArchive(root, live.sourceArchive);
assert.deepEqual(archive.sourcePins, live.sourcePins); assert.equal(Object.keys(archive.sourcePreimages).length, 333);
const names = ["allocation-attempt-full-runtime-ZS9EvN", "allocation-attempt-full-wrapper-FATvPa", "allocation-attempt-media-jnn5yH",
  "packet-cache-full-caller-qM4zNN", "repository-node-command-SdUt5L"];
const workRoot = await realpath(path.join(root, "work"));
assert.equal(workRoot, path.join(root, "work"));
const directories = names.map(name => path.join(workRoot, name)), identities = [];
for (const directory of directories) {
  assert.equal(path.dirname(directory), workRoot); const info = await lstat(directory, { bigint: true });
  assert.ok(info.isDirectory() && !info.isSymbolicLink()); assert.equal(await realpath(directory), directory);
  identities.push({ path: directory, dev: String(info.dev), ino: String(info.ino), birthtimeMs: Number(info.birthtimeMs) });
}
assert.equal(sha(await readFile(path.join(directories[1], "probe.mjs"))), live.sourceArchive.driverSha256);
assert.equal(sha(await readFile(path.join(directories[1], "trace-helper.mjs"))), live.sourceArchive.traceHelperSha256);
assert.equal(sha(await readFile(path.join(directories[3], "caller.mjs"))), live.sourceArchive.generatedCallerSha256);
assert.deepEqual(await verifyAttemptPlaneCandidate(root, directories[2]), live.composition.manifest);
const partialPath = path.join(directories[0], "profile/Default/File System/000/t/00/00000001");
const partialInfo = await lstat(partialPath, { bigint: true }); assert.ok(partialInfo.isFile() && !partialInfo.isSymbolicLink());
assert.equal(await realpath(partialPath), partialPath); assert.equal(Number(partialInfo.size), 1532758257);
const absentProcesses = async () => {
  // Encoded command prevents the query's own literal paths from matching itself.
  const code = `$ErrorActionPreference = 'Stop'; $ownedPaths = ${directories.map(x => "'" + x.replaceAll("'", "''") + "'").join(",")}; ` +
    "$knownPids = 39080,40872,46628,17644,22112; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object { $p = $_; ($knownPids -contains $p.ProcessId) -or ($p.CommandLine -and @($ownedPaths | Where-Object { $p.CommandLine.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count -gt 0) } | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');name=$_.Name} }) -Compress";
  const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(code, "utf16le").toString("base64")],
    { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
  const rows = JSON.parse(stdout); assert.deepEqual(rows, [], "Every known PID and exact owned-path process must be absent; never kill or infer absence from a missing session");
  return { observedAt: new Date().toISOString(), knownPids: [39080,40872,46628,17644,22112], matched: rows, noProcessesKilled: true };
};
const inventory = async directory => {
  const pending = [directory]; let files = 0, folders = 0, bytes = 0, visited = 0, latestWriteMs = 0;
  while (pending.length) {
    const current = pending.pop(); assert.ok(pending.length <= 1024);
    for (const entry of await readdir(current, { withFileTypes: true })) {
      assert.ok(++visited <= 20000); const target = path.join(current, entry.name), info = await lstat(target);
      assert.ok(!info.isSymbolicLink(), "Owned cleanup cannot follow reparse/symbolic paths");
      assert.ok(path.relative(directory, target) && !path.relative(directory, target).startsWith(".."));
      latestWriteMs = Math.max(latestWriteMs, info.mtimeMs);
      if (info.isDirectory()) { folders++; pending.push(target); }
      else { assert.ok(info.isFile()); files++; bytes += info.size; assert.ok(Number.isSafeInteger(bytes)); }
    }
  }
  return { directory, files, folders, bytes, latestWriteAt: new Date(latestWriteMs).toISOString() };
};
const original = async () => {
  const file = path.join(root, "test.mkv"); assert.equal((await stat(file)).size, 2958573265);
  const hash = createHash("sha256"); for await (const bytes of createReadStream(file, { highWaterMark: 1048576 })) hash.update(bytes);
  const digest = hash.digest("hex"); assert.equal(digest, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  return { bytes: 2958573265, sha256: digest, wholeFileReadOnly: true };
};
const runtime = await createOwnedRuntimeScratch("packet-cache-interruption-recovery-");
const proof = { recordedAt: null, status: "post-interruption-recovery-incomplete", failure: null,
  live: { path: livePath, sha256: sha(liveBytes) }, sourceArchive: live.sourceArchive, sourcePins: archive.sourcePins,
  postSourcePins: null, all333OriginalExecutedPreimagesRecovered: true, plannedDirectoryIdentities: identities,
  originalPre: null, originalPost: null, processPre: null, processPost: null, inventory: [], partial: null,
  retainedLog: null, productionRestored: false, deletedDirectories: [], recoveryRuntimeRemoved: false,
  originalRunTerminalReportAvailable: false, knownCauseOfInterruption: null, reconstructedNativePeak: null,
  stableBlankBaseline: null, nativeMemoryAcceptance: false, fidelityAcceptance: false, fullOriginalAcceptance: false,
  completedValidatedConversions: 0, browserConversionsPerformedByRecovery: 0, nativeConverterUsed: false,
  noAutomaticRelaunch: true, noProcessesKilled: true, publicAcceptance: false };
let evidenceRetained = false;
try {
  proof.processPre = await absentProcesses(); proof.originalPre = await original();
  proof.inventory = await Promise.all(directories.map(inventory));
  const args = ["-v", "error", "-show_entries", "format=format_name,duration,size:stream=index,codec_name,codec_type,width,height,duration,r_frame_rate", "-of", "json", partialPath];
  const probe = await execute("C:/ffmpeg/bin/ffprobe.exe", args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 131072 });
  const inspection = JSON.parse(probe.stdout); assert.equal(inspection.format.size, "1532758257");
  assert.equal(inspection.streams.find(row => row.index === 0).codec_name, "mpeg2video");
  assert.ok(Number(inspection.format.duration) > 0 && Number(inspection.format.duration) < 12340.096);
  proof.partial = { path: path.relative(root, partialPath).replaceAll("\\", "/"), bytes: Number(partialInfo.size),
    modifiedAt: new Date(Number(partialInfo.mtimeMs)).toISOString(), nativeProbe: inspection, fullDecodePerformed: false,
    completeOriginalDurationSeconds: 12340.096, actualMpeg2EncodedContentButIncomplete: true, convertedCopyRetained: false };
  const logPath = path.join(directories[0], "wrangler-logs/wrangler-2026-10-12_05-54-04_618.log"), log = await readFile(logPath);
  assert.ok(log.length <= 131072); const compressed = gzipSync(log, { level: 9 }); assert.deepEqual(gunzipSync(compressed), log);
  const logArchive = `outputs/reports/${stamp}-packet-cache-interruption-server-log.txt.gz`;
  await writeFile(path.join(root, logArchive), compressed, { flag: "wx" }); assert.equal(sha(await read(logArchive)), sha(compressed));
  proof.retainedLog = { path: logArchive, bytes: compressed.length, sha256: sha(compressed), restoredBytes: log.length, restoredSha256: sha(log) };
  evidenceRetained = true;
  // Restore using the exact browser-qualified stager BEFORE deleting its candidate.
  await execute(process.execPath, ["scripts/stage-packet-cache-full.mjs", "restore"], { cwd: root,
    env: { ...runtime.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: path.basename(directories[2]) }, windowsHide: true, timeout: 60000, maxBuffer: 2097152 });
  await execute(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { cwd: root, env: runtime.env,
    windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
  const app = await read("dist/client" + baselineBinding.url); assert.equal(app.length, baselineBinding.bytes); assert.equal(sha(app), baselineBinding.sha256);
  assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
  for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"])
    assert.equal(sha(await read("dist/client/engines/remux/" + file)), sha(await read("public/engines/remux/" + file)), file);
  for (const file of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
    "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
    await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
  proof.productionRestored = true;
} catch (error) { proof.failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally {
  try {
    if (evidenceRetained) {
      proof.processPost = await absentProcesses();
      for (const identity of identities) {
        const current = await lstat(identity.path, { bigint: true }); assert.equal(String(current.dev), identity.dev); assert.equal(String(current.ino), identity.ino);
        assert.ok(current.isDirectory() && !current.isSymbolicLink()); assert.equal(await realpath(identity.path), identity.path);
        assert.equal(path.dirname(identity.path), workRoot);
        await rm(identity.path, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 });
        await assert.rejects(access(identity.path), { code: "ENOENT" }); proof.deletedDirectories.push(identity.path);
      }
    }
    if (proof.originalPre) { proof.originalPost = await original(); assert.deepEqual(proof.originalPost, proof.originalPre); }
    proof.postSourcePins = (await materializeLayeredFullSourceArchive(root, live.sourceArchive)).sourcePins;
    assert.deepEqual(proof.postSourcePins, proof.sourcePins);
  } catch (error) { proof.failure = `${proof.failure ?? ""}\nRecovery cleanup: ${error.stack ?? error}`.slice(0, 12288); process.exitCode = 1; }
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); proof.recoveryRuntimeRemoved = true;
}
if (!proof.failure) proof.status = "interrupted-full-run-owned-recovery-complete-not-conversion-acceptance";
proof.recordedAt = new Date().toISOString();
const own = "scripts/recover-packet-cache-interrupted-full.mjs", ownBytes = await read(own);
proof.ownSource = { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") };
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, failure: proof.failure, removedDirectories: proof.deletedDirectories.length,
  partialBytesRemoved: proof.partial?.bytes ?? null, productionRestored: proof.productionRestored, noConversionRelaunched: true }));
assert.equal(proof.failure, null);
