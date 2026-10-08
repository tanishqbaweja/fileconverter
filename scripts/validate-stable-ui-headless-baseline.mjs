// One changed, matched-mode control. Never rerun the older headed comparison.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, readdir, realpath, stat, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { baselineBinding, compareMatchedHeadlessUi, makeStableUiHeadlessBaseline, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const referencePath = "evidence/2026-10-08T13-49-53-644Z-stable-progress-ui-headless-goldens.json";
const referenceBytes = await read(referencePath);
assert.equal(sha(referenceBytes), "948d6b1802b2aa604b39b37063313e639f7bd213b99977f34b594bfaa54bb22a");
const reference = JSON.parse(referenceBytes);
const priorProofPath = "evidence/2026-10-08T13-49-53-644Z-stable-progress-ui-headless-golden-validation.json";
const priorProofBytes = await read(priorProofPath), priorProof = JSON.parse(priorProofBytes);
const candidateCompressed = await read(priorProof.compressedReport.path);
assert.equal(sha(candidateCompressed), priorProof.compressedReport.sha256);
const candidateRaw = gunzipSync(candidateCompressed, { maxOutputLength: 2 * 1024 ** 2 });
assert.equal(sha(candidateRaw), priorProof.rawReport.sha256);
const candidateReport = JSON.parse(candidateRaw);
const executedArchive = await read(reference.generatedArchive.path);
assert.equal(sha(executedArchive), reference.generatedArchive.sha256);
const executed = JSON.parse(gunzipSync(executedArchive, { maxOutputLength: 262144 }));
for (const [file, expected] of Object.entries(reference.sourcePins)) assert.equal(sha(await read(file)), expected, file);
const sourcePins = { ...reference.sourcePins };
for (const file of ["scripts/validate-stable-ui-headless-baseline.mjs", "scripts/lib/stable-ui-headless-baseline-recipe.mjs", "tests/stable-ui-headless-baseline.test.mjs"])
  sourcePins[file] = sha(await read(file));
const assetFile = "dist/client" + baselineBinding.url;
const verifyAsset = async () => { const bytes = await read(assetFile); assert.equal(bytes.length, baselineBinding.bytes); assert.equal(sha(bytes), baselineBinding.sha256); };
await verifyAsset(); // Normal build already restored; no invented candidate build receipt.
const core = await read("work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.wasm");
assert.equal(sha(core), "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
assert.ok(!WebAssembly.Module.exports(new WebAssembly.Module(core)).some(row => row.name.startsWith("control_")));
const verifyOriginal = async () => {
  assert.equal((await stat(path.join(root, "test.mkv"))).size, 2958573265);
  const hash = createHash("sha256"); for await (const chunk of createReadStream(path.join(root, "test.mkv"))) hash.update(chunk);
  const digest = hash.digest("hex"); assert.equal(digest, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  return { bytes: 2958573265, sha256: digest };
};
const reportRoot = path.join(root, "output", "playwright"), before = new Set(await readdir(reportRoot));
let failure = null, host, launchHost, diskBytes, protectedPre, protectedPost, runtime, generated, generatedRecord, analysis;
let resultReport, rawRecord, archiveRecord, numericProcessObservation, assetsRestored = false;
let ownedWrapperAbsent = null, rawRemovedAfterLosslessArchive = false;
try {
  host = await inspectStressHostMemory(); console.log(JSON.stringify({ host })); assert.equal(host.safeToStart, true);
  const disk = await statfs(root); diskBytes = disk.bavail * disk.bsize; assert.ok(diskBytes >= 2 * 1024 ** 3);
  protectedPre = await verifyOriginal();
  runtime = await createOwnedRuntimeScratch("stable-ui-baseline-headless-");
  generated = makeStableUiHeadlessBaseline(executed, root, runtime.directory, stamp);
  for (const [name, filename] of [["spec", "candidate.spec.ts"], ["driver", "run.mjs"], ["config", "playwright.config.mjs"]])
    await writeFile(path.join(runtime.directory, filename), generated[name], { flag: "wx" });
  const archive = gzipSync(Buffer.from(JSON.stringify(generated)), { level: 9 }); assert.ok(archive.length < 32768);
  generatedRecord = { path: `outputs/reports/${stamp}-stable-ui-baseline-executed-sources.json.gz`, bytes: archive.length, sha256: sha(archive),
    hashes: Object.fromEntries(Object.entries(generated).map(([name, code]) => [name, sha(code)])) };
  await writeFile(path.join(root, generatedRecord.path), archive, { flag: "wx" });
  launchHost = await inspectStressHostMemory(); console.log(JSON.stringify({ launchHost })); assert.equal(launchHost.safeToStart, true);
  await import(pathToFileURL(path.join(runtime.directory, "run.mjs")).href);
  assert.ok(!process.exitCode, "Keep actual browser failures; no automatic retry");
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; console.error(failure); }
finally {
  try {
    if (runtime) { ownedWrapperAbsent = false; await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); ownedWrapperAbsent = true; }
    if (protectedPre) protectedPost = await verifyOriginal();
    await verifyAsset();
    for (const [file, expected] of Object.entries(priorProof.cleanup.restoredAssetHashes))
      assert.equal(sha(await read(`dist/client/engines/remux/${file}`)), expected);
    for (const file of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
      "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
      await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
    assetsRestored = true;
  } catch (error) { failure = `${failure ?? ""}\nCleanup verification: ${error.stack ?? error}`.slice(0, 12288); process.exitCode = 1; }
}
try {
  const reports = (await readdir(reportRoot)).filter(file => !before.has(file) && file.endsWith("-mpeg2-split-pipeline-37739125738-direct-artwork.json"));
  if (!failure) assert.equal(reports.length, 1);
  if (reports.length === 1) {
    const filename = reports[0]; assert.match(filename, /^[0-9TZ.:-]+-mpeg2-split-pipeline-37739125738-direct-artwork\.json$/);
    const rawPath = path.join(reportRoot, filename), identity = await lstat(rawPath, { bigint: true });
    assert.ok(identity.isFile() && !identity.isSymbolicLink()); assert.equal(await realpath(rawPath), rawPath);
    const raw = await readFile(rawPath); assert.ok(raw.length < 2 * 1024 ** 2);
    rawRecord = { path: `output/playwright/${filename}`, bytes: raw.length, sha256: sha(raw) }; resultReport = JSON.parse(raw);
    const compressed = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(compressed), raw);
    archiveRecord = { path: `outputs/reports/${stamp}-stable-ui-baseline-headless.json.gz`, bytes: compressed.length, sha256: sha(compressed) };
    await writeFile(path.join(root, archiveRecord.path), compressed, { flag: "wx" });
    assert.equal(sha(gunzipSync(await read(archiveRecord.path))), rawRecord.sha256);
    const now = await lstat(rawPath, { bigint: true }); assert.equal(now.dev, identity.dev); assert.equal(now.ino, identity.ino);
    assert.equal(sha(await readFile(rawPath)), rawRecord.sha256); await unlink(rawPath); rawRemovedAfterLosslessArchive = true;
    if (!failure) {
      const rows = kind => resultReport.rows.filter(row => row.kind === kind);
      const conversions = resultReport.rows.filter(row => !row.kind && row.status === "passed");
      assert.equal(conversions.length, 3);
      for (let i = 0; i < conversions.length; i++) {
        const a = conversions[i], b = priorProof.conversions[i];
        for (const field of ["sourceBytes", "outputBytes", "outputCodec", "frames", "audioTracks", "ssim", "outputSha256", "destination", "sourceCodec"])
          assert.deepEqual(a[field], b[field], field);
        assert.equal(a.metrics.peakPendingOperations, 1); assert.equal(a.metrics.peakWasmMemoryBytes, 50331648);
        assert.equal(a.metrics.pendingOperations, 0); assert.equal(a.metrics.queuedBytes, 0);
        assert.ok(a.metrics.maxReadChunkBytes <= 65536 && a.metrics.maxWriteChunkBytes <= 524288 && a.metrics.peakQueuedBytes <= 524288);
      }
      assert.equal(rows("actual-served-stable-ui-baseline").length, 5);
      for (const row of rows("actual-served-stable-ui-baseline")) assert.deepEqual({ url: row.url, bytes: row.bytes, sha256: row.sha256 }, baselineBinding);
      assert.equal(rows("independent-frame-diagnostic").length, 3); assert.ok(rows("independent-frame-diagnostic").every(row => row.nativeFullDecodePassed));
      assert.equal(rows("independent-decoded-audio").length, 3);
      for (const row of rows("independent-decoded-audio")) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
      for (const kind of ["direct-write-failure", "cancel-after-direct-output"]) { assert.equal(rows(kind).length, 1); assert.equal(rows(kind)[0].status, "passed"); assert.deepEqual(rows(kind)[0].partialBytes, []); }
      const inventories = resultReport.rows.filter(row => "cleanupRemovedEntries" in row); assert.equal(inventories.length, 5);
      for (const row of inventories) assert.deepEqual(row.cleanupRemovedEntries, []);
      for (const row of rows("matrix-ui-observation")) {
        const image = await read(row.screenshot.path); assert.equal(image.length, row.screenshot.bytes); assert.equal(sha(image), row.screenshot.sha256);
      }
      analysis = compareMatchedHeadlessUi(candidateReport, resultReport);
    }
    const pids = [...new Set(resultReport.rows.flatMap(row => row.samples ?? []).flatMap(sample => sample.processes ?? []).map(row => row.pid))];
    assert.ok(pids.length > 0 && pids.length <= 128);
    const query = pids.map(pid => { assert.ok(Number.isSafeInteger(pid) && pid > 0); return `ProcessId = ${pid}`; }).join(" or ");
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{pid=$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
    { windowsHide: true, timeout: 15000, maxBuffer: 131072 });
    numericProcessObservation = { recordedAt: new Date().toISOString(), observedPidCount: pids.length, current: JSON.parse(stdout), nativeBirthsUnavailable: true };
    assert.deepEqual(numericProcessObservation.current, [], "Do not kill unrelated processes or assume numeric PID reuse; inspect if any remain");
  }
} catch (error) { failure = `${failure ?? ""}\nReport verification: ${error.stack ?? error}`.slice(0, 16384); process.exitCode = 1; console.error(failure); }
const postSourcePins = {};
for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await read(file));
assert.deepEqual(postSourcePins, sourcePins);
const proof = { recordedAt: new Date().toISOString(), status: failure ? "failed-or-incomplete" : analysis?.matchingHeadlessGeometryAccepted ? "matched-headless-geometry-and-five-goldens-passed" : "five-goldens-passed-geometry-not-equivalent",
  failure, reference: { path: referencePath, sha256: sha(referenceBytes) }, candidateValidation: { path: priorProofPath, sha256: sha(priorProofBytes) },
  sourcePins, postSourcePins, hostPreflight: host ?? null, launchHostPreflight: launchHost ?? null, diskPreflightBytes: diskBytes ?? null,
  protectedPre: protectedPre ?? null, protectedPost: protectedPost ?? null, actualBaselineAsset: baselineBinding, generatedArchive: generatedRecord ?? null,
  rawReport: rawRecord ?? null, compressedReport: archiveRecord ?? null, rawRemovedAfterLosslessArchive,
  bytesSaved: archiveRecord ? rawRecord.bytes - archiveRecord.bytes : 0, analysis: analysis ?? null,
  screenshots: resultReport?.rows.filter(row => row.kind === "matrix-ui-observation").map(row => row.screenshot) ?? [],
  cleanup: { ownedWrapper: runtime?.directory ?? null, ownedWrapperAbsent, assetsRestored, numericProcessObservation: numericProcessObservation ?? null },
  compiledCoreSha256: sha(core),
  browserMode: "headless", subprocessWindowsHidden: true, headedManualValidation: false, visualReviewPending: true,
  conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false, publicAcceptance: false };
const proofPath = `evidence/${stamp}-stable-ui-headless-baseline.json`;
await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, status: proof.status, maximumGeometryDelta: analysis?.maximumDeltaCssPixels, cleanup: proof.cleanup }));
assert.equal(failure, null);
