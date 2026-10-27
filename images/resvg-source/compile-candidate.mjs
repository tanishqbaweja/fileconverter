// One private source compilation. Never invokes or replaces a browser converter.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile, stat, statfs, access } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { pins, sha, pinCargoManifest, inspectCandidateLock } from "./source-pins.mjs";
import { compileContract, verifyCompileLock, inspectRawWasm } from "./compile-contract.mjs";
import { pathfinderRepair, makePathfinderLock, pinPathfinderManifest } from "./pathfinder-repair.mjs";
import { bytesRepair, makePublishedBytesLock } from "./bytes-repair.mjs";

assert.equal(process.platform, "linux", "Linux-only isolated Actions compilation, not local conversion");
const repairBytes = process.argv[2] === "--bytes-1.6.0";
const repairPathfinder = process.argv[2] === "--pathfinder-0.5.2" || repairBytes;
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && repairPathfinder));
assert.match(process.env.GITHUB_RUN_ID ?? "", /^[0-9]+$/);
const root = path.resolve(import.meta.dirname, "../.."), runId = process.env.GITHUB_RUN_ID;
const reportRoot = path.join(root, "outputs/reports"), reportFile = path.join(reportRoot, `resvg-source-compile-${runId}.json`);
const report = { schemaVersion: 1, runId, startedAt: new Date().toISOString(), status: "running",
  scope: "Recorded nightly source-compile probe with exact retained baseline or explicitly recorded dependency repairs; before bindgen/public engine acceptance",
  pins, compileContract, commands: [], sourcePins: {}, failures: [], rawWasm: null,
  sourceCompilationAttempted: false, sourceCompilationSucceeded: false,
  bindgenProcessingAttempted: false, browserOrMemoryAcceptance: false,
  exactPublishedBinaryReproduction: false, publicEngineReplacement: false, protectedOriginalAccessed: false,
  historicalDependencyGraphRecovered: false, originalGoalComplete: false };
report.pathfinderRepair = repairPathfinder ? pathfinderRepair : null;
report.bytesRepair = repairBytes ? bytesRepair : null;
const sourceFiles = ["images/resvg-source/compile-candidate.mjs", "images/resvg-source/compile-contract.mjs",
  "images/resvg-source/source-pins.mjs", "images/resvg-source/pathfinder-repair.mjs",
  "images/resvg-source/bytes-repair.mjs",
  "images/resvg-source/Cargo.candidate.lock", ".github/workflows/ci.yml"];
let runtime, activeChild, tail = Buffer.alloc(0), logBytes = 0;
const logHash = createHash("sha256");
const run = async (command, args, { cwd = root, capture = false } = {}) => {
  const row = { command, args, startedAt: new Date().toISOString(), exitCode: null, signal: null };
  report.commands.push(row); let captured = Buffer.alloc(0);
  console.log(JSON.stringify({ phase: "owned-compiler-command", command, args }));
  activeChild = spawn(command, args, { cwd, env: { ...runtime.env,
    CARGO_HOME: path.join(runtime.directory, "cargo"), RUSTUP_HOME: path.join(runtime.directory, "rustup"),
    CARGO_TARGET_DIR: path.join(runtime.directory, "target"), RUSTUP_TOOLCHAIN: pins.compilerToolchain,
    CARGO_NET_GIT_FETCH_WITH_CLI: "true", CARGO_TERM_COLOR: "never" }, windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"] });
  const child = activeChild;
  for (const pipe of [child.stdout, child.stderr]) pipe.on("data", bytes => {
    logHash.update(bytes); logBytes += bytes.length; tail = Buffer.concat([tail, bytes]).subarray(-32768);
  });
  if (capture) child.stdout.on("data", bytes => { captured = Buffer.concat([captured, bytes]).subarray(-16384); });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject); child.once("close", (code, signal) => { row.signal = signal; resolve(code); });
  });
  row.exitCode = code; row.finishedAt = new Date().toISOString();
  assert.equal(row.signal, null, "Signal-terminated compiler is not safe completed-source evidence");
  assert.equal(code, 0, `${command} exited ${code}: ${tail.toString().slice(-8192)}`);
  return captured.toString().trim();
};
try {
  await mkdir(reportRoot, { recursive: true });
  await assert.rejects(access(reportFile), { code: "ENOENT" });
  for (const file of sourceFiles) report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 8 * 1024 ** 3);
  runtime = await createOwnedRuntimeScratch("resvg-source-compile-");
  report.executedHead = await run("git", ["rev-parse", "HEAD"], { capture: true });
  assert.match(report.executedHead, /^[a-f0-9]{40}$/);
  const manifest = await fetch(compileContract.nightlyManifestUrl, { signal: AbortSignal.timeout(60000) });
  assert.equal(manifest.status, 200);
  const chunks = []; let manifestBytes = 0;
  for await (const bytes of manifest.body) { manifestBytes += bytes.length; assert.ok(manifestBytes <= 1048576); chunks.push(bytes); }
  assert.equal(sha(Buffer.concat(chunks)), compileContract.nightlyManifestSha256, "Pinned compiler distribution manifest");
  await run("rustup", ["toolchain", "install", pins.compilerToolchain, "--profile", "minimal", "--target", "wasm32-unknown-unknown"]);
  report.rustcVersion = await run("rustup", ["run", pins.compilerToolchain, "rustc", "--version"], { capture: true });
  assert.equal(report.rustcVersion, compileContract.rustcVersion);
  report.cargoVersion = await run("rustup", ["run", pins.compilerToolchain, "cargo", "--version"], { capture: true });
  const source = path.join(runtime.directory, "source");
  await run("git", ["clone", "--filter=blob:none", "--no-checkout", "https://github.com/thx/resvg-js.git", source]);
  await run("git", ["-C", source, "checkout", pins.upstream]);
  assert.equal(await run("git", ["-C", source, "rev-parse", "HEAD"], { capture: true }), pins.upstream);
  const cargoPath = path.join(source, "Cargo.toml"), lockPath = path.join(source, "Cargo.lock");
  const cargo = pinCargoManifest(await readFile(cargoPath));
  await writeFile(cargoPath, repairPathfinder ? pinPathfinderManifest(Buffer.from(cargo)) : cargo);
  const originalLock = await readFile(path.join(root, "images/resvg-source/Cargo.candidate.lock"));
  report.originalLock = verifyCompileLock(originalLock);
  const pathfinderLock = repairPathfinder ? makePathfinderLock(originalLock) : originalLock;
  const lock = repairBytes ? makePublishedBytesLock(pathfinderLock) : pathfinderLock;
  report.lock = inspectCandidateLock(lock.toString()); await writeFile(lockPath, lock, { flag: "wx" });
  if (repairPathfinder) {
    report.retainedRepairedLock = `outputs/reports/resvg-source-compile-${runId}.lock`;
    await writeFile(path.join(root, report.retainedRepairedLock), lock, { flag: "wx" });
  }
  report.sourceCompilationAttempted = true;
  await run("rustup", [...compileContract.command], { cwd: source });
  assert.equal(sha(await readFile(lockPath)), report.lock.sha256, "Locked compiler must not re-resolve or modify dependency graph");
  const binary = path.join(runtime.directory, "target/wasm32-unknown-unknown/release/resvg_js.wasm");
  assert.ok((await stat(binary)).size <= compileContract.maxRawWasmBytes);
  report.rawWasm = inspectRawWasm(await readFile(binary));
  report.rawWasm.retainedPath = `outputs/reports/resvg-source-compile-${runId}.wasm`;
  const destination = path.join(root, report.rawWasm.retainedPath);
  await assert.rejects(access(destination), { code: "ENOENT" }); await copyFile(binary, destination);
  report.sourceCompilationSucceeded = true; report.status = "compiled-private-raw-wasm-not-bindgen-or-browser-acceptance";
} catch (error) {
  report.status = "failed-private-source-compilation-not-acceptance";
  report.failures.push(String(error.stack ?? error)); process.exitCode = 1;
} finally {
  try {
    assert.ok(!activeChild || activeChild.pid === undefined || (activeChild.exitCode !== null && activeChild.signalCode === null),
      "Do not delete scratch of a live or signal-terminated compiler");
    await runtime?.close(); report.ownedScratchRemoved = Boolean(runtime);
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  } catch (error) { report.failures.push("Owned cleanup/source verification: " + error); report.status = "failed-private-source-compilation-not-acceptance"; process.exitCode = 1; }
  report.compilerLog = { bytes: logBytes, sha256: logHash.digest("hex"), retainedTailBytes: tail.length, tail: tail.toString() };
  report.finishedAt = new Date().toISOString();
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: path.relative(root, reportFile), status: report.status, attempted: report.sourceCompilationAttempted,
    compiled: report.sourceCompilationSucceeded, ownedScratchRemoved: report.ownedScratchRemoved, failures: report.failures }));
}
