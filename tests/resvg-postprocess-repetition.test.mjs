import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
test("actual two-pass postprocessor proof keeps full Wasm/glue equality and explicit limits separate from browser qualification", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-28-svg-postprocess-repeat-terminal.json")), pins = JSON.parse(await read(proof.artifactPin));
  const bytes = await readFile(new URL("../" + proof.rawReceipt, import.meta.url));
  assert.equal(bytes.length, pins.receiptBytes); assert.equal(sha(bytes), pins.receiptSha256);
  const row = JSON.parse(bytes); assert.equal(row.executedHead, pins.headSha); assert.deepEqual(row.failures, []);
  assert.equal(row.twoSourceBuildReceiptsAndRawEqualityVerified, true); assert.equal(row.processedWasmAndGlueByteIdentical, true);
  assert.equal(row.variants.length, 2); assert.equal(row.variants[0].boundedSha256, row.variants[1].boundedSha256);
  assert.equal(row.variants[0].glueSha256, row.variants[1].glueSha256);
  for (const variant of row.variants) {
    assert.equal(variant.boundedSha256, pins.wasmSha256); assert.equal(variant.glueSha256, pins.glueSha256);
    assert.equal(variant.memory.length, 1); assert.equal(variant.memory[0].initialPages, 24);
    assert.equal(variant.memory[0].maximumPages, 1536); assert.equal(variant.memory[0].maximumExplicit, true);
    assert.equal(variant.memoryBoundProof.onlyMemorySectionChanged, true);
    assert.equal(variant.memoryBoundProof.allCodeAndDataBytesPreserved, true);
    assert.equal(variant.staticAbi.namesAndKindsEqual, true);
  }
  assert.equal(row.ownedScratchRemoved, true); assert.equal(row.publicEngineUnchanged, true);
  assert.equal(row.sourceRecompileAttempted, false); assert.equal(row.rendererExecuted, false);
  assert.equal(row.browserMemoryOrFidelityAcceptance, false); assert.equal(row.publicEngineReplacement, false);
  assert.equal(proof.browserQualificationForNewBytes, false); assert.equal(proof.originalGoalComplete, false);
  for (const [file, digest] of Object.entries(row.sourcePins)) assert.equal(sha(await readFile(new URL("../" + file, import.meta.url))), digest, file);
});
test("next postprocessor reuses both proven raw source receipts, never rebuilds or replaces public converter", async () => {
  const source = await read("images/resvg-source/postprocess-repeated-source.mjs");
  assert.match(source, /inputPin.artifactSha256/); assert.match(source, /inputPin.compilerReceiptMembers/);
  assert.match(source, /sourceRepeat.rawBytesEqual, true/); assert.match(source, /sourceRepeat.builds.length, 2/);
  assert.match(source, /assert.notEqual\(sourceRepeat.builds\[0\].runtimeFromReceipt/);
  assert.match(source, /receipt.rawWasm.sha256, sha\(raw\)/); assert.match(source, /receipt.lock.sha256, sha\(members.get/);
  assert.match(source, /compileContract.command/); assert.match(source, /sourceRecompileAttempted: false/);
  assert.doesNotMatch(source, /cargo build|rustup.*install|compile-candidate.mjs|WebAssembly\.instantiate|test\.mkv|docker/);
  assert.match(source, /bindgenTool.archiveSha256/); assert.match(source, /verifyBindgenVersion\(report.toolVersion\)/);
  assert.match(source, /for \(const index of \[1, 2\]\)/);
  assert.match(source, /assert.deepEqual\(bounded.bytes, first.wasm/); assert.match(source, /assert.deepEqual\(glue, first.glue/);
  assert.match(source, /boundPrivateMemory\(processed, experimentalMaximumBytes\)/);
  assert.match(source, /abi.namesAndKindsEqual, true/); assert.match(source, /browserMemoryOrFidelityAcceptance: false/);
  assert.match(source, /windowsHide: true/); assert.match(source, /await runtime\?\.close\(\)/);
});
test("dedicated postprocessor bootstrap is isolated from all raw/normal CI jobs and retains no duplicate candidate", async () => {
  const yaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml");
  const row = yaml.load(await read(".github/workflows/svg-source-postprocess-repeat.yml"));
  assert.deepEqual(row.on.push.branches, ["media-options"]);
  assert.deepEqual(row.on.push.paths, [".github/workflows/svg-source-postprocess-repeat.yml"]);
  assert.deepEqual(Object.keys(row.jobs), ["postprocess-repeated-source-svg"]);
  assert.equal(row.permissions.actions, "read");
  const job = row.jobs["postprocess-repeated-source-svg"]; assert.equal(job["timeout-minutes"], 10);
  assert.equal(job.steps.find(step => step.run?.startsWith("node ")).run, "node images/resvg-source/postprocess-repeated-source.mjs");
  const upload = job.steps.find(step => step.uses?.startsWith("actions/upload-artifact"));
  assert.equal(upload.with["retention-days"], 1); assert.equal(upload.with.path.trim().split("\n").length, 3);
  assert.doesNotMatch(upload.with.path, /work\/|cargo\/|processed-2/);
});
