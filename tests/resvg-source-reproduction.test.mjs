import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { remappedRustcInvocation, remappedSourceRoot } from "../images/resvg-source/remap-contract.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
const root = "/home/runner/work/fileconverter/fileconverter", runtime = root + "/work/resvg-source-compile-Ab3XyZ";
const env = { CARGO_HOME: runtime + "/cargo", RUSTUP_HOME: runtime + "/rustup", RUSTUP_TOOLCHAIN: "nightly-2023-12-11" };
const command = env.RUSTUP_HOME + "/toolchains/nightly-2023-12-11-x86_64-unknown-linux-gnu/bin/rustc";
test("actual first repeat probe remains failed before generation with exact pinned compiler/lock and complete owned cleanup", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-28-svg-source-repeat-first-terminal.json"));
  const topBytes = await readFile(new URL("../" + proof.repeatReceipt, import.meta.url));
  const compileBytes = await readFile(new URL("../" + proof.compileReceipt, import.meta.url));
  for (const [bytes, member] of [[topBytes, proof.members.find(row => row.name.startsWith("resvg-source-repeat-"))],
    [compileBytes, proof.members.find(row => row.name.endsWith("1.json"))]]) {
    assert.equal(bytes.length, member.bytes); assert.equal(sha(bytes), member.sha256);
  }
  const top = JSON.parse(topBytes), compile = JSON.parse(compileBytes);
  assert.equal(top.status, "failed-private-raw-source-reproduction"); assert.equal(top.rawBytesEqual, false);
  assert.equal(top.builds.length, 1); assert.equal(top.ownedDriverScratchRemoved, true);
  assert.equal(compile.sourceCompilationSucceeded, false); assert.equal(compile.rawWasm, null);
  assert.equal(compile.ownedScratchRemoved, true); assert.equal(compile.rustcVersion, "rustc 1.76.0-nightly (d86d65bbc 2023-12-10)");
  assert.match(compile.compilerLog.tail, /nightly-2023-12-11-x86_64-unknown-linux-gnu/);
  assert.match(compile.compilerLog.tail, /failed to run `rustc` to learn about target-specific information/);
  assert.equal(compile.lock.sha256, "7bf87e7ccbd783700754844a8357a20b7b097c2c69e31476d9f44ba19ff886bc");
  const archive = JSON.parse(await read(proof.executedSourceArchive));
  assert.equal(archive.sourceCommit, compile.executedHead);
  for (const receipt of [top, compile]) for (const [file, digest] of Object.entries(receipt.sourcePins)) {
    const old = archive.files[file]; let bytes;
    if (old) { bytes = gunzipSync(Buffer.from(old.gzipBase64, "base64"), { maxOutputLength: 32768 }); assert.equal(bytes.length, old.bytes); assert.equal(sha(bytes), old.sha256); }
    else bytes = await readFile(new URL("../" + file, import.meta.url));
    assert.equal(sha(bytes), digest, file);
  }
});
test("owned build path remapping changes only source names, retaining every compiler argument and pinned compiler", () => {
  const args = [command, "--crate-name", "resvg_js", "--target", "wasm32-unknown-unknown", "-C", "opt-level=3"];
  const row = remappedRustcInvocation(root, env, args);
  assert.equal(remappedSourceRoot, "/within/resvg-build"); assert.equal(row.command, command); assert.equal(row.runtime, runtime);
  assert.deepEqual(row.args, [`--remap-path-prefix=${runtime}=/within/resvg-build`, ...args.slice(1)]);
  assert.deepEqual(args, [command, "--crate-name", "resvg_js", "--target", "wasm32-unknown-unknown", "-C", "opt-level=3"]);
  assert.deepEqual(remappedRustcInvocation(root, { ...env, RUSTUP_TOOLCHAIN: env.RUSTUP_TOOLCHAIN + "-x86_64-unknown-linux-gnu" }, args), row);
  assert.throws(() => remappedRustcInvocation(root, { ...env, RUSTUP_TOOLCHAIN: env.RUSTUP_TOOLCHAIN + "-aarch64-unknown-linux-gnu" }, args));
});
test("wrapper rejects outside scratch, unexpected compiler, mixed flags and unpinned toolchain", () => {
  for (const change of [{ CARGO_HOME: "/tmp/shared/cargo" }, { RUSTUP_HOME: "/other/toolchain" }, { RUSTUP_TOOLCHAIN: "stable" },
    { RUSTFLAGS: "-C opt-level=0" }, { CARGO_ENCODED_RUSTFLAGS: "-C\u001fopt-level=0" }, { RUSTC_WORKSPACE_WRAPPER: "/other" }])
    assert.throws(() => remappedRustcInvocation(root, { ...env, ...change }, [command, "-vV"]));
  assert.throws(() => remappedRustcInvocation(root, env, ["rustc", "-vV"]));
  assert.throws(() => remappedRustcInvocation(root, env, [command, "--remap-path-prefix=a=b"]));
  assert.throws(() => remappedRustcInvocation(root, env, []));
});
test("source repeat recipe uses the unchanged locked compiler twice in distinct owned scratch and compares full raw bytes", async () => {
  const source = await read("images/resvg-source/reproduce-raw-source.mjs"), wrapper = await read("images/resvg-source/remap-rustc.mjs");
  assert.match(source, /for \(const index of \[1, 2\]\)/);
  assert.match(source, /"images\/resvg-source\/compile-candidate.mjs", "--bytes-1.6.0"/);
  assert.match(source, /RUSTC_WRAPPER: wrapper/); assert.match(source, /CARGO_ENCODED_RUSTFLAGS: ""/);
  assert.match(source, /assert.notEqual\(first.runtimeFromReceipt, second.runtimeFromReceipt/);
  assert.match(source, /assert.deepEqual\(a, b,/); assert.match(source, /rawBytesEqual = true/);
  assert.match(source, /assert.equal\(receipt.lock.sha256, bytesRepair.repairedLockSha256\)/);
  assert.match(source, /compileContract.command/); assert.match(source, /Random build-runtime prefix must not survive/);
  assert.match(source, /removeVerifiedOwnDuplicate/); assert.match(source, /before.ino, after.ino/);
  assert.match(source, /await runtime\?\.close\(\)/); assert.match(source, /windowsHide: true/); assert.match(wrapper, /windowsHide: true/);
  assert.doesNotMatch(source + wrapper, /WebAssembly\.instantiate|test\.mkv|cargo update|generate-lockfile|docker|fetchFile/);
  assert.match(source, /bindgenProcessingAttempted: false/); assert.match(source, /publicEngineReplacement: false/);
});
test("dedicated workflow bootstraps only its exact recipe file, otherwise manual, and cannot select existing public CI", async () => {
  const yaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml");
  const row = yaml.load(await read(".github/workflows/svg-source-reproduction.yml"));
  assert.deepEqual(Object.keys(row.on), ["workflow_dispatch", "push"]);
  assert.deepEqual(row.on.push.branches, ["media-options"]);
  assert.deepEqual(row.on.push.paths, [".github/workflows/svg-source-reproduction.yml"]);
  assert.deepEqual(Object.keys(row.jobs), ["reproduce-remapped-raw-svg"]);
  const job = row.jobs["reproduce-remapped-raw-svg"]; assert.equal(job["timeout-minutes"], 20);
  assert.equal(job.steps.find(step => step.run?.startsWith("node ")).run, "node images/resvg-source/reproduce-raw-source.mjs");
  assert.equal(job.steps.find(step => step.name === "Verify public engines were not replaced").if, "always()");
  const upload = job.steps.find(step => step.uses?.startsWith("actions/upload-artifact"));
  assert.equal(upload.with["retention-days"], 1); assert.equal(upload.with.path.trim().split("\n").length, 7);
  assert.doesNotMatch(upload.with.path, /work\/|cargo\/|target\//);
});
