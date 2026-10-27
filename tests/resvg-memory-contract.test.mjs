import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { definedWasmMemories, requireExplicitWasmMaximum } from "../images/resvg-source/memory-contract.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const moduleWithMemory = payload => Buffer.from([0,97,115,109,1,0,0,0,5,payload.length,...payload]);
test("actual published SVG has one23-page initial memory but no declared maximum; this is not a measured process failure", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-27-svg-explicit-memory-gap.json"));
  const bytes = await read(proof.binary); assert.equal(bytes.length, proof.bytes); assert.equal(sha(bytes), proof.sha256);
  const memories = definedWasmMemories(bytes); assert.equal(memories.length, 1);
  assert.deepEqual(memories[0], { index:0, initialPages:23, initialBytes:1507328, maximumPages:null, maximumBytes:null, maximumExplicit:false, shared:false });
  assert.throws(() => requireExplicitWasmMaximum(memories, 128 * 1024 ** 2), /Missing maximum/);
  assert.equal(proof.explicitMaximumRequirementMet, false); assert.equal(proof.measuredRuntimeMemoryFailureClaim, false);
  assert.equal(proof.binaryPatchedOrReplaced, false); assert.equal(proof.primaryProcessTreeFormulaChanged, false);
});
test("candidate declaration gate rejects missing/excessive/unknown budgets without instantiating a renderer", () => {
  const bounded = definedWasmMemories(moduleWithMemory([1,1,1,2]));
  requireExplicitWasmMaximum(bounded, 131072);
  assert.throws(() => requireExplicitWasmMaximum(bounded, 65536));
  assert.throws(() => requireExplicitWasmMaximum(bounded, 251 * 1024 ** 2));
  assert.throws(() => requireExplicitWasmMaximum([], 131072));
  assert.throws(() => definedWasmMemories(Buffer.from("not wasm")));
  assert.throws(() => definedWasmMemories(moduleWithMemory([1,1,3,2])));
});
