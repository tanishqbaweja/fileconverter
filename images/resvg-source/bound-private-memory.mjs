// Deterministic private post-link transformation, not public engine qualification.
import assert from "node:assert/strict";
import { definedWasmMemories, requireExplicitWasmMaximum } from "./memory-contract.mjs";
import { wasmSections } from "./published-version-witnesses.mjs";
import { sha } from "./source-pins.mjs";
const unsigned = value => {
  assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff);
  const bytes = [];
  do { const next = value % 128; value = Math.floor(value / 128); bytes.push(next | (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
};
export function boundPrivateMemory(bytes, maximumBytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 16 * 1024 * 1024);
  assert.ok(Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes % 65536 === 0 && maximumBytes <= 250 * 1024 ** 2);
  const before = definedWasmMemories(bytes); assert.equal(before.length, 1);
  assert.equal(before[0].shared, false, "This private resvg transformation accepts one unshared memory32 only");
  assert.ok(maximumBytes >= before[0].initialBytes, "Do not alter initial allocation or silently choose another budget");
  if (before[0].maximumExplicit) assert.ok(maximumBytes <= before[0].maximumBytes, "Never raise an existing memory maximum");
  const sections = wasmSections(bytes), index = sections.findIndex(section => section.id === 5);
  assert.ok(index >= 0); const section = sections[index], header = index ? sections[index - 1].end : 8;
  const payload = Buffer.concat([unsigned(1), unsigned(1), unsigned(before[0].initialPages), unsigned(maximumBytes / 65536)]);
  const replacement = Buffer.concat([Buffer.from([5]), unsigned(payload.length), payload]);
  const result = Buffer.concat([bytes.subarray(0, header), replacement, bytes.subarray(section.end)]);
  assert.ok(WebAssembly.validate(result));
  const after = definedWasmMemories(result); requireExplicitWasmMaximum(after, maximumBytes);
  assert.equal(after[0].initialPages, before[0].initialPages); assert.equal(after[0].maximumBytes, maximumBytes);
  const unchangedSections = input => wasmSections(input).filter(row => row.id !== 5)
    .map(row => ({ id: row.id, bytes: row.end - row.start, sha256: sha(input.subarray(row.start, row.end)) }));
  assert.deepEqual(unchangedSections(result), unchangedSections(bytes), "All non-memory section payloads, including code and data, must stay identical");
  assert.deepEqual(result.subarray(0, header), bytes.subarray(0, header));
  assert.deepEqual(result.subarray(header + replacement.length), bytes.subarray(section.end));
  return { bytes: result, proof: { inputSha256: sha(bytes), outputSha256: sha(result), maximumBytes,
    initialBytes: before[0].initialBytes, priorMaximumBytes: before[0].maximumBytes,
    onlyMemorySectionChanged: true, allCodeAndDataBytesPreserved: true,
    inputBytesMutated: false, executed: false, renderingOrProcessMemoryAcceptance: false, publicPromotion: false } };
}
