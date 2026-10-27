import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { pins, sha, pinCargoManifest } from "../images/resvg-source/source-pins.mjs";
import { makePathfinderLock, pinPathfinderManifest, pathfinderRepair } from "../images/resvg-source/pathfinder-repair.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const json = async file => JSON.parse(await read(file));
const proof = await json("evidence/2026-10-27-svg-compiler-failure-and-pathfinder-repair.json");

test("actual first SVG source compilation stays failed with eight API errors and exact compiler/source/cleanup proof", async () => {
  const bytes = await read(proof.rawReceipt); assert.equal(bytes.length, proof.rawReceiptBytes); assert.equal(sha(bytes), proof.rawReceiptSha256);
  const row = JSON.parse(bytes);
  assert.equal(row.status, "failed-private-source-compilation-not-acceptance"); assert.equal(row.executedHead, proof.failedRun.headSha);
  assert.equal(row.rustcVersion, proof.compilerActuallyExecuted);
  assert.equal(row.sourceCompilationAttempted, true); assert.equal(row.sourceCompilationSucceeded, false);
  assert.equal(row.ownedScratchRemoved, true); assert.equal(row.rawWasm, null);
  const command = row.commands.at(-1); assert.equal(command.exitCode, 101); assert.equal(command.signal, null);
  assert.match(row.compilerLog.tail, /round_ties_even/); assert.match(row.compilerLog.tail, /8 previous errors/);
  assert.match(row.compilerLog.tail, /pathfinder_simd-0.5.6/); assert.ok(row.compilerLog.retainedTailBytes <= 32768);
  const archive = await json(proof.executedSourceArchive); assert.equal(archive.sourceCommit, proof.failedRun.headSha);
  assert.deepEqual(Object.keys(archive.files).sort(), [".github/workflows/ci.yml", "images/resvg-source/compile-candidate.mjs"]);
  for (const [file, digest] of Object.entries(row.sourcePins)) {
    let source;
    if (archive.files[file]) {
      const old = archive.files[file]; source = gunzipSync(Buffer.from(old.gzipBase64, "base64"), { maxOutputLength: 32768 });
      assert.equal(source.length, old.bytes); assert.equal(sha(source), old.sha256);
    } else source = await read(file);
    assert.equal(sha(source), digest, `Actual failed-run source: ${file}`);
  }
});
test("directed lock repair changes exactly one package, retains all other package bytes and rejects a different baseline", async () => {
  const before = await read("images/resvg-source/Cargo.candidate.lock"), after = makePathfinderLock(before);
  const a = before.toString().split("[[package]]"), b = after.toString().split("[[package]]");
  assert.equal(a.length, b.length); const changes = a.flatMap((value, index) => value === b[index] ? [] : [[value, b[index]]]);
  assert.equal(changes.length, 1); assert.match(changes[0][0], /name = "pathfinder_simd"\nversion = "0.5.6"/);
  assert.match(changes[0][1], /name = "pathfinder_simd"\nversion = "0.5.2"/);
  assert.ok(changes[0][1].includes(pathfinderRepair.newChecksum));
  assert.equal(changes[0][1].replace('version = "0.5.2"', 'version = "0.5.6"').replace(pathfinderRepair.newChecksum, pathfinderRepair.oldChecksum), changes[0][0]);
  assert.throws(() => makePathfinderLock(after)); assert.throws(() => makePathfinderLock(Buffer.concat([before, Buffer.from("\n")])));
  assert.equal(pathfinderRepair.candidateOnly, true); assert.equal(pathfinderRepair.identicalRenderingClaim, false);
});
test("manifest repair pins the original declared dependency, not new compiler features or altered rasterization code", async () => {
  const before = Buffer.from(pinCargoManifest(await read("fixtures/source/resvg-2.6.2-Cargo.toml")));
  const after = pinPathfinderManifest(before);
  assert.equal(after.replace('pathfinder_simd = { version = "=0.5.2"', 'pathfinder_simd = { version = "0.5.2"'), before.toString());
  assert.throws(() => pinPathfinderManifest(Buffer.from(after)));
  assert.equal(pins.compilerToolchain, "nightly-2023-12-11");
  assert.equal(proof.compilerVersionChanged, false); assert.equal(proof.roundingOrRenderingEquivalenceClaim, false);
  assert.equal(proof.originalFailedLockPreserved, true);
});
test("single private repair scope cannot run original failing job or normal matrices, and keeps failure artifacts distinct", async () => {
  const yaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml");
  const jobs = yaml.load((await read(".github/workflows/ci.yml")).toString()).jobs;
  assert.match(jobs["engine-matrix"].if, /inputs.engine != 'svg-source-compile-pathfinder'/);
  for (const id of ["verify", "browser-conversions", "svg-source-lock", "svg-source-compile"])
    assert.doesNotMatch(jobs[id].if, /svg-source-compile-pathfinder/);
  const job = jobs["svg-source-compile-pathfinder"];
  assert.equal(job.if, "github.event_name == 'workflow_dispatch' && inputs.engine == 'svg-source-compile-pathfinder'");
  assert.equal(job["timeout-minutes"], 20);
  assert.equal(job.steps.find(row => row.run?.startsWith("node ")).run, "node images/resvg-source/compile-candidate.mjs --pathfinder-0.5.2");
  const upload = job.steps.find(row => row.uses?.startsWith("actions/upload-artifact")); assert.equal(upload.if, "always()");
  assert.equal(upload.with.path.trim().split("\n").length, 3); assert.match(upload.with.path, /\.lock/);
});
