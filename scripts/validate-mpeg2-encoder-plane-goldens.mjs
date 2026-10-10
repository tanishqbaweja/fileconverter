// ONE new-core browser suite. Never retry a failure automatically or publish this route.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, lstat, readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeEncoderPlaneBrowserRecipe as makeSingleIdleBrowserRecipe, verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence,
  verifyEncoderPlaneGoldenReport as verifySingleIdleGoldenReport, FROZEN_BROWSER_SOURCES,
  ENCODER_PLANE_SLOT as SINGLE_IDLE_SLOT, ENCODER_PLANE_RUN as SINGLE_IDLE_RUN } from "./lib/encoder-plane-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));
const prepareOnly = process.argv[2] === "--prepare", stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const branchPath = "evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json", branchBytes = await read(branchPath), branch = JSON.parse(branchBytes);
const buildPath = `evidence/mpeg2-encoder-plane-build-${SINGLE_IDLE_RUN}.json`, buildBytes = await read(buildPath), build = JSON.parse(buildBytes);
verifySingleIdleBuildEvidence(build, branch);
const priorPath = "evidence/mpeg2-late-abort-goldens-2026-10-08.json", priorBytes = await read(priorPath), prior = JSON.parse(priorBytes);
assert.equal(prior.failure, null); assert.equal(prior.pinsUnchanged, true); assert.equal(prior.reports.length, 1);
const baseline = prior.reports[0].report;
assert.equal(sha(Buffer.from(JSON.stringify(baseline, null, 2) + "\n")), prior.reports[0].sha256);
const sources = {}, sourcePins = {};
for (const file of new Set([...Object.keys(build.manifest.sources), ...Object.keys(FROZEN_BROWSER_SOURCES),
  "scripts/validate-mpeg2-encoder-plane-goldens.mjs", "scripts/lib/encoder-plane-browser-recipe.mjs",
  "scripts/lib/encoder-plane-golden-launcher-source.mjs", "tests/mpeg2-encoder-plane-browser.test.mjs",
  "scripts/lib/copied-audio-timing.mjs", "scripts/lib/small-matroska-mp4-timeline.mjs",
  "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/host-memory-preflight.mjs", "AGENTS.md", "app/converter/ConverterApp.tsx", "app/globals.css"])) {
  const bytes = await read(file); assert.ok(bytes.length < 1048576); sources[file] = bytes.toString(); sourcePins[file] = sha(bytes);
  if (file === branch.workflow.path) assert.equal(sourcePins[file], branch.workflow.canonicalSha256);
  else if (build.manifest.sources[file]) assert.equal(sourcePins[file], build.manifest.sources[file], file);
}
assert.equal(sourcePins["app/converter/ConverterApp.tsx"], "b93cb0095b0286f84e58fe8b9bc6ae4bc415b5487d9e06b0fc72f365f37bce6b");
const verifyAssets = async () => {
  const restored = {};
  for (const name of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
    const hash = sha(await read("public/engines/remux/" + name)); assert.equal(sha(await read("dist/client/engines/remux/" + name)), hash); restored[name] = hash;
  }
  for (const name of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
    "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
    await assert.rejects(access(path.join(root, "dist/client/engines/remux", name)), { code: "ENOENT" });
  const app = await read("dist/client" + baselineBinding.url); assert.equal(app.length, baselineBinding.bytes); assert.equal(sha(app), baselineBinding.sha256);
  assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
  return { restored, normalAppAndCssUnchanged: true, privateAdditionsAbsent: true };
};
for (const row of build.files) assert.equal(sha(await read(`work/${SINGLE_IDLE_SLOT}/${row.file}`)), row.sha256, row.file);
await verifyAssets();
const original = async () => {
  assert.equal((await stat(path.join(root, "test.mkv"))).size, 2958573265);
  const hash = createHash("sha256"); for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: 1048576 })) hash.update(chunk);
  const digest = hash.digest("hex"); assert.equal(digest, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  return { bytes: 2958573265, sha256: digest };
};
const archive = async (suffix, bytes) => {
  assert.ok(bytes.length <= 8388608); const compressed = gzipSync(bytes, { level: 9 });
  assert.deepEqual(gunzipSync(compressed), bytes);
  const file = `outputs/reports/${stamp}-encoder-plane-${suffix}.gz`; await writeFile(path.join(root, file), compressed, { flag: "wx" });
  assert.deepEqual(await read(file), compressed);
  return { path: file, bytes: compressed.length, sha256: sha(compressed), restoredBytes: bytes.length, restoredSha256: sha(bytes) };
};
const reportRoot = path.join(root, "output/playwright"), beforeReports = new Set(await readdir(reportRoot));
const beforeWork = new Set(await readdir(path.join(root, "work")));
let host, launchHost, diskBytes, preOriginal, postOriginal, runtime, generated, archiveRecord, rawRecord, report, analysis, helpers, cleanup, failure = null;
const failureArtifacts = [];
try {
  host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true, "Keep2GiB host guard");
  const disk = await statfs(root); diskBytes = disk.bavail * disk.bsize; assert.ok(diskBytes >= 2147483648);
  if (!prepareOnly) preOriginal = await original();
  runtime = await createOwnedRuntimeScratch("encoder-plane-browser-goldens-");
  generated = makeSingleIdleBrowserRecipe(sources, root, runtime.directory, stamp, branch, build);
  for (const [key, name] of [["stage", "stage.mjs"], ["spec", "candidate.spec.ts"], ["driver", "run.mjs"], ["config", "playwright.config.mjs"]])
    await writeFile(path.join(runtime.directory, name), generated[key], { flag: "wx" });
  archiveRecord = await archive("executed-sources.json", Buffer.from(JSON.stringify({ generated, sources, sourcePins })));
  if (!prepareOnly) {
    launchHost = await inspectStressHostMemory(); assert.equal(launchHost.safeToStart, true);
    await import(pathToFileURL(path.join(runtime.directory, "run.mjs")).href);
    assert.ok(!process.exitCode, "Preserve failure; no automatic retry");
    const launchBytes = await read(generated.launchPath); helpers = { path: generated.launchPath, sha256: sha(launchBytes), ...JSON.parse(launchBytes) };
    assert.equal(helpers.launchRecords.length, 2); assert.equal(helpers.runtimeAbsent, true);
    for (const row of helpers.launchRecords) assert.equal(row.absence.status, "owned-identity-absent");
    const reports = (await readdir(reportRoot)).filter(file => !beforeReports.has(file) && file.endsWith(`-${SINGLE_IDLE_SLOT}-direct-artwork.json`));
    assert.equal(reports.length, 1); const raw = await read("output/playwright/" + reports[0]); assert.ok(raw.length <= 2097152);
    report = JSON.parse(raw); rawRecord = { path: "output/playwright/" + reports[0], bytes: raw.length, sha256: sha(raw), archive: await archive("golden-report.json", raw) };
    analysis = verifySingleIdleGoldenReport(report, baseline, build);
  }
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; console.error(failure); }
finally {
  try {
    cleanup = await verifyAssets();
    if (preOriginal) postOriginal = await original();
    // Preserve only bounded failure diagnostics, never fixtures or converted media.
    if (runtime && failure) {
      const artifacts = path.join(runtime.directory, "artifacts");
      const visit = async (directory, depth = 0) => {
        assert.ok(depth <= 3); const entries = await readdir(directory, { withFileTypes: true }); assert.ok(entries.length <= 32);
        for (const entry of entries) {
          const file = path.join(directory, entry.name), info = await lstat(file); assert.ok(!info.isSymbolicLink());
          if (entry.isDirectory()) await visit(file, depth + 1);
          else if (/^(trace\.zip|error-context\.md|test-failed-\d+\.png)$/.test(entry.name)) {
            assert.ok(info.size <= 8388608 && failureArtifacts.length < 16);
            const destination = `outputs/reports/${stamp}-single-idle-failure-${failureArtifacts.length}-${entry.name}`;
            await copyFile(file, path.join(root, destination));
            failureArtifacts.push({ path: destination, bytes: info.size, sha256: sha(await read(destination)) });
          }
        }
      };
      try { await access(artifacts); await visit(artifacts); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  } catch (error) { failure = `${failure ?? ""}\nCleanup/retention: ${error.stack ?? error}`.slice(0, 12288); process.exitCode = 1; }
  finally { if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); } }
}
// Collect any terminal report even when a browser assertion failed; no rerun.
if (!rawRecord) {
  const reports = (await readdir(reportRoot)).filter(file => !beforeReports.has(file) && file.endsWith(`-${SINGLE_IDLE_SLOT}-direct-artwork.json`));
  if (reports.length === 1) {
    const raw = await read("output/playwright/" + reports[0]); assert.ok(raw.length <= 2097152);
    rawRecord = { path: "output/playwright/" + reports[0], bytes: raw.length, sha256: sha(raw), archive: await archive("failed-golden-report.json", raw) };
  }
}
const postSourcePins = {}; for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await read(file));
assert.deepEqual(postSourcePins, sourcePins);
const unexpectedFixtureDirs = (await readdir(path.join(root, "work"))).filter(name => !beforeWork.has(name) && name.startsWith("mpeg2-artwork-validation-"));
assert.deepEqual(unexpectedFixtureDirs, [], "Disposable fixture/output directory must be absent");
const proofPath = `evidence/${stamp}-encoder-plane-browser-goldens.json`;
const proof = { recordedAt: new Date().toISOString(), status: failure ? "failed-or-incomplete" : prepareOnly ? "prepared-not-executed" : "five-headless-goldens-byte-exact-and-recovery-passed",
  failure, hostPreflight: host ?? null, launchHostPreflight: launchHost ?? null, diskPreflightBytes: diskBytes ?? null,
  build: { path: buildPath, sha256: sha(buildBytes) }, branch: { path: branchPath, sha256: sha(branchBytes) }, baseline: { path: priorPath, sha256: sha(priorBytes) },
  sourcePins, postSourcePins, generatedArchive: archiveRecord ?? null, report: rawRecord ?? null, analysis: analysis ?? null,
  protectedPre: preOriginal ?? null, protectedPost: postOriginal ?? null, cleanup: { ...cleanup, helpers: helpers ?? null,
    ownedWrapper: runtime?.directory ?? null, ownedWrapperAbsent: runtime ? true : null, newFixtureDirsRemaining: unexpectedFixtureDirs }, failureArtifacts,
  browserMode: "headless", subprocessWindowsHidden: true, nativeToolsOnlyFixturesAndIndependentValidation: true,
  noDocker: true, completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false, publicAcceptance: false, conversionSpeedAcceptance: false };
await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, status: proof.status, analysis: proof.analysis, cleaned: proof.cleanup.ownedWrapperAbsent }));
assert.equal(failure, null);
