import assert from "node:assert/strict";
import test from "node:test";
import { createSelectedWasmListingCollector, WASM_LISTING_LIMITS } from "../scripts/lib/selected-wasm-disassembly.mjs";
test("Selected disassembly streams past unneeded output while retaining only exact numeric functions and real original offsets", () => {
  const collector = createSelectedWasmListingCollector(new Set([1, 3]));
  const text = "000001 func[0]:\n 000002: 0b | end\n000003 func[1] <export>:\n 000004: 10 03 | call 3\n000007 func[2]:\n" +
    " 000008: 01 | nop\n".repeat(10000) + "000009 func[3]:\n 00000a: 0b | end\n";
  const bytes = Buffer.from(text);
  for (let i = 0; i < bytes.length; i += 7) collector.feed(bytes.subarray(i, i + 7));
  const result = collector.finish(); assert.equal(result.listings.length, 2); assert.equal(result.streamedBytes, bytes.length);
  assert.equal(result.listings[0].text, "000003 func[1] <export>:\n 000004: 10 03 | call 3\n");
  assert.equal(result.listings[1].text, "000009 func[3]:\n 00000a: 0b | end\n");
  assert.ok(result.retainedBytes < 128 && result.discardedBytes > 100000);
});
test("Selected collector rejects missing or duplicate selected headers rather than inventing an empty function", () => {
  const missing = createSelectedWasmListingCollector(new Set([1])); missing.feed(Buffer.from("000001 func[0]:\n"));
  assert.throws(() => missing.finish(), /All selected/);
  const duplicate = createSelectedWasmListingCollector(new Set([1]));
  assert.throws(() => duplicate.feed(Buffer.from("000001 func[1]:\n000002 func[1]:\n")), /Duplicate/);
});
test("Disassembly line, stream, selected-body and retained-total caps stay enforced", () => {
  for (const [limits, text, message] of [
    [{ ...WASM_LISTING_LIMITS, lineChars: 8 }, "x".repeat(10), /line cap/],
    [{ ...WASM_LISTING_LIMITS, streamedBytes: 1 }, "abc", /stream cap/],
    [{ ...WASM_LISTING_LIMITS, perFunctionBytes: 1 }, "000001 func[1]:\n", /function listing cap/],
    [{ ...WASM_LISTING_LIMITS, retainedBytes: 1 }, "000001 func[1]:\n", /total cap/],
  ]) {
    const collector = createSelectedWasmListingCollector(new Set([1]), limits);
    assert.throws(() => collector.feed(Buffer.from(text)), message);
  }
});
