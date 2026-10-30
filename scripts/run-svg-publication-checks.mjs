// Hidden owned launcher for the reversible21-case publication/old privacy check.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeSvgPublicationCheckDriver } from "./lib/svg-publication-check-recipe.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), scope: "All19 original privacy/hosting checks plus2 public SVG gate checks, not SVG conversion acceptance",
  sourcePins: {}, failures: [], publicEngineReplacement: false, wholeGoalComplete: false };
let runtime, child, birth, log = "";
try {
  for (const file of ["scripts/run-owned-privacy-offline.mjs", "scripts/run-svg-publication-checks.mjs", "scripts/lib/svg-publication-check-recipe.mjs", "tests/browser/svg-publication-gate.spec.ts"])
    report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  runtime = await createOwnedRuntimeScratch("svg-publication-check-");
  const generated = makeSvgPublicationCheckDriver({ root, sourceBytes: await readFile(path.join(root, "scripts/run-owned-privacy-offline.mjs")) });
  report.recipe = generated.proof; report.generatedSourceArchive = { bytes: Buffer.byteLength(generated.source), sha256: sha(generated.source), gzipBase64: gzipSync(generated.source, { level: 9 }).toString("base64") };
  const file = path.join(runtime.directory, "owner.mjs"); await writeFile(file, generated.source, { flag: "wx" });
  child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const pipe of [child.stdout, child.stderr]) pipe.on("data", bytes => { log = (log + bytes).slice(-32768); });
  const completed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => { report.childSignal = signal; resolve(code); }); });
  birth = await queryReliableProcessIdentity(child.pid); assert.ok(birth); report.childBirth = birth;
  report.childExit = await completed; assert.equal(report.childSignal, null); assert.equal(report.childExit, 0, log);
  const summaries = log.split(/\r?\n/).filter(line => line.startsWith('{"path":')); assert.equal(summaries.length, 1, log);
  const receiptPath = JSON.parse(summaries[0]).path.replaceAll("\\", "/"); assert.match(receiptPath, /^evidence\/[\w-]+-owned-privacy-offline\.json$/);
  const bytes = await readFile(path.join(root, receiptPath)), receipt = JSON.parse(bytes);
  assert.equal(receipt.status, "passed-complete-headless-privacy-offline-hosting-specs");
  assert.deepEqual([receipt.stats.expected, receipt.stats.unexpected, receipt.stats.skipped, receipt.stats.flaky], [21, 0, 0, 0]);
  report.browserReceipt = { path: receiptPath, bytes: bytes.length, sha256: sha(bytes) }; report.stats = receipt.stats;
  report.svgPublicationGate = receipt.svgPublicationGate; report.status = "passed-public-svg-withholding-and-unchanged-privacy-hosting-checks-not-conversion-acceptance";
} catch (error) { report.status = "failed-svg-publication-checks"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    assert.ok(!child || child.pid === undefined || (child.exitCode !== null && child.signalCode === null));
    if (birth) { report.ownerProcessCleanup = await observeOwnedProcessExit(birth); assert.equal(report.ownerProcessCleanup.status, "owned-identity-absent"); }
    await runtime?.close(); report.ownedRuntimeRemoved = Boolean(runtime);
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  } catch (error) { report.failures.push("Owned cleanup/source verification: " + error); report.status = "failed-svg-publication-checks"; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); report.logTail = log.slice(-8192);
  const file = path.join(root, "evidence", stamp + "-svg-publication-checks.json"); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, stats: report.stats, failures: report.failures }));
}
