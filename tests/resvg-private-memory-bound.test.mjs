import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { boundPrivateMemory } from "../images/resvg-source/bound-private-memory.mjs";
import { definedWasmMemories } from "../images/resvg-source/memory-contract.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const moduleWithMemory = payload => Buffer.from([0,97,115,109,1,0,0,0,5,payload.length,...payload]);
test("private cap preserves exact original code/data and initial allocation without writing or executing published Wasm", async () => {
  const file = new URL("../public/engines/svg/resvg.wasm", import.meta.url), before = await readFile(file), originalSha = sha(before);
  const result = boundPrivateMemory(before, 96 * 1024 ** 2);
  assert.equal(result.proof.onlyMemorySectionChanged, true); assert.equal(result.proof.allCodeAndDataBytesPreserved, true);
  assert.equal(result.proof.priorMaximumBytes, null); assert.equal(result.proof.initialBytes, 1507328);
  assert.equal(result.proof.executed, false); assert.equal(result.proof.renderingOrProcessMemoryAcceptance, false);
  assert.equal(result.proof.publicPromotion, false); assert.equal(sha(before), originalSha); assert.equal(sha(await readFile(file)), originalSha);
  assert.equal(originalSha, "22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70");
  assert.equal(definedWasmMemories(result.bytes)[0].maximumBytes, 96 * 1024 ** 2);
  assert.equal(definedWasmMemories(before)[0].maximumExplicit, false);
  assert.equal(boundPrivateMemory(before, 96 * 1024 ** 2).proof.outputSha256, result.proof.outputSha256);
});
test("cap cannot raise existing limit, reduce initial pages, accept unaligned/overbudget values or accept unknown layouts", () => {
  const bounded = moduleWithMemory([1,1,1,2]);
  assert.throws(() => boundPrivateMemory(bounded, 196608), /Never raise/);
  for (const maximum of [0, 1, -65536, 251 * 1024 ** 2]) assert.throws(() => boundPrivateMemory(bounded, maximum));
  const initialThree = moduleWithMemory([1,0,3]); assert.throws(() => boundPrivateMemory(initialThree, 131072), /initial allocation/);
  assert.throws(() => boundPrivateMemory(Buffer.from([0,97,115,109,1,0,0,0]), 65536));
  const result = boundPrivateMemory(bounded, 65536);
  assert.equal(definedWasmMemories(result.bytes)[0].maximumBytes, 65536);
  assert.deepEqual(boundPrivateMemory(result.bytes, 65536).bytes, result.bytes);
});
