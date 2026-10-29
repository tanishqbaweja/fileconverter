// Two fresh private builds with all five source proofs and pinned numeric controls.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeBlurBoundaryBuildRecipes } from "./blur-boundary-build-recipe.mjs";
import { sha } from "./source-pins.mjs";
assert.equal(process.platform, "linux"); assert.equal(process.argv.length, 2);
assert.match(process.env.GITHUB_RUN_ID ?? "", /^[0-9]{1,14}$/);
const root = path.resolve(import.meta.dirname, "../.."), runId = process.env.GITHUB_RUN_ID, output = path.join(root, "outputs/reports");
const report = { schemaVersion: 1, runId, startedAt: new Date().toISOString(), sourcePins: {}, failures: [],
  scope: "Two fresh locked blur-boundary source builds and both original/padded arithmetic controls per pinned-nightly build; no rendering or browser acceptance",
  publicEngineReplacement: false, rendererExecuted: false, wholeGoalComplete: false };
let runtime, child, log = "";
try {
  await mkdir(output, { recursive: true }); const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 8 * 1024 ** 3);
  const files = ["images/resvg-source/compile-candidate.mjs", "images/resvg-source/reproduce-raw-source.mjs",
    "images/resvg-source/filter-build-recipe.mjs", "images/resvg-source/context-build-recipe.mjs", "images/resvg-source/liveness-build-recipe.mjs",
    "images/resvg-source/premultiplied-build-recipe.mjs", "images/resvg-source/premultiplied-transfer-patch.mjs", "images/resvg-source/premultiplied-transfer-kernel.rs",
    "images/resvg-source/blur-boundary-build-recipe.mjs", "images/resvg-source/blur-boundary-patch.mjs", "images/resvg-source/owned-blur-boundary-patch.mjs",
    "images/resvg-source/blur-boundary-entry.rs", "images/resvg-source/blur-boundary-kernel-tests.rs", "images/resvg-source/reproduce-blur-boundary-source.mjs",
    "fixtures/source/resvg-box-blur-3495d870-preimage.json", ".github/workflows/svg-source-blur-boundary.yml"];
  for (const file of files) report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  runtime = await createOwnedRuntimeScratch("resvg-filter-owner-");
  const generated = makeBlurBoundaryBuildRecipes({ root, runtime: runtime.directory,
    compilerBytes: await readFile(path.join(root, files[0])), reproducerBytes: await readFile(path.join(root, files[1])) });
  report.recipe = generated.proof; report.generatedSourceArchives = {};
  for (const [name, file, source] of [["compiler", generated.compilerPath, generated.compiler], ["reproducer", generated.reproducerPath, generated.reproducer]]) {
    report.generatedSourceArchives[name] = { bytes: Buffer.byteLength(source), sha256: sha(source), gzipBase64: gzipSync(source, { level: 9 }).toString("base64") };
    await writeFile(file, source, { flag: "wx" });
  }
  child = spawn(process.execPath, [generated.reproducerPath], { cwd: root, env: runtime.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const pipe of [child.stdout, child.stderr]) pipe.on("data", bytes => { log = (log + bytes).slice(-32768); });
  report.childExit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => { report.childSignal = signal; resolve(code); }); });
  assert.equal(report.childSignal, null); assert.equal(report.childExit, 0, log);
  const receiptPath = `outputs/reports/resvg-source-repeat-${runId}.json`, bytes = await readFile(path.join(root, receiptPath)), receipt = JSON.parse(bytes);
  assert.equal(receipt.status, "two-fresh-private-filter-blur-boundary-source-builds-byte-identical-not-browser-acceptance");
  assert.equal(receipt.rawBytesEqual, true); assert.equal(receipt.ownedDriverScratchRemoved, true); assert.deepEqual(receipt.failures, []);
  report.rawRepeatReceipt = { path: receiptPath, bytes: bytes.length, sha256: sha(bytes) }; report.rawByteEquality = true;
  report.status = "two-fresh-filter-blur-boundary-source-builds-verified-not-browser-acceptance";
} catch (error) { report.status = "failed-private-filter-blur-boundary-source-build"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    assert.ok(!child || child.pid === undefined || (child.exitCode !== null && child.signalCode === null), "Do not delete a live compiler owner");
    await runtime?.close(); report.ownedOwnerScratchRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  } catch (error) { report.failures.push("Owned cleanup/source verification: " + error); report.status = "failed-private-filter-blur-boundary-source-build"; process.exitCode = 1; }
  report.compilerTail = log; report.finishedAt = new Date().toISOString();
  const file = path.join(output, `resvg-filter-blur-boundary-owner-${runId}.json`); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file, status: report.status, failures: report.failures }));
}
