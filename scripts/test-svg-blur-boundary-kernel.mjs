// Compile/run scalar kernel tests only, using an explicitly installed compiler.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, lstat, access } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { readPinnedBoxBlurPreimage, patchPinnedBlurBoundary } from "../images/resvg-source/blur-boundary-patch.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), sourcePins: {}, commands: [], failures: [],
  scope: "Host compiled synthetic numeric buffers, not a native SVG converter or browser/Wasm acceptance",
  nativeSourceRecipeIntegrated: false, productionConversionTested: false, publicPromotion: false, wholeGoalComplete: false };
let runtime, child;
const run = async (executable, args) => {
  const row = { executable, args, pid: null, birth: null, log: "", exitCode: null, signal: null }; report.commands.push(row);
  child = spawn(executable, args, { cwd: root, env: runtime.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  row.pid = child.pid;
  const completed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => { row.exitCode = code; row.signal = signal; resolve(); }); });
  for (const pipe of [child.stdout, child.stderr]) pipe.on("data", bytes => { row.log = (row.log + bytes).slice(-32768); });
  row.birth = await queryReliableProcessIdentity(child.pid); await completed;
  assert.equal(row.signal, null); assert.equal(row.exitCode, 0, row.log);
  if (row.birth) { row.cleanup = await observeOwnedProcessExit(row.birth); assert.equal(row.cleanup.status, "owned-identity-absent"); }
  else row.cleanup = { status: "launch-exit-observed-before-birth-query-no-process-killed", exitCode: row.exitCode };
  return row;
};
try {
  assert.equal(process.argv.length, 2);
  const compiler = process.env.WITHIN_RUSTC_EXECUTABLE;
  assert.ok(compiler && path.isAbsolute(compiler), "Set an existing full rustc path; no proxy/downloader installation");
  assert.match(path.basename(compiler), /^rustc(?:\.exe)?$/); assert.ok((await lstat(compiler)).isFile());
  for (const file of ["images/resvg-source/blur-boundary-entry.rs", "images/resvg-source/blur-boundary-patch.mjs",
    "images/resvg-source/blur-boundary-kernel-tests.rs", "fixtures/source/resvg-box-blur-3495d870-preimage.json", "scripts/test-svg-blur-boundary-kernel.mjs"])
    report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  const original = await readPinnedBoxBlurPreimage();
  const patch = patchPinnedBlurBoundary(original, await readFile(path.join(root, "images/resvg-source/blur-boundary-entry.rs"))); report.patch = patch.proof;
  runtime = await createOwnedRuntimeScratch("svg-blur-boundary-kernel-");
  await writeFile(path.join(runtime.directory, "original-box-blur.rs"), original, { flag: "wx" });
  await writeFile(path.join(runtime.directory, "patched-box-blur.rs"), patch.bytes, { flag: "wx" });
  const tests = path.join(runtime.directory, "numeric-tests.rs");
  await writeFile(tests, await readFile(path.join(root, "images/resvg-source/blur-boundary-kernel-tests.rs")), { flag: "wx" });
  report.compilerVersion = (await run(compiler, ["--version", "--verbose"])).log;
  const binary = path.join(runtime.directory, process.platform === "win32" ? "blur-kernel-tests.exe" : "blur-kernel-tests");
  await run(compiler, ["--edition=2021", "--test", tests, "-O", "-o", binary]);
  const tested = await run(binary, ["--test-threads=1", "--nocapture"]);
  assert.match(tested.log, /test result: ok\. 4 passed; 0 failed; 0 ignored/);
  assert.match(tested.log, /boundary-observation old=79 expanded=136 max=57 center=255/);
  report.status = "four-compiled-numeric-boundary-tests-pass-not-browser-acceptance";
} catch (error) { report.status = "failed-compiled-blur-boundary-control"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    assert.ok(!child || child.pid === undefined || child.exitCode !== null || child.signalCode !== null, "Do not remove live owned command scratch");
    await runtime?.close(); report.ownedRuntimeRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  } catch (error) { report.status = "failed-compiled-blur-boundary-control"; report.failures.push("Cleanup/source verification: " + error); process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); const file = path.join(root, "evidence", stamp + "-svg-blur-boundary-kernel.json");
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file: path.relative(root, file), status: report.status, ownedRuntimeRemoved: report.ownedRuntimeRemoved, failures: report.failures }));
}
