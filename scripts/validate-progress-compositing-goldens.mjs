// ONE changed UI correctness suite. Same JS transport, codecs, quality and buffers.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeProgressCompositingGoldens, compareProgressCompositingUi } from "./lib/progress-compositing-golden-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), exec = promisify(execFile);
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));
const prepareOnly = process.argv[2] === "--prepare", stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const baselinePath = "evidence/2026-10-08T21-50-57-923Z-stable-ui-headless-baseline.json", baselineBytes = await read(baselinePath), baseline = JSON.parse(baselineBytes);
assert.equal(baseline.status, "matched-headless-geometry-and-five-goldens-passed");
const baselineGzip = await read(baseline.compressedReport.path); assert.equal(sha(baselineGzip), baseline.compressedReport.sha256);
const baselineRaw = gunzipSync(baselineGzip, { maxOutputLength: 2097152 }); assert.equal(sha(baselineRaw), baseline.rawReport.sha256);
const baselineReport = JSON.parse(baselineRaw);
const referenceBytes = await read(baseline.reference.path); assert.equal(sha(referenceBytes), baseline.reference.sha256);
const reference = JSON.parse(referenceBytes), executedGzip = await read(reference.generatedArchive.path);
assert.equal(sha(executedGzip), reference.generatedArchive.sha256);
const executed = JSON.parse(gunzipSync(executedGzip, { maxOutputLength: 262144 }));
const priorBytes = await read(baseline.candidateValidation.path); assert.equal(sha(priorBytes), baseline.candidateValidation.sha256);
const prior = JSON.parse(priorBytes), normalCss = await read("dist/client/assets/index-CIzbeB0A.css");
const referenceBuildPath = "evidence/2026-10-09T15-22-00-000Z-progress-compositing-build.json";
const referenceBuildBytes = await read(referenceBuildPath), referenceBuild = JSON.parse(referenceBuildBytes);
const referenceCssGzip = await read(referenceBuild.cssArchive.path); assert.equal(sha(referenceCssGzip), referenceBuild.cssArchive.sha256);
const referenceCss = gunzipSync(referenceCssGzip, { maxOutputLength: 1048576 });
const sourcePins = { ...baseline.sourcePins };
for (const file of ["scripts/validate-progress-compositing-goldens.mjs", "scripts/lib/progress-compositing-golden-recipe.mjs", "tests/progress-compositing-goldens.test.mjs",
  "scripts/build-progress-compositing-candidate.mjs", "scripts/lib/progress-compositing-recipe.mjs", "tests/progress-compositing.test.mjs",
  "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/host-memory-preflight.mjs", "AGENTS.md"])
  sourcePins[file] = sha(await read(file));
for (const [file, hash] of Object.entries(sourcePins)) assert.equal(sha(await read(file)), hash, file);
// Retain all executed source preimages rather than requiring the repo never evolve.
const pinnedSources = {};
for (const file of Object.keys(sourcePins)) pinnedSources[file] = (await read(file)).toString();
if (prepareOnly) {
  const value = makeProgressCompositingGoldens(executed, root, path.join(root, "work", "progress-compositing-PREPARATION-ONLY"), stamp,
    referenceBuild.asset, referenceBuild.stylesheet, referenceCss);
  const file = `evidence/${stamp}-progress-compositing-golden-preparation.json`;
  await writeFile(path.join(root, file), JSON.stringify({ status: "prepared-not-executed", sourcePins, baselinePath,
    referenceBuild: { path: referenceBuildPath, sha256: sha(referenceBuildBytes) }, app: referenceBuild.asset, stylesheet: value.stylesheetBinding,
    specSha256: sha(value.spec), driverSha256: sha(value.driver), specPatches: value.patches.length, driverPatches: value.driverPatches.length,
    browserLaunches: 0, conversions: 0, headless: true, windowsHidden: true, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file, status: "prepared-not-executed" }));
} else {
  const original = async () => {
    assert.equal((await stat(path.join(root, "test.mkv"))).size, 2958573265);
    const hash = createHash("sha256"); for await (const chunk of createReadStream(path.join(root, "test.mkv"))) hash.update(chunk);
    const digest = hash.digest("hex"); assert.equal(digest, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
    return { bytes: 2958573265, sha256: digest };
  };
  const reportRoot = path.join(root, "output/playwright"), before = new Set(await readdir(reportRoot));
  let host, launchHost, diskBytes, protectedPre, protectedPost, runtime, build, generated, generatedRecord, reportRecord, report, analysis, failure = null;
  let restored = false, wrapperAbsent = null, pidsAbsent = null, helperIdentities = null;
  const buildProofPath = `evidence/${stamp}-progress-compositing-build.json`;
  const archive = async (suffix, bytes) => {
    assert.ok(bytes.length < 8388608);
    const compressed = gzipSync(bytes, { level: 9 }), file = `outputs/reports/${stamp}-progress-compositing-${suffix}.gz`;
    assert.deepEqual(gunzipSync(compressed), bytes); await writeFile(path.join(root, file), compressed, { flag: "wx" });
    const saved = await read(file); assert.deepEqual(saved, compressed); assert.deepEqual(gunzipSync(saved), bytes);
    return { path: file, bytes: compressed.length, sha256: sha(compressed), restoredBytes: bytes.length, restoredSha256: sha(bytes) };
  };
  try {
    host = await inspectStressHostMemory(); console.log(JSON.stringify({ host })); assert.equal(host.safeToStart, true);
    const disk = await statfs(root); diskBytes = disk.bavail * disk.bsize; assert.ok(diskBytes >= 2147483648);
    protectedPre = await original(); runtime = await createOwnedRuntimeScratch("progress-compositing-goldens-");
    await exec(process.execPath, ["scripts/build-progress-compositing-candidate.mjs", stamp, "--for-browser"],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
    build = JSON.parse(await read(buildProofPath)); assert.equal(build.forBrowser, true);
    assert.deepEqual(build.asset, referenceBuild.asset); assert.deepEqual(build.stylesheet, referenceBuild.stylesheet);
    const actualCss = await read("dist/client" + build.stylesheet.url); assert.deepEqual(actualCss, referenceCss);
    generated = makeProgressCompositingGoldens(executed, root, runtime.directory, stamp, build.asset, build.stylesheet, actualCss);
    for (const [name, filename] of [["spec", "candidate.spec.ts"], ["driver", "run.mjs"], ["config", "playwright.config.mjs"]])
      await writeFile(path.join(runtime.directory, filename), generated[name], { flag: "wx" });
    generatedRecord = await archive("golden-executed-sources.json", Buffer.from(JSON.stringify({ ...generated, pinnedSources })));
    launchHost = await inspectStressHostMemory(); console.log(JSON.stringify({ launchHost })); assert.equal(launchHost.safeToStart, true);
    await import(pathToFileURL(path.join(runtime.directory, "run.mjs")).href);
    assert.ok(!process.exitCode, "Preserve actual browser failure; no automatic retry");
  } catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; console.error(failure); }
  finally {
    try {
      if (runtime) {
        await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"],
          { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
        const normal = await read("dist/client" + baselineBinding.url); assert.equal(sha(normal), baselineBinding.sha256); assert.equal(normal.length, baselineBinding.bytes);
        assert.deepEqual(await read("dist/client/assets/index-CIzbeB0A.css"), normalCss);
        for (const [file, hash] of Object.entries(prior.cleanup.restoredAssetHashes)) assert.equal(sha(await read("dist/client/engines/remux/" + file)), hash);
        for (const file of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
          "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs",
          "mpeg2-split-copy-kernel.mjs", "mpeg2-split-copy.wasm"])
          await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
        restored = true;
      }
      if (protectedPre) protectedPost = await original();
    } catch (error) { failure = `${failure ?? ""}\nRestoration: ${error.stack ?? error}`.slice(0, 12288); process.exitCode = 1; }
    finally { if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); wrapperAbsent = true; } }
  }
  try {
    if (generated) {
      const bytes = await read(generated.launchPath); helperIdentities = { path: generated.launchPath, sha256: sha(bytes), ...JSON.parse(bytes) };
      assert.equal(helperIdentities.launchRecords.length, 2); assert.equal(helperIdentities.runtimeAbsent, true);
      for (const row of helperIdentities.launchRecords) assert.equal(row.absence.status, "owned-identity-absent");
    }
    const reports = (await readdir(reportRoot)).filter(file => !before.has(file) && file.endsWith("-mpeg2-split-pipeline-37739125738-direct-artwork.json"));
    if (!failure) assert.equal(reports.length, 1);
    if (reports.length === 1) {
      const raw = await readFile(path.join(reportRoot, reports[0])); assert.ok(raw.length < 2097152); report = JSON.parse(raw);
      reportRecord = { rawPath: `output/playwright/${reports[0]}`, rawBytes: raw.length, rawSha256: sha(raw), archive: await archive("golden-report.json", raw) };
      // Raw retained until independent validation; never speculative cleanup of older reports.
      const rows = kind => report.rows.filter(row => row.kind === kind), conversions = report.rows.filter(row => !row.kind && row.status === "passed");
      if (!failure) {
        const expected = baselineReport.rows.filter(row => !row.kind && row.status === "passed"); assert.equal(conversions.length, 3);
        for (let i = 0; i < 3; i++) {
          for (const field of ["sourceBytes", "outputBytes", "outputCodec", "frames", "audioTracks", "ssim", "timestampAlignedSsim", "outputSha256",
            "destination", "sourceCodec", "audioPacketHashes", "sourceFrameTimes", "outputFrameTimes", "warnings"])
            assert.deepEqual(conversions[i][field], expected[i][field], field);
          const metrics = conversions[i].metrics; assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.peakWasmMemoryBytes, 50331648);
          assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
          assert.ok(metrics.maxReadChunkBytes <= 65536 && metrics.maxWriteChunkBytes <= 524288 && metrics.peakQueuedBytes <= 524288);
        }
        assert.equal(rows("actual-served-progress-compositing-candidate").length, 5);
        for (const row of rows("actual-served-progress-compositing-candidate")) assert.deepEqual({ url: row.url, bytes: row.bytes, sha256: row.sha256 }, build.asset);
        assert.equal(rows("independent-frame-diagnostic").length, 3); assert.ok(rows("independent-frame-diagnostic").every(row => row.nativeFullDecodePassed));
        assert.equal(rows("independent-decoded-audio").length, 3);
        for (const row of rows("independent-decoded-audio")) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
        for (const kind of ["direct-write-failure", "cancel-after-direct-output"]) {
          assert.equal(rows(kind).length, 1); assert.equal(rows(kind)[0].status, "passed"); assert.deepEqual(rows(kind)[0].partialBytes, []);
        }
        const inventories = report.rows.filter(row => "cleanupRemovedEntries" in row); assert.equal(inventories.length, 5);
        for (const row of inventories) assert.deepEqual(row.cleanupRemovedEntries, []);
        for (const row of rows("matrix-ui-observation")) {
          const bytes = await read(row.screenshot.path); assert.equal(sha(bytes), row.screenshot.sha256); assert.equal(bytes.length, row.screenshot.bytes);
        }
        analysis = compareProgressCompositingUi(report, baselineReport, generated.stylesheetBinding, normalCss, generated.historicMatrixCss);
        assert.equal(analysis.matchingHeadlessGeometryAccepted, true);
      }
      const pids = [...new Set(report.rows.flatMap(row => row.samples ?? []).flatMap(sample => sample.processes ?? []).map(row => row.pid))];
      assert.ok(pids.length > 0 && pids.length <= 128);
      const query = pids.map(pid => { assert.ok(Number.isSafeInteger(pid) && pid > 0); return `ProcessId = ${pid}`; }).join(" or ");
      const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | Select-Object ProcessId,ParentProcessId) -Compress`],
      { windowsHide: true, timeout: 15000, maxBuffer: 131072 });
      pidsAbsent = { observedCount: pids.length, current: JSON.parse(stdout), nativeBrowserBirthsUnavailable: true };
      assert.deepEqual(pidsAbsent.current, [], "Inspect PID reuse; never kill unrelated processes");
    }
  } catch (error) { failure = `${failure ?? ""}\nValidation: ${error.stack ?? error}`.slice(0, 16384); process.exitCode = 1; console.error(failure); }
  const postSourcePins = {}; for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await read(file)); assert.deepEqual(postSourcePins, sourcePins);
  const proof = { recordedAt: new Date().toISOString(), status: failure ? "failed-or-incomplete" : "headless-five-goldens-intentional-css-and-exact-geometry-passed", failure,
    sourcePins, postSourcePins, hostPreflight: host ?? null, launchHostPreflight: launchHost ?? null, diskPreflightBytes: diskBytes ?? null,
    protectedPre: protectedPre ?? null, protectedPost: protectedPost ?? null, baseline: { path: baselinePath, sha256: sha(baselineBytes) }, buildProofPath,
    generatedArchive: generatedRecord ?? null, report: reportRecord ?? null, analysis: analysis ?? null, stylesheet: generated?.stylesheetBinding ?? null,
    screenshots: report?.rows.filter(row => row.kind === "matrix-ui-observation").map(row => row.screenshot) ?? [],
    cleanup: { normalProductionRestored: restored, ownedWrapper: runtime?.directory ?? null, ownedWrapperAbsent: wrapperAbsent,
      helpersBirthIdentities: helperIdentities, numericBrowserPidsAbsent: pidsAbsent },
    browserMode: "headless", subprocessWindowsHidden: true, headedManualValidation: false, visualReviewPending: true,
    originalFullSourceAcceptance: false, publicAcceptance: false, conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false };
  const proofPath = `evidence/${stamp}-progress-compositing-goldens.json`;
  await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ proofPath, status: proof.status, maximumGeometryDelta: analysis?.maximumDeltaCssPixels,
    normalProductionRestored: restored, ownedWrapperAbsent: wrapperAbsent })); assert.equal(failure, null);
}
