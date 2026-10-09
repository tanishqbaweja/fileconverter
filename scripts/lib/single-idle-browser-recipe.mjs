// Additive, hash-gated derivatives of the executed five-case correctness suite.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";

export const SINGLE_IDLE_RUN = "37986418102";
export const SINGLE_IDLE_SLOT = "mpeg2-single-idle-" + SINGLE_IDLE_RUN;
export const SINGLE_IDLE_DECODER_SHA = "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec";
export const FROZEN_BROWSER_SOURCES = {
  "scripts/stage-mpeg2-split-direct.mjs": "2526f8900924e062659bfe1dabc185a81e7d1c668dce0a8a8e4007da8ee6ca60",
  "scripts/validate-mpeg2-split-direct.mjs": "b4cb70a6977f664337e6c80e8f296f58d2f50297b599e96a21cff91b84d0a9c4",
  "tests/browser/mpeg2-split-direct-candidate.spec.ts": "e91991243c9923df2380e19b7dc4a5c85b09c7e507e3b1d1112c96ee3a0ca73a",
};
function patch(source, edits) {
  let result = source;
  for (const [before, after, count = 1] of edits) {
    assert.equal(result.split(before).length - 1, count, before);
    result = result.replaceAll(before, after);
  }
  let reverse = result;
  for (const [before, after] of edits.toReversed()) reverse = reverse.replaceAll(after, before);
  assert.equal(reverse, source, "Unchanged production conversion and independent validator assertions");
  return result;
}
export function verifySingleIdleBuildEvidence(proof, branch) {
  assert.equal(String(proof.run.databaseId), SINGLE_IDLE_RUN);
  assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.run.headSha, branch.commit);
  assert.equal(branch.commit, "e9d90b95814c2557895a5d71793384d7d6386c3f");
  assert.equal(proof.artifact.workflow_run.head_sha, branch.commit);
  assert.equal(proof.manifest.artifacts["within-mpeg2-split.wasm"], SINGLE_IDLE_DECODER_SHA);
  assert.equal(proof.manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.equal(proof.manifest.sources[branch.workflow.path], branch.workflow.generatedSha256);
  assert.equal(proof.manifest.aggregateWasmMemoryBytes, 50331648);
  assert.equal(proof.manifest.allowMemoryGrowth, false);
  assert.deepEqual(proof.smoke, proof.manifest.singleIdle.actualSyntheticWasm32Unit);
  assert.equal(proof.smoke.status, "passed"); assert.equal(proof.smoke.sequentialReuses, 200000);
  assert.equal(proof.smoke.sequentialFreshAllocations, 1); assert.equal(proof.smoke.maximumIdleEntriesPerSelectedPool, 1);
  assert.equal(proof.smoke.conversionsPerformed, 0);
  for (const key of ["liveReferencesUnchanged", "uninitWithLiveReferencesPassed", "initErrorPassed", "zeroEveryTimePassed"])
    assert.equal(proof.smoke[key], true, key);
  assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.downloadRuntimeRemoved, true); assert.equal(proof.hostedCleanupStepPassed, true);
  assert.equal(proof.run.jobs.flatMap(job => job.steps).find(step => step.name === "Remove repository-local build data")?.conclusion, "success");
}
export function makeSingleIdleBrowserRecipe(sources, root, runtime, stamp, branch) {
  assert.equal(path.dirname(runtime), path.join(root, "work"));
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/);
  for (const [file, digest] of Object.entries(FROZEN_BROWSER_SOURCES)) assert.equal(sha(sources[file]), digest, file);
  const uri = file => pathToFileURL(path.join(root, file)).href;
  const slotRegex = "/^(mpeg2-split-pipeline-output|mpeg2-split-pipeline-[0-9]{8,})$/";
  const newSlotRegex = "/^mpeg2-single-idle-37986418102$/";
  const stage = patch(sources["scripts/stage-mpeg2-split-direct.mjs"], [
    ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
    ['"mpeg2-split-pipeline-output"', JSON.stringify(SINGLE_IDLE_SLOT)],
    [slotRegex, newSlotRegex],
    ['for (const [file, digest] of Object.entries(manifest.sources)) assert.equal(await hash(path.join(root, file)), digest, file);',
      'for (const [file, digest] of Object.entries(manifest.sources)) {\n' +
      `  if (file === ${JSON.stringify(branch.workflow.path)}) {\n` +
      `    assert.equal(digest, ${JSON.stringify(branch.workflow.generatedSha256)});\n` +
      `    assert.equal(await hash(path.join(root, file)), ${JSON.stringify(branch.workflow.canonicalSha256)});\n` +
      '  } else assert.equal(await hash(path.join(root, file)), digest, file);\n}\n' +
      `assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], ${JSON.stringify(SINGLE_IDLE_DECODER_SHA)});`],
  ]);
  let spec = patch(sources["tests/browser/mpeg2-split-direct-candidate.spec.ts"], [
    ['path.resolve(import.meta.dirname, "../..")', JSON.stringify(root)],
    [slotRegex, newSlotRegex],
    ['"mpeg2-split-pipeline-output"', JSON.stringify(SINGLE_IDLE_SLOT)],
    ['serviceWorkers: "block" });', 'serviceWorkers: "block", headless: true });'],
  ]);
  // Bind only actual top-level imports; never rewrite strings of generated code.
  spec = spec.replace(/^(import[^\r\n]*from) "(\.\.\/\.\.\/scripts\/lib\/[^"\r\n]+)";/gm,
    (_, prefix, relative) => `${prefix} ${JSON.stringify(uri(relative.slice(6)))};`);
  const launchPath = `outputs/reports/${stamp}-single-idle-golden-launch-identities.json`;
  let driver = patch(sources["scripts/validate-mpeg2-split-direct.mjs"], [
    ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
    ['"mpeg2-split-direct-runtime-"', '"single-idle-golden-helpers-"'],
    ['"scripts/stage-mpeg2-split-direct.mjs"', JSON.stringify(path.join(runtime, "stage.mjs")), 3],
    ['{ ...runtime.env, WRANGLER_SEND_METRICS: "false",', `{ ...runtime.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: ${JSON.stringify(SINGLE_IDLE_SLOT)}, WRANGLER_SEND_METRICS: "false",`],
    ['"tests/browser/mpeg2-split-direct-candidate.spec.ts", "--reporter=line"',
      `"--config", ${JSON.stringify(path.join(runtime, "playwright.config.mjs"))}, "--reporter=line"`],
    ['{ cwd: root, env: runtime?.env, windowsHide: true });',
      `{ cwd: root, env: { ...runtime?.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: ${JSON.stringify(SINGLE_IDLE_SLOT)} }, windowsHide: true });`],
    ['import { access } from "node:fs/promises";', 'import { access, writeFile } from "node:fs/promises";\n' +
      `import { queryProcessIdentity, observeOwnedProcessExit } from ${JSON.stringify(uri("scripts/lib/owned-process-exit-observation.mjs"))};`],
    ['let runtime, server, runner, staged = false;', 'let runtime, server, runner, staged = false;\nconst launchRecords = [];\n' +
      'const recordLaunch = async (child, role) => {\n  const identity = await queryProcessIdentity(child.pid);\n' +
      '  assert.ok(identity && identity.parentPid === process.pid);\n  child.ownedIdentity = identity;\n' +
      '  launchRecords.push({ role, identity, absence: null });\n};'],
    ['  if (process.platform === "win32") {\n    await exec("taskkill.exe",',
      '  const current = await queryProcessIdentity(child.pid);\n  if (!current) return;\n' +
      '  assert.ok(child.ownedIdentity && current.parentPid === child.ownedIdentity.parentPid &&\n' +
      '    Math.abs(Date.parse(current.createdAt) - Date.parse(child.ownedIdentity.createdAt)) <= 1, "Never stop an unrelated or reused PID");\n' +
      '  if (process.platform === "win32") {\n    await exec("taskkill.exe",'],
    ['  const deadline = Date.now() + 30_000;', '  await recordLaunch(server, "production-server");\n  const deadline = Date.now() + 30_000;'],
    ['  await new Promise((resolve, reject) => {\n    const timer = setTimeout(',
      '  await recordLaunch(runner, "playwright-runner");\n  await new Promise((resolve, reject) => {\n    const timer = setTimeout('],
    ['  await finishOwnedCleanup([() => stop(runner), () => stop(server)]);',
      '  try { await finishOwnedCleanup([() => stop(runner), () => stop(server)]); }\n' +
      '  catch(error) { process.stderr.write(String(error)+"\\n"); process.exitCode=1; }'],
    ['  process.stdout.write("Private split MPEG2 helper trees stopped, generated assets restored, owned runtime scratch removed.\\n");',
      '  for (const row of launchRecords) {\n    row.absence = await observeOwnedProcessExit(row.identity);\n' +
      '    assert.equal(row.absence.status, "owned-identity-absent");\n  }\n' +
      `  await writeFile(path.join(root, ${JSON.stringify(launchPath)}), JSON.stringify({ launchRecords, runtime: runtime?.directory ?? null, runtimeAbsent: true }), { flag: "wx" });\n` +
      '  process.stdout.write("Private split MPEG2 helper trees stopped, generated assets restored, owned runtime scratch removed.\\n");'],
  ]);
  driver = driver.replace('from "./lib/owned-runtime-scratch.mjs"', `from ${JSON.stringify(uri("scripts/lib/owned-runtime-scratch.mjs"))}`);
  const config = `export default ${JSON.stringify({ testDir: runtime, testMatch: "candidate.spec.ts", timeout: 60000,
    expect: { timeout: 15000 }, workers: 1, retries: 0, fullyParallel: false,
    outputDir: path.join(runtime, "artifacts"), reporter: "line",
    use: { baseURL: "REPLACE_ORIGIN", headless: true, channel: "chrome", video: "off", trace: "retain-on-failure", screenshot: "only-on-failure" },
  })}`.replace('"REPLACE_ORIGIN"', 'process.env.WITHIN_TEST_BASE_URL') + ";\n";
  assert.ok(spec.includes("headless: true") && !spec.includes("headless: false"));
  assert.equal((driver.match(/windowsHide: true/g) ?? []).length, 6);
  return { stage, spec, driver, config, launchPath };
}

export function verifySingleIdleGoldenReport(report, baseline) {
  assert.equal(report.candidateName, SINGLE_IDLE_SLOT);
  assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"], SINGLE_IDLE_DECODER_SHA);
  const conversions = value => value.rows.filter(row => !row.kind && row.status === "passed");
  const actual = conversions(report), expected = conversions(baseline); assert.equal(actual.length, 3); assert.equal(expected.length, 3);
  for (let i = 0; i < 3; i++) {
    for (const field of ["sourceBytes", "outputBytes", "outputCodec", "frames", "audioTracks", "ssim", "timestampAlignedSsim", "outputSha256",
      "destination", "sourceCodec", "audioPacketHashes", "sourceFrameTimes", "outputFrameTimes", "warnings"])
      assert.deepEqual(actual[i][field], expected[i][field], field);
    const m = actual[i].metrics; assert.equal(m.peakWasmMemoryBytes, 50331648); assert.equal(m.peakPendingOperations, 1);
    assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0);
    assert.ok(m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 524288 && m.peakQueuedBytes <= 524288);
  }
  const rows = kind => report.rows.filter(row => row.kind === kind);
  assert.equal(rows("independent-frame-diagnostic").length, 3);
  for (const row of rows("independent-frame-diagnostic")) assert.equal(row.nativeFullDecodePassed, true);
  assert.equal(rows("independent-decoded-audio").length, 3);
  for (const row of rows("independent-decoded-audio")) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
  for (const kind of ["direct-write-failure", "cancel-after-direct-output"]) {
    assert.equal(rows(kind).length, 1); assert.equal(rows(kind)[0].status, "passed"); assert.deepEqual(rows(kind)[0].partialBytes, []);
  }
  const inventories = report.rows.filter(row => "cleanupRemovedEntries" in row); assert.equal(inventories.length, 5);
  for (const row of inventories) assert.deepEqual(row.cleanupRemovedEntries, []);
  return { genuineConversions: 3, adverseRecoveryCases: 2, outputBytesAndHashesMatchPrior: true,
    unchangedIndependentValidation: true, completeChromiumMemoryAcceptance: false, fullOriginalCompleted: false, speedImprovementProven: false };
}
