import assert from "node:assert/strict";
import test from "node:test";
import { encodeBoundedValidationChunk, decodeBoundedValidationChunk, VALIDATION_CHUNK_LIMITS } from "../scripts/lib/bounded-validation-chunk.mjs";

test("independent validation round-trips every byte with fixed chunk and string-piece limits", () => {
  for (const length of [1, 2, 3, 255, 8192, 8193, 65535, 65536]) {
    const source = Uint8Array.from({ length }, (_, at) => at % 256);
    const wire = encodeBoundedValidationChunk(source);
    assert.ok(wire.length <= VALIDATION_CHUNK_LIMITS.encodedCharacters);
    assert.deepEqual(decodeBoundedValidationChunk(wire), Buffer.from(source));
  }
  // The function actually installed in Chromium has no hidden module closure.
  const installed = Function("return (" + encodeBoundedValidationChunk.toString() + ")")();
  assert.equal(installed(new Uint8Array([0, 128, 255])), "AID/");
  assert.equal(VALIDATION_CHUNK_LIMITS.stringPieceBytes, 8192);
});

test("whole-file, empty, malformed and noncanonical payloads fail before file writes", () => {
  for (const source of [new Uint8Array(), new Uint8Array(65537), new Uint8Array(5 * 1024 ** 2), [1, 2], null])
    assert.throws(() => encodeBoundedValidationChunk(source));
  for (const value of ["", "A", "AAAAA", "====", "AA=A", "AB==", "AAB=", "AA==\n", "AAAA".repeat(21847), null, [0]])
    assert.throws(() => decodeBoundedValidationChunk(value));
});
