// ONE explicit three-repeat private stress session; no automatic retry/publication.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readdir, realpath, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { makeAiffId3StressRecipe } from "./lib/aiff-id3-stress-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), mode = process.argv[2];
assert.equal(process.argv.length, 3); assert.ok(["sync-opfs", "direct-handle"].includes(mode));
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), proofPath = `evidence/${stamp}-aiff-id3-${mode}-stress.json`;
const execute = promisify(execFile), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(path.join(root, file));
const hashFile = async file => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file, { highWaterMark: 1048576 })) hash.update(chunk); return hash.digest("hex"); };
const buildPath = "evidence/aiff-id3-specialist-build-37998603437.json", buildBytes = await read(buildPath), build = JSON.parse(buildBytes);
assert.equal(build.run.conclusion, "success"); assert.equal(build.actualWasmLimitsIndependentlyVerified, true);
const tools = path.join(root, "work/aiff-id3-specialist-37998603437");
for (const row of build.files) assert.equal(await hashFile(path.join(tools, row.file)), row.sha256);
const sources = ["scripts/validate-aiff-id3-stress.mjs", "scripts/lib/aiff-id3-stress-recipe.mjs", "scripts/memory-profile.mjs",
  "scripts/lib/parallel-memory-observer.mjs", "scripts/lib/native-memory-peaks.mjs", "scripts/lib/native-memory-history.mjs",
  "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/chromium-private-memory.mjs", "scripts/lib/windows-tree-monitor.cs",
  "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/owned-process-exit-observation.mjs",
  "public/engines/remux/build-manifest.json", "workers/media-remux.ts", "app/converter/ConverterApp.tsx"];
const sourcePins = {}; for (const file of sources) sourcePins[file] = sha(await read(file));
const runtime = await createOwnedRuntimeScratch("aiff-id3-stress-");
const reportDirectory = path.join(root, "outputs/reports", path.basename(runtime.directory));
const env = { ...runtime.env, WITHIN_RUN_COUNT: "3", WITHIN_DESTINATION_MODE: mode, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" };
const native = async (args, probe = false) => (await execute(probe ? "C:/ffmpeg/bin/ffprobe.exe" : "C:/ffmpeg/bin/ffmpeg.exe", args,
  { cwd: root, env, windowsHide: true, timeout: 120000, maxBuffer: 1048576 })).stdout;
const archive = async (label, bytes) => {
  assert.ok(bytes.length <= 16 * 1024 ** 2); const gzip = gzipSync(bytes, { level: 9 }); assert.deepEqual(gunzipSync(gzip), bytes);
  const file = `outputs/reports/${stamp}-aiff-id3-${mode}-${label}.gz`;
  await writeFile(path.join(root, file), gzip, { flag: "wx" }); assert.deepEqual(gunzipSync(await read(file)), bytes);
  return { path: file, bytes: gzip.length, sha256: sha(gzip), restoredBytes: bytes.length, restoredSha256: sha(bytes) };
};
let host = null, diskBytes = null, fixtureEvidence = null, generated = null, executedSource = null, runner, identity, absence = null, helperProof = null, report = null, failure = null, assetsRestored = false, reportIdentity = null;
const staged = [], retainedReports = [];
try {
  host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true);
  const disk = await statfs(root); diskBytes = disk.bavail * disk.bsize; assert.ok(diskBytes >= 1073741824);
  const cover = path.join(runtime.directory, "cover.png"), fixture = path.join(runtime.directory, "large-artwork.m4a");
  const artFixture = path.join(root, "fixtures/media/audio-source-artwork.m4a");
  assert.equal(await hashFile(artFixture), "d635822fd1cf6d88596e7b86e0a06db2529d112a81097a246bac863b9d19682a");
  await native(["-v", "error", "-i", artFixture, "-map", "0:v:0", "-c:v", "copy", cover]);
  const coverBytes = await readFile(cover); assert.equal(coverBytes.length, 178);
  assert.equal(sha(coverBytes), "a2c9b09a676abe1df460620135bd1d889ddfb84de2f665b08c95374ec10564f0");
  const tags = { title: "Within deterministic ALAC stress fixture", artist: "Émile / कलाकार", album: "Album naïf", genre: "Essai", date: "2026", track: "3/9", comment: "αβγ & <texte>" };
  await native(["-v", "error", "-nostdin", "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=424242:d=800",
    "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=424243:d=800", "-i", cover,
    "-filter_complex", "[0:a][1:a]amerge=inputs=2[a]", "-map", "[a]", "-map", "2:v:0", "-t", "800", "-threads", "1",
    "-c:a", "alac", "-sample_fmt", "s16p", "-min_prediction_order", "4", "-max_prediction_order", "4",
    "-c:v", "copy", "-disposition:v:0", "attached_pic", ...Object.entries(tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
    "-metadata:s:a:0", "language=eng", "-fflags", "+bitexact", "-flags:a", "+bitexact", fixture]);
  const fixtureBytes = (await stat(fixture)).size; assert.ok(fixtureBytes >= 128 * 1024 ** 2 && fixtureBytes <= 160 * 1024 ** 2);
  const probe = JSON.parse(await native(["-v", "error", "-show_streams", "-show_format", "-of", "json", fixture], true));
  const audio = probe.streams.filter(stream => stream.codec_type === "audio"), art = probe.streams.filter(stream => stream.disposition?.attached_pic === 1);
  assert.equal(audio.length, 1); assert.equal(audio[0].codec_name, "alac"); assert.equal(audio[0].sample_rate, "48000"); assert.equal(audio[0].channels, 2);
  assert.equal(art.length, 1); assert.equal(art[0].codec_name, "png"); assert.equal(art[0].width, 64); assert.equal(art[0].height, 64);
  assert.equal(Number(probe.format.duration), 800); for (const [key, value] of Object.entries(tags)) assert.equal(probe.format.tags[key], value);
  const decoded = await native(["-v", "error", "-i", fixture, "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash", "-hash", "sha256", "-"]);
  const pcm = /SHA256=([0-9a-f]{64})/i.exec(decoded)?.[1]; assert.equal(pcm, "0a7c4781b220b2d06fc42201618bdce6ea12ccce9fd6ed570de999baafe4e7ff");
  fixtureEvidence = { bytes: fixtureBytes, sha256: await hashFile(fixture), durationSeconds: 800, losslessPcmReference: true, decodedPcmSha256: pcm, probe,
    artwork: { codec: "png", width: 64, height: 64, bytes: 178, sha256: sha(coverBytes) }, expectedTags: { ...tags, author: tags.artist } };
  await writeFile(fixture + ".json", JSON.stringify(fixtureEvidence), { flag: "wx" });
  generated = makeAiffId3StressRecipe((await read("scripts/memory-profile.mjs")).toString(), root, runtime.directory);
  await mkdir(reportDirectory); reportIdentity = await lstat(reportDirectory, { bigint: true });
  assert.ok(reportIdentity.isDirectory() && !reportIdentity.isSymbolicLink()); assert.equal(await realpath(reportDirectory), reportDirectory);
  executedSource = await archive("executed-source.mjs", Buffer.from(generated.generated));
  const target = path.join(runtime.directory, "run.mjs"); await writeFile(target, generated.generated, { flag: "wx" });
  for (const name of ["within-aiff.mjs", "within-aiff.wasm"]) {
    const file = path.join(root, "dist/client/engines/remux", name), backup = path.join(runtime.directory, "original-" + name);
    const info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink());
    const originalSha256 = await hashFile(file); assert.equal(originalSha256, await hashFile(path.join(root, "public/engines/remux", name)));
    await copyFile(file, backup, constants.COPYFILE_EXCL); staged.push({ file, backup, originalSha256 });
    await copyFile(path.join(tools, name), file); assert.equal(await hashFile(file), build.files.find(row => row.file === name).sha256);
  }
  const launchHost = await inspectStressHostMemory(); assert.equal(launchHost.safeToStart, true);
  runner = spawn(process.execPath, [target, fixture, "m4a-to-aiff", fixture + ".json"], { cwd: root, env, windowsHide: true, stdio: "inherit" });
  identity = await queryProcessIdentity(runner.pid); assert.ok(identity && identity.parentPid === process.pid);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Private stress timeout; do not retry automatically")), 360000);
    runner.once("error", error => { clearTimeout(timer); reject(error); });
    runner.once("exit", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`Private stress child exit ${code}`)); });
  });
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; console.error(failure); }
finally {
  try {
    if (runner?.pid && runner.exitCode === null && runner.signalCode === null) {
      const current = await queryProcessIdentity(runner.pid);
      assert.ok(current && identity && current.parentPid === identity.parentPid && Math.abs(Date.parse(current.createdAt) - Date.parse(identity.createdAt)) < 1);
      await execute("taskkill.exe", ["/PID", String(runner.pid), "/T", "/F"], { windowsHide: true, timeout: 10000 });
    }
    if (identity) { absence = await observeOwnedProcessExit(identity); assert.equal(absence.status, "owned-identity-absent"); }
    try { helperProof = JSON.parse(await readFile(path.join(runtime.directory, "helper-identities.json"))); } catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const name of reportIdentity ? await readdir(reportDirectory) : []) if (name.includes("m4a-to-aiff") && /\.(json|csv|html)$/.test(name)) {
      const info = await lstat(path.join(reportDirectory, name)); assert.ok(info.isFile() && !info.isSymbolicLink());
      const bytes = await readFile(path.join(reportDirectory, name)); retainedReports.push(await archive(name, bytes));
      if (name.endsWith(".json")) { assert.equal(report, null); report = JSON.parse(bytes); }
    }
    if (!failure) {
      assert.ok(helperProof && report && report.passed); assert.equal(report.runs.length, 3); assert.equal(report.cancellationCheck.passed, true);
      assert.equal(report.incrementalPrivateMiB, (report.peakPrivateBytes - report.blankBaseline.privateBytes) / 1048576);
      assert.ok(report.incrementalPrivateMiB <= 250); assert.deepEqual(helperProof.forbiddenRequests, []);
      for (const row of helperProof.launches) assert.equal(row.absence.status, "owned-identity-absent");
      for (const row of report.runs) { assert.ok(row.mediaProbe.withinValidation.passed); assert.ok(row.mediaProbe.withinArtworkValidation.passed); assert.equal(row.peakWasmMemoryBytes, 16777216); }
    }
  } catch (error) { failure = `${failure ?? ""}\nTerminal inspection: ${error.stack ?? error}`.slice(0, 12288); process.exitCode = 1; }
  finally {
    try {
      for (const row of staged) { assert.equal(await hashFile(row.backup), row.originalSha256); await copyFile(row.backup, row.file); assert.equal(await hashFile(row.file), row.originalSha256); }
      assetsRestored = true; for (const [file, hash] of Object.entries(sourcePins)) assert.equal(sha(await read(file)), hash);
    } finally {
      try {
        if (reportIdentity) {
          const current = await lstat(reportDirectory, { bigint: true });
          assert.equal(current.dev, reportIdentity.dev); assert.equal(current.ino, reportIdentity.ino);
          assert.ok(current.isDirectory() && !current.isSymbolicLink()); assert.equal(await realpath(reportDirectory), reportDirectory);
          assert.equal(path.dirname(reportDirectory), path.join(root, "outputs/reports")); await rm(reportDirectory, { recursive: true });
          await assert.rejects(access(reportDirectory), { code: "ENOENT" });
        }
      } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
    }
  }
}
await writeFile(path.join(root, proofPath), JSON.stringify({ recordedAt: new Date().toISOString(), status: failure ? "failed-or-incomplete-private-stress" : "passed-three-private-aiff-stress-repeats-and-cancellation",
  failure, mode, sourcePins, buildProof: { path: buildPath, sha256: sha(buildBytes) }, fixture: fixtureEvidence, host, diskBytes,
  recipeBaseSha256: generated?.baseSha256 ?? null, recipeGeneratedSha256: generated?.generatedSha256 ?? null, executedSource, retainedReports,
  reportSummary: report ? { passed: report.passed ?? false, checks: report.checks ?? null, runs: report.runs ?? report.completedRuns ?? [], blankBaseline: report.blankBaseline,
    loadedIdle: report.loadedIdle, incrementalPrivateMiB: report.incrementalPrivateMiB ?? null, nativeMemory: report.nativeMemory, cancellation: report.cancellationCheck, failure: report.failure ?? null } : null,
  helperProof, runner: { identity, absence }, assetsRestored, ownedRuntime: runtime.directory, ownedRuntimeRemoved: true, ownedRawReportDirectory: reportDirectory, ownedRawReportsRemoved: true,
  protectedOriginalRead: false, browserMode: "headless", subprocessWindowsHidden: true, nativeToolsOnlyFixturesAndValidation: true, noDocker: true,
  publicAcceptance: false, multiGigabyteScalingAcceptance: false, speedImprovementProven: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, status: failure ? "failed" : "passed", failure, mode, completeRepeats: report?.runs?.length ?? 0, assetsRestored, ownedRuntimeRemoved: true }));
