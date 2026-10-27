import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { compileContract, verifyCompileLock, inspectRawWasm } from "../images/resvg-source/compile-contract.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");

test("compiler contract uses exact retained lock, recorded nightly and release wasm target, never resolution or toolchain sweeps", async () => {
  const lock = await read("images/resvg-source/Cargo.candidate.lock");
  assert.equal(verifyCompileLock(Buffer.from(lock)).packages, 158);
  assert.throws(() => verifyCompileLock(Buffer.from(lock + "\n")));
  assert.deepEqual(compileContract.command, ["run", "nightly-2023-12-11", "cargo", "build", "--locked", "--release", "--lib", "--target", "wasm32-unknown-unknown", "--jobs", "2"]);
  assert.equal(compileContract.rustcVersion, "rustc 1.76.0-nightly (d86d65bbc 2023-12-10)");
  assert.match(compileContract.nightlyManifestSha256, /^[a-f0-9]{64}$/);
});
test("raw artifact checker validates bounded Wasm structure without instantiating or asserting browser ABI", () => {
  const minimal = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 0, 1, 0]);
  const row = inspectRawWasm(minimal);
  assert.equal(row.structurallyValid, true); assert.equal(row.importCount, 0); assert.equal(row.exportCount, 0);
  assert.equal(row.executed, false); assert.equal(row.stage, "raw-before-wasm-bindgen-processing-not-browser-engine");
  assert.throws(() => inspectRawWasm(Buffer.from("not a real wasm file")));
  assert.throws(() => inspectRawWasm(Buffer.alloc(compileContract.maxRawWasmBytes + 1)));
});
test("compiler driver isolates caches and temp, streams bounded logs, pins sources and reports failure before owned finally cleanup", async () => {
  const source = await read("images/resvg-source/compile-candidate.mjs");
  for (const anchor of ['assert.equal(process.platform, "linux"', 'createOwnedRuntimeScratch("resvg-source-compile-")',
    'CARGO_HOME: path.join(runtime.directory, "cargo")', 'RUSTUP_HOME: path.join(runtime.directory, "rustup")',
    'CARGO_TARGET_DIR: path.join(runtime.directory, "target")', 'windowsHide: true', '.subarray(-32768)',
    'verifyCompileLock(originalLock)', 'finally {', 'activeChild.exitCode !== null', 'activeChild.signalCode === null',
    'await runtime?.close()', 'report.sourcePins[file]', 'flag: "wx"']) assert.ok(source.includes(anchor), anchor);
  assert.match(source, /disk.bavail \* disk.bsize >= 8 \* 1024 \*\* 3/);
  assert.match(source, /compileContract.nightlyManifestSha256/);
  assert.match(source, /sha\(await readFile\(lockPath\)\), report.lock.sha256/);
  assert.doesNotMatch(source, /generate-lockfile|cargo update|docker|test\.mkv|taskkill|SIGKILL|\.instantiate\(/);
  for (const flag of ["bindgenProcessingAttempted", "browserOrMemoryAcceptance", "exactPublishedBinaryReproduction", "publicEngineReplacement", "historicalDependencyGraphRecovered", "originalGoalComplete"])
    assert.ok(source.includes(flag + ": false"));
});
test("manual compile scope cannot rerun resolver, normal engine or browser matrices; failure artifacts remain bounded", async () => {
  const yaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml");
  const jobs = yaml.load(await read(".github/workflows/ci.yml")).jobs;
  assert.match(jobs["engine-matrix"].if, /inputs.engine != 'svg-source-compile'/);
  for (const id of ["verify", "browser-conversions", "audio-destination-scopes", "svg-source-lock"])
    assert.doesNotMatch(jobs[id].if, /svg-source-compile/);
  const job = jobs["svg-source-compile"]; assert.equal(job["timeout-minutes"], 20);
  assert.equal(job.if, "github.event_name == 'workflow_dispatch' && inputs.engine == 'svg-source-compile'");
  assert.equal(job.steps.find(row => row.run?.startsWith("node ")).run, "node images/resvg-source/compile-candidate.mjs");
  assert.equal(job.steps.find(row => row.name === "Verify public engines were not replaced").if, "always()");
  const upload = job.steps.find(row => row.uses?.startsWith("actions/upload-artifact"));
  assert.equal(upload.if, "always()"); assert.equal(upload.with["retention-days"], 1);
  assert.equal(upload.with.path.trim().split("\n").length, 2);
  assert.match(upload.with.path, /\.json\n.*\.wasm/); assert.doesNotMatch(upload.with.path, /work\/|target\/|cargo/);
});
