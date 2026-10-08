// SYNTHETIC CONTROL ONLY, never a converter candidate or published asset.
// Add three exports to actual compiled functions; all other sections stay exact.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readWasmFunctionMetadata } from "./wasm-function-metadata.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const LATE_COMPILED_CORE_SHA256 = "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c";
export function createRefstructExportOnlyControl(bytes) {
  assert.ok(bytes instanceof Uint8Array && bytes.length <= 16 * 1048576);
  assert.equal(sha(bytes), LATE_COMPILED_CORE_SHA256, "Exact compiled private diagnostic only");
  const originalModule = new WebAssembly.Module(bytes);
  const selected = readWasmFunctionMetadata(bytes, new Set(["av_refstruct_pool_alloc", "av_refstruct_pool_get", "av_refstruct_unref", "av_malloc"]));
  const additions = [
    { originalName: "av_refstruct_pool_alloc", exportName: "control_pool_alloc", params: ["i32", "i32"] },
    { originalName: "av_refstruct_pool_get", exportName: "control_pool_get", params: ["i32"] },
    { originalName: "av_refstruct_unref", exportName: "control_unref", params: ["i32"] },
  ].map(row => {
    const actual = selected.find(entry => entry.name === row.originalName);
    assert.deepEqual(actual.params, row.params); assert.deepEqual(actual.results, row.originalName === "av_refstruct_unref" ? [] : ["i32"]);
    return { ...row, functionIndex: actual.functionIndex, originalBodySha256: sha(bytes.subarray(actual.bodyStart, actual.bodyEnd)) };
  });
  const originalExports = WebAssembly.Module.exports(originalModule);
  for (const row of additions) assert.ok(!originalExports.some(entry => entry.name === row.exportName));
  const encode = number => {
    const out = []; do { const low = number % 128; number = Math.floor(number / 128); out.push(low | (number ? 128 : 0)); } while (number);
    return Buffer.from(out);
  };
  let offset = 8, boundary = bytes.length, exportCount = 0;
  const byte = () => { assert.ok(offset < boundary, "Truncated control section"); return bytes[offset++]; };
  const u32 = () => {
    let value = 0, factor = 1;
    for (let i = 0; i < 5; i++) {
      const next = byte(); value += (next & 127) * factor;
      if (!(next & 128)) { assert.ok(value <= 0xffffffff); return value; } factor *= 128;
    }
    throw new Error("Oversized control u32");
  };
  const pieces = [Buffer.from(bytes.subarray(0, 8))], sections = [];
  while (offset < bytes.length) {
    boundary = bytes.length; const start = offset, id = byte(), length = u32(), payloadStart = offset, end = offset + length;
    assert.ok(end <= bytes.length); assert.ok(sections.length < 64); boundary = end;
    let output;
    if (id === 7) {
      assert.equal(++exportCount, 1); assert.ok(length <= 16384);
      const count = u32(); assert.equal(count, originalExports.length); assert.ok(count <= 256);
      const entries = bytes.subarray(offset, end), extra = [];
      for (const row of additions) {
        const name = Buffer.from(row.exportName, "utf8");
        extra.push(encode(name.length), name, Buffer.from([0]), encode(row.functionIndex));
      }
      const payload = Buffer.concat([encode(count + additions.length), entries, ...extra]);
      output = Buffer.concat([Buffer.from([7]), encode(payload.length), payload]);
    } else output = Buffer.from(bytes.subarray(start, end));
    pieces.push(output);
    sections.push({ id, originalBytes: end - start, outputBytes: output.length,
      originalSha256: sha(bytes.subarray(start, end)), outputSha256: sha(output),
      unchanged: id !== 7, payloadStart });
    offset = end;
  }
  assert.equal(exportCount, 1);
  const binary = Buffer.concat(pieces), controlModule = new WebAssembly.Module(binary);
  assert.deepEqual(WebAssembly.Module.imports(controlModule), WebAssembly.Module.imports(originalModule));
  assert.deepEqual(WebAssembly.Module.exports(controlModule), [...originalExports, ...additions.map(row => ({ name: row.exportName, kind: "function" }))]);
  assert.ok(sections.filter(row => row.id !== 7).every(row => row.originalSha256 === row.outputSha256));
  return { binary, originalSha256: sha(bytes), controlSha256: sha(binary), additions, selected, sections,
    onlyExportSectionChanged: true, allCodeDataTypesImportsTablesMemoryExact: true,
    originalCompiledCoreChanged: false, syntheticOnly: true, usableForMediaOrAcceptance: false };
}
