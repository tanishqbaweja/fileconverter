// Two fresh source builds, one exact private raw-Wasm comparison; no rendering.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, chmod, lstat, mkdir, readFile, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { sha } from "./source-pins.mjs";
import { compileContract, inspectRawWasm } from "./compile-contract.mjs";
import { bytesRepair } from "./bytes-repair.mjs";
import { remappedSourceRoot } from "./remap-contract.mjs";
assert.equal(process.platform, "linux"); assert.equal(process.argv.length, 2);
assert.match(process.env.GITHUB_RUN_ID ?? "", /^[0-9]{1,14}$/);
const root = path.resolve(import.meta.dirname, "../.."), runId = process.env.GITHUB_RUN_ID;
const output = path.join(root, "outputs/reports"), reportFile = path.join(output, `resvg-source-repeat-${runId}.json`);
const report = { schemaVersion: 1, runId, startedAt: new Date().toISOString(), status: "running", sourcePins: {}, builds: [], failures: [],
  scope: "Two fresh remapped source compilations only, before bindgen/fidelity/browser/release qualification",
  remappedSourceRoot, samePinnedCompilerLockAndCargoArguments: true, optimizationOrCodecSettingsChanged: false,
  sourceLocationStringsChanged: true, rawBytesEqual: false, bindgenProcessingAttempted: false,
  rendererExecuted: false, publicEngineReplacement: false, originalGoalComplete: false };
const sourceFiles = ["images/resvg-source/reproduce-raw-source.mjs", "images/resvg-source/remap-rustc.mjs", "images/resvg-source/remap-contract.mjs",
  "images/resvg-source/compile-candidate.mjs", "images/resvg-source/compile-contract.mjs", "images/resvg-source/source-pins.mjs",
  "images/resvg-source/pathfinder-repair.mjs", "images/resvg-source/bytes-repair.mjs", "images/resvg-source/Cargo.candidate.lock",
  ".github/workflows/ci.yml", ".github/workflows/svg-source-reproduction.yml"];
let runtime, child;
const removeVerifiedOwnDuplicate = async (file, expectedSha) => {
  assert.equal(path.dirname(file), output); assert.ok(path.basename(file).startsWith(`resvg-source-compile-${runId}2.`));
  const before = await lstat(file, { bigint: true }); assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.equal(sha(await readFile(file)), expectedSha);
  const after = await lstat(file, { bigint: true }); assert.equal(before.dev, after.dev); assert.equal(before.ino, after.ino); assert.equal(before.mtimeNs, after.mtimeNs);
  await unlink(file); await assert.rejects(access(file), { code: "ENOENT" });
};
try {
  await mkdir(output, { recursive: true }); await assert.rejects(access(reportFile), { code: "ENOENT" });
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 8 * 1024 ** 3);
  for (const file of sourceFiles) report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  const published = await readFile(path.join(root, "public/engines/svg/resvg.wasm")); report.publicBeforeSha256 = sha(published);
  runtime = await createOwnedRuntimeScratch("resvg-source-repeat-");
  const wrapper = path.join(root, "images/resvg-source/remap-rustc.mjs"); await chmod(wrapper, 0o755);
  for (const index of [1, 2]) {
    const buildId = runId + index, base = path.join(output, `resvg-source-compile-${buildId}`);
    for (const extension of [".json", ".wasm", ".lock"]) await assert.rejects(access(base + extension), { code: "ENOENT" });
    const build = { index, buildId, startedAt: new Date().toISOString(), childSignal: null }; report.builds.push(build);
    child = spawn(process.execPath, ["images/resvg-source/compile-candidate.mjs", "--bytes-1.6.0"], {
      cwd: root, env: { ...runtime.env, GITHUB_RUN_ID: buildId, RUSTC_WRAPPER: wrapper,
        RUSTC_WORKSPACE_WRAPPER: "", RUSTFLAGS: "", CARGO_ENCODED_RUSTFLAGS: "" }, windowsHide: true, stdio: "inherit" });
    build.childExitCode = await new Promise((resolve, reject) => { child.once("error", reject);
      child.once("close", (code, signal) => { build.childSignal = signal; resolve(code); }); });
    build.finishedAt = new Date().toISOString(); assert.equal(build.childSignal, null); assert.equal(build.childExitCode, 0);
    const receiptBytes = await readFile(base + ".json"); assert.ok(receiptBytes.length <= 131072);
    const receipt = JSON.parse(receiptBytes); assert.equal(receipt.sourceCompilationSucceeded, true); assert.equal(receipt.ownedScratchRemoved, true);
    assert.deepEqual(receipt.failures, []); assert.equal(receipt.rustcVersion, compileContract.rustcVersion);
    assert.equal(receipt.lock.sha256, bytesRepair.repairedLockSha256); assert.deepEqual(receipt.commands.at(-1).args, [...compileContract.command]);
    assert.equal(receipt.commands.at(-1).exitCode, 0); assert.equal(receipt.commands.at(-1).signal, null);
    const wasmInfo = await lstat(base + ".wasm"); assert.ok(wasmInfo.size <= compileContract.maxRawWasmBytes);
    const wasm = await readFile(base + ".wasm"); build.rawWasm = inspectRawWasm(wasm); assert.equal(build.rawWasm.sha256, receipt.rawWasm.sha256);
    assert.equal(wasm.includes(Buffer.from("/resvg-source-compile-")), false, "Random build-runtime prefix must not survive in raw Wasm");
    assert.ok(wasm.includes(Buffer.from(remappedSourceRoot)), "Expected source-location remap must actually reach output");
    assert.equal(sha(await readFile(base + ".lock")), receipt.lock.sha256);
    build.receipt = { file: path.relative(root, base + ".json"), bytes: receiptBytes.length, sha256: sha(receiptBytes) };
    build.rawPath = path.relative(root, base + ".wasm"); build.lockPath = path.relative(root, base + ".lock");
    build.executedHead = receipt.executedHead; build.ownedCompilerScratchRemoved = receipt.ownedScratchRemoved;
    build.runtimeFromReceipt = path.dirname(receipt.commands.find(row => row.command === "git" && row.args[0] === "clone").args.at(-1));
  }
  const [first, second] = report.builds; assert.notEqual(first.runtimeFromReceipt, second.runtimeFromReceipt, "Fresh independent compile directories required");
  assert.equal(first.executedHead, second.executedHead);
  const a = await readFile(path.join(root, first.rawPath)), b = await readFile(path.join(root, second.rawPath));
  assert.deepEqual(a, b, "Raw Wasm must compare byte-for-byte, not just metadata"); report.rawBytesEqual = true;
  report.retainedRaw = first.rawPath; report.retainedLock = first.lockPath;
  await removeVerifiedOwnDuplicate(path.join(root, second.rawPath), second.rawWasm.sha256);
  await removeVerifiedOwnDuplicate(path.join(root, second.lockPath), bytesRepair.repairedLockSha256);
  report.secondOwnedRawAndLockRemovedAfterExactVerification = true;
  assert.equal(sha(await readFile(path.join(root, "public/engines/svg/resvg.wasm"))), report.publicBeforeSha256);
  report.publicEngineUnchanged = true; report.status = "two-fresh-private-remapped-raw-source-builds-byte-identical-not-browser-acceptance";
} catch (error) { report.status = "failed-private-raw-source-reproduction"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    assert.ok(!child || child.pid === undefined || (child.exitCode !== null && child.signalCode === null));
    await runtime?.close(); report.ownedDriverScratchRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  } catch (error) { report.failures.push("Owned cleanup/source verification: " + error); report.status = "failed-private-raw-source-reproduction"; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: path.relative(root, reportFile), status: report.status, builds: report.builds.length, rawBytesEqual: report.rawBytesEqual, failures: report.failures }));
}
