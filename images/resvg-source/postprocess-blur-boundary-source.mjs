// Authenticated fifth-proof raw artifact only; never renders or publishes a candidate.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeBlurBoundaryPostprocessRecipe } from "./blur-boundary-postprocess-recipe.mjs";
import { blurBoundaryPatch } from "./blur-boundary-patch.mjs";
import { sha } from "./source-pins.mjs";
assert.equal(process.platform, "linux"); assert.equal(process.argv.length, 2);
assert.match(process.env.GITHUB_RUN_ID ?? "", /^[0-9]{1,14}$/);
const root = path.resolve(import.meta.dirname, "../.."), runId = process.env.GITHUB_RUN_ID, output = path.join(root, "outputs/reports");
const report = { schemaVersion: 1, runId, startedAt: new Date().toISOString(), sourcePins: {}, failures: [],
  scope: "Two pinned bindgen/cap passes after five authenticated source proofs and both pinned numeric sets; no browser acceptance",
  publicEngineReplacement: false, rendererExecuted: false, wholeGoalComplete: false };
let runtime, child, log = "";
try {
  await mkdir(output, { recursive: true }); const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3);
  for (const file of ["images/resvg-source/postprocess-repeated-source.mjs", "images/resvg-source/filter-postprocess-recipe.mjs",
    "images/resvg-source/context-postprocess-recipe.mjs", "images/resvg-source/liveness-postprocess-recipe.mjs",
    "images/resvg-source/premultiplied-postprocess-recipe.mjs", "images/resvg-source/blur-boundary-postprocess-recipe.mjs",
    "images/resvg-source/postprocess-blur-boundary-source.mjs", "images/resvg-source/filter-blur-boundary-raw-input.json",
    "images/resvg-source/blur-boundary-patch.mjs", "images/resvg-source/blur-boundary-entry.rs", "images/resvg-source/blur-boundary-kernel-tests.rs",
    ".github/workflows/svg-blur-boundary-postprocess.yml"])
    report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  runtime = await createOwnedRuntimeScratch("resvg-filter-process-owner-");
  const recipe = makeBlurBoundaryPostprocessRecipe({ root, sourceBytes: await readFile(path.join(root, "images/resvg-source/postprocess-repeated-source.mjs")) });
  report.recipe = recipe.proof;
  report.generatedSourceArchive = { bytes: Buffer.byteLength(recipe.source), sha256: sha(recipe.source), gzipBase64: gzipSync(recipe.source, { level: 9 }).toString("base64") };
  const file = path.join(runtime.directory, "processor.mjs"); await writeFile(file, recipe.source, { flag: "wx" });
  child = spawn(process.execPath, [file], { cwd: root, env: { ...runtime.env, GH_PROMPT_DISABLED: "true" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const pipe of [child.stdout, child.stderr]) pipe.on("data", bytes => { log = (log + bytes).slice(-32768); });
  report.childExit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => { report.childSignal = signal; resolve(code); }); });
  assert.equal(report.childSignal, null); assert.equal(report.childExit, 0, log);
  const receiptPath = `outputs/reports/resvg-source-processed-repeat-${runId}.json`, bytes = await readFile(path.join(root, receiptPath)), receipt = JSON.parse(bytes);
  assert.equal(receipt.status, "repeated-source-and-processed-private-candidate-byte-identical-before-browser-acceptance");
  assert.equal(receipt.blurBoundaryPatch.patchedSha256, blurBoundaryPatch.patchedSha256); assert.equal(receipt.sourceBlurBoundaryChanged, true);
  assert.equal(receipt.processedWasmAndGlueByteIdentical, true); assert.equal(receipt.twoSourceBuildReceiptsAndRawEqualityVerified, true);
  assert.equal(receipt.ownedScratchRemoved, true); assert.equal(receipt.publicEngineUnchanged, true); assert.deepEqual(receipt.failures, []);
  report.processedReceipt = { path: receiptPath, bytes: bytes.length, sha256: sha(bytes) }; report.candidate = receipt.candidate;
  report.status = "two-pinned-blur-boundary-source-postprocessing-passes-byte-identical-not-browser-acceptance";
} catch (error) { report.status = "failed-private-blur-boundary-source-postprocessing"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    assert.ok(!child || child.pid === undefined || (child.exitCode !== null && child.signalCode === null), "Do not delete a live postprocessor owner");
    await runtime?.close(); report.ownedOwnerScratchRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  } catch (error) { report.status = "failed-private-blur-boundary-source-postprocessing"; report.failures.push("Owned cleanup/source verification: " + error); process.exitCode = 1; }
  report.logTail = log; report.finishedAt = new Date().toISOString();
  const file = path.join(output, `resvg-filter-blur-boundary-processed-owner-${runId}.json`); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file, status: report.status, candidate: report.candidate, failures: report.failures }));
}
