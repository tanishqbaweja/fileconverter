import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Actual static-code audit distinguishes linker bounds from heap savings, acceptance and decoder-family completion", async () => {
  const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-static-layout-decoder-module-2026-10-06.json", import.meta.url)));
  for (const [file, hash] of Object.entries(proof.sources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash);
  assert.equal(proof.scope, "static-layout-only-not-conversion-not-browser-memory");
  assert.deepEqual(proof.rows.map((row) => [row.nativeAllocator, row.passivePayloadBytes, row.stackEnd, row.stackBase]),
    [["emmalloc", 401434, 1981792, 2243936], ["dlmalloc", 400158, 1979984, 2242128]]);
  for (const row of proof.rows) {
    assert.equal(row.passiveSegments, 594); assert.equal(row.decoderSet, "wide");
    assert.equal(row.enabledDecoders.length, 9); assert.equal(row.importCallbacks, 0);
    assert.equal(row.stackReserveBytes, 262144); assert.equal(row.heapBase, null);
    assert.equal(row.runtimeHeapSavingsBytes, null); assert.equal(row.primaryMemoryAcceptance, false);
    assert.deepEqual(row.actualMemory, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
    assert.ok(row.codeSectionBytes > row.passivePayloadBytes);
  }
  assert.equal(proof.rows[0].stackEnd - proof.rows[1].stackEnd, 1808);
  assert.ok(proof.limitations.some((text) => /specialist footprint.*unproven/.test(text)));
  const source = await readFile(new URL("../scripts/audit-mpeg2-static-layout.mjs", import.meta.url), "utf8");
  assert.match(source, /Unexpected import/); assert.match(source, /assert.equal\(importCallbacks, 0\)/);
  assert.doesNotMatch(source, /instance.exports\.(?:within_remux|malloc|__wasm_call_ctors)\(/);
});
