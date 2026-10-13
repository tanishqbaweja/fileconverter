// One-off independent evidence/cleanup and fresh sequential matched timing pair.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectLargestIdleMediaReport } from "./lib/packet-largest-idle-media-recipe.mjs";
import { inspectInputReadMediaReport } from "./lib/input-read-media-recipe.mjs";
assert.equal(process.argv.length, 3);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const baselinePath = process.argv[2]; assert.match(baselinePath, /^evidence\/2026-10-13T[0-9-]+Z-input-read-media\.json$/);
const candidatePath = "evidence/2026-10-13T00-57-52-406Z-packet-largest-idle-media.json";
const output = "evidence/2026-10-13-largest-idle-browser-qualification-and-timing-pair.json";
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
async function restore(record, limit) {
  assert.equal(path.dirname(path.resolve(root, record.path)), path.join(root, "outputs/reports"));
  const compressed = await read(record.path); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const bytes = gunzipSync(compressed, { maxOutputLength: limit }); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return bytes;
}
const records = [], identities = [], disposableRaw = [];
for (const [file, inspect, sourceCount] of [[candidatePath, inspectLargestIdleMediaReport, 210], [baselinePath, inspectInputReadMediaReport, 162]]) {
  const receiptBytes = await read(file), receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.failure, null); assert.equal(receipt.analysis.genuineValidatedConversions, 4);
  assert.equal(Object.keys(receipt.sourcePins).length, sourceCount); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  const executed = JSON.parse(await restore(receipt.generatedArchive, 8388608)); assert.deepEqual(executed.sourcePins, receipt.sourcePins);
  for (const [source, hash] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(executed.sources[source]), hash, source); assert.equal(sha(await read(source)), hash, source);
  }
  const rawBytes = await restore(receipt.report.archive, 2097152); assert.equal(sha(rawBytes), receipt.report.sha256);
  const report = JSON.parse(rawBytes), baseline = JSON.parse(await read(receipt.baseline.path)).reports[0].report;
  const analysis = inspect(report, baseline, JSON.parse(await read(receipt.build.path))); assert.deepEqual(analysis, receipt.analysis);
  assert.ok(rawBytes.toString().includes("554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27"));
  assert.deepEqual(receipt.protectedPre, receipt.protectedPost);
  assert.equal(receipt.protectedPost.bytes, 2958573265);
  assert.equal(receipt.protectedPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for (const key of ["ownedWrapperAbsent", "privateAdditionsAbsent", "normalAppAndCssUnchanged"]) assert.equal(receipt.cleanup[key], true);
  assert.deepEqual(receipt.cleanup.newFixtureDirsRemaining, []); await assert.rejects(access(receipt.cleanup.ownedWrapper), { code: "ENOENT" });
  const helpers = receipt.cleanup.helpers; assert.equal(sha(await read(helpers.path)), helpers.sha256); assert.equal(helpers.runtimeAbsent, true);
  await assert.rejects(access(helpers.runtime), { code: "ENOENT" });
  for (const row of helpers.launchRecords) { assert.equal(row.absence.status, "owned-identity-absent"); identities.push(row.identity); }
  const config = (await import("data:text/javascript;base64," + Buffer.from(executed.generated.config).toString("base64"))).default;
  assert.equal(config.use.headless, true); assert.equal(config.retries, 0);
  const target = path.resolve(root, receipt.report.path); assert.equal(path.dirname(target), path.join(root, "output/playwright"));
  assert.match(path.basename(target), /^2026-10-13T[0-9:.TZ-]+-packet-cache-media-[A-Za-z0-9]+-direct-artwork\.json$/);
  assert.deepEqual(await readFile(target), rawBytes); const identity = await lstat(target, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
  disposableRaw.push({ target, identity, bytes: rawBytes.length, sha256: sha(rawBytes), archive: receipt.report.archive });
  records.push({ receipt: { path: file, sha256: sha(receiptBytes) }, sourceCount, sourceArchive: receipt.generatedArchive,
    reportArchive: receipt.report.archive, helpers: { path: helpers.path, sha256: helpers.sha256 }, analysis,
    manifest: report.manifest, browserConfig: config.use, protectedWholePrePostUnchanged: true, ownedScratchAbsent: true });
}
const [candidate, baseline] = records; assert.deepEqual(candidate.browserConfig, baseline.browserConfig);
assert.equal(candidate.manifest.artifacts["within-mpeg2-split.wasm"], "7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439");
assert.equal(baseline.manifest.artifacts["within-mpeg2-split.wasm"], "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
for (const key of ["split-encoder.wasm", "split-encoder.mjs", "within-mpeg2-split.mjs"]) assert.equal(candidate.manifest.artifacts[key], baseline.manifest.artifacts[key]);
const phases = row => [row.analysis.previous.normal, ...row.analysis.previous.recovery.results.map(value => value.analysis), row.analysis.validatedInputFailureRecovery];
const a = phases(candidate), b = phases(baseline), cases = ["normal", "write-recovery", "cancel-recovery", "read-recovery"].map((phase, index) => {
  for (const key of ["input", "nativeConfiguration", "inputDimensions", "outputDimensions", "frames", "outputBytes", "ordinalSsim", "bitRate", "qualityThreshold"]) assert.deepEqual(a[index][key], b[index][key], key);
  assert.ok(a[index].elapsedMs > 0 && b[index].elapsedMs > 0);
  return { phase, baselineElapsedMs: b[index].elapsedMs, candidateElapsedMs: a[index].elapsedMs,
    candidateOverBaseline: a[index].elapsedMs / b[index].elapsedMs, inputSha256: a[index].input.sha256, outputBytes: a[index].outputBytes,
    outputSha256: "554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27", frames: 96, ordinalSsim: a[index].ordinalSsim };
});
const controlPath = "evidence/2026-10-13T00-53-07-022Z-packet-largest-idle-abort-control.json", controlBytes = await read(controlPath), control = JSON.parse(controlBytes);
assert.equal(sha(controlBytes), "2539d7f99dfbd409aa7e86cc0dbdcbddea51e5a4280e32914e16d5a2ec50560f");
assert.equal(control.status, "passed-synthetic-abort-control"); identities.push(...control.nativeIdentities);
const unique = [...new Map(identities.map(row => [`${row.pid}:${row.createdAt}`, row])).values()];
const script = "$ErrorActionPreference='Stop'; $taskPids=" + [...new Set(unique.map(row => row.pid))].join(",") +
  "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$taskPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
  { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout), checks = unique.map(identity => {
  const process = current.find(row => row.pid === identity.pid) ?? null;
  assert.ok(process === null || Math.abs(Date.parse(process.createdAt) - Date.parse(identity.createdAt)) >= 1);
  return { identity, current: process, ownedBirthAbsent: true };
});
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"])
  assert.equal(sha(await read("dist/client/engines/remux/" + file)), sha(await read("public/engines/remux/" + file)));
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const hash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) hash.update(chunk);
assert.equal(hash.digest("hex"), "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
for (const row of disposableRaw) {
  const info = await lstat(row.target, { bigint: true }); assert.equal(info.dev, row.identity.dev); assert.equal(info.ino, row.identity.ino);
  assert.equal(sha(await readFile(row.target)), row.sha256); await unlink(row.target); await assert.rejects(access(row.target), { code: "ENOENT" });
}
const own = "scripts/verify-largest-idle-browser-evidence.mjs", ownBytes = await read(own);
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(),
  status: "changed-decoder-four-browser-goldens-qualified-fresh-sequential-timing-pair-not-full-acceptance",
  records, control: { path: controlPath, sha256: sha(controlBytes) }, cases, ownedBirthExitChecks: checks,
  benchmarkDesign: "One fresh candidate session followed by one fresh baseline session, four different recovery phases each; same source hashes/encoder/settings/configuration and independent output validation. Not randomized, not three full-source repeated runs or statistically proven speedup.",
  speedGainProven: false, peakIncrementalPrivateMiB: null, completeChromiumMemoryAcceptance: false,
  actualPacketMallocFailureReproduced: false, originalFullConversionAcceptance: false, publicAcceptance: false,
  removedRedundantRawJsonBytes: disposableRaw.reduce((sum, row) => sum + row.bytes, 0), losslessRawArchivesRetained: true,
  protectedOriginalWholeSha256Verified: true, noProcessesKilled: true,
  next: "Changed full-original harness using qualified7bb decoder and packet-path diagnostics; retain full quality, complete-tree250MiB, three validated runs, protected whole hash and finally cleanup. Do not claim speed from this limited pair.",
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCounts: records.map(row => row.sourceCount), cases, ownedBirthsAbsent: checks.length,
  removedRawJsonBytes: disposableRaw.reduce((sum, row) => sum + row.bytes, 0), speedGainProven: false }));
