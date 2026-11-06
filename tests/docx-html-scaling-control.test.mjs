import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { DOCX_HTML_SCALING_PLAN as plan, summarizeDocxHtmlRunMemory, renderDocxHtmlScalingSummary } from "../scripts/lib/docx-html-scaling-control.mjs";
import { bindLargeDocumentOutputValidationBacking } from "../scripts/lib/opfs-output-validation-backing.mjs";
test("document stress plan uses meaningful complete outputs, three repeats and unchanged primary/cleanup budgets", () => {
  assert.deepEqual(plan.paragraphs, [2048, 32768]); assert.equal(plan.repeats, 3);
  assert.equal(plan.cleanupRecoveryLimitMiB, 96); assert.equal(plan.outputLimitBytes, 256 * 1048576);
  assert.ok(plan.sampleCap <= 12000); assert.equal(plan.requiredDiskBytes, 2 * 1024 ** 3);
});
const sample = (time, bytes) => ({ timestamp: new Date(time).toISOString(), privateBytes: bytes,
  processes: bytes === null ? null : [{ privateBytes: bytes / 2 }, { privateBytes: bytes / 2 }] });
test("primary sums full tree, excludes unavailable samples without zero replacement and keeps blank formula separate from idle/cleanup", () => {
  const rows = [sample(1, 100 * 1048576), sample(2, null), sample(3, 300 * 1048576), sample(4, 900 * 1048576)];
  const r = summarizeDocxHtmlRunMemory(rows, 1, 3, { stable: true, privateBytes: 90 * 1048576 },
    { stable: true, privateBytes: 160 * 1048576 }, { stable: true, privateBytes: 200 * 1048576 });
  assert.equal(r.validSamples, 2); assert.equal(r.unavailableSamples, 1);
  assert.equal(r.incrementalPrivateMiB, 210); assert.equal(r.conversionOnlyPrivateMiB, 140); assert.equal(r.cleanupDeltaFromLoadedMiB, 40);
  assert.throws(() => summarizeDocxHtmlRunMemory([sample(2, null)], 1, 3, { stable: true }, { stable: true }, { stable: true }));
  assert.throws(() => summarizeDocxHtmlRunMemory([{ ...sample(2, 10), processes: [{ privateBytes: 9 }] }], 1, 3,
    { stable: true }, { stable: true }, { stable: true }));
});
test("large document probe refuses oversized output before browser/host probing rather than increasing buffers", async () => {
  const runtime = await createOwnedRuntimeScratch("docx-scaling-probe-unit-");
  try {
    const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
    await assert.rejects(bindLargeDocumentOutputValidationBacking({ evaluate() { throw new Error("Must not probe"); } }, profile,
      "within-test-a", plan.outputLimitBytes + 1), { code: "ERR_ASSERTION" });
  } finally { await runtime.close(); }
});
test("numeric report renderer cannot embed fixture contents and retains private scope", () => {
  const html = renderDocxHtmlScalingSummary({ cases: [{ kind: "complete", sourceBytes: 140000000, outputBytes: 139000000,
    metrics: { elapsedMs: 1234 }, runMemory: { incrementalPrivateMiB: 150, cleanupDeltaFromLoadedMiB: 25 } }] });
  assert.match(html, /Not public qualification/); assert.match(html, /<svg/); assert.match(html, /150\.000/);
  assert.throws(() => renderDocxHtmlScalingSummary({ cases: [{ kind: "complete", sourceBytes: "<script>", runMemory: {}, metrics: {} }] }));
});
test("fixture helper streams ZIP and validates every ordered paragraph without exporting output or accumulating document text", async () => {
  const source = await readFile("scripts/lib/docx-html-scaling-fixtures.py", "utf8");
  assert.match(source, /ZIP_STORED/); assert.match(source, /sink, 'w'/); assert.match(source, /source\.read\(65536\)/);
  assert.match(source, /self\.current == expected/); assert.match(source, /len\(self\.current\) <= 8192/);
  assert.doesNotMatch(source, /read\(\)|read_bytes|read_text|\.append\(chunk/);
});
