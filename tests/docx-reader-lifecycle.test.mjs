import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["workers/docx-conversion.ts"], bundle: true, format: "esm", write: false, platform: "browser" });
const { readMarkupTokens } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
function source(value, cancelFailure = false) {
  let cancelled = 0;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(value)); },
    cancel() { cancelled++; if (cancelFailure) throw new Error("Synthetic cancellation cleanup failure"); } });
  return { stream, get cancelled() { return cancelled; } };
}
const runtime = { assertActive() {}, progress() {} };
test("early XML consumer termination cancels its bounded source and releases the reader lock", async () => {
  const input = source("<w:document>");
  for await (const token of readMarkupTokens(input.stream, runtime)) { assert.equal(token.kind, "start"); break; }
  assert.equal(input.cancelled, 1); assert.equal(input.stream.locked, false);
});
test("primary tokenization failure is preserved while cancellation is attempted and reader released", async () => {
  const input = source("<!DOCTYPE x><x/>", true);
  await assert.rejects(async () => { for await (const token of readMarkupTokens(input.stream, runtime)) void token; }, /DTDs/);
  assert.equal(input.cancelled, 1); assert.equal(input.stream.locked, false);
});
test("completed XML releases its reader without claiming another input cancellation was needed", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("<x/>")); controller.close(); } });
  let count = 0; for await (const token of readMarkupTokens(stream, runtime)) { assert.equal(token.kind, "start"); count++; }
  assert.equal(count, 1); assert.equal(stream.locked, false);
});
