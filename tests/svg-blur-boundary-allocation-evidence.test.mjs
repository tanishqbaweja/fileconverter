import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { assertBoundaryAllocationNotCompleted } from "../scripts/lib/svg-blur-boundary-allocation-recipe.mjs";
test("actual one-shot allocation captures retain exact reversible receipts, unchanged failures and normal cleanup", async () => {
  const terminal = JSON.parse(await readFile("evidence/2026-10-29-svg-blur-boundary-allocation-terminal.json"));
  const restored = [];
  for (const row of terminal.rawReceipts) {
    const bytes = await readFile(row.archivePath); assert.equal(bytes.length, row.archiveBytes); assert.equal(sha(bytes), row.archiveSha256);
    const raw = gunzipSync(bytes, { maxOutputLength: 4194304 }); assert.equal(raw.length, row.originalBytes); assert.equal(sha(raw), row.originalSha256);
    restored.push(JSON.parse(raw));
  }
  const [parent, browser] = restored;
  assert.equal(browser.executedHead, terminal.sourceHead); assert.equal(parent.allocationOnly, true); assert.equal(parent.childExit, 1);
  assert.equal(browser.boundaryAllocationDiagnosticOnly, true); assert.equal(browser.diagnosticPerturbsMemory, true);
  assert.equal(parent.allocatorCaptures.length, 3); assert.deepEqual(parent.allocatorErrors, []);
  assert.deepEqual([parent.stats.expected, parent.stats.unexpected, parent.stats.skipped, parent.stats.flaky], [0, 1, 0, 0]);
  assert.deepEqual(terminal.components.map(row => [row.component, row.alphaMismatches, row.maximumAlphaError]),
    [["rounded-no-filter", 7776, 18], ["square-no-filter", 0, 0], ["square-filtered", 37784, 4]]);
  assert.equal(terminal.diagnosticMemory.acceptanceMetric, false); assert.equal(terminal.diagnosticMemory.incrementalPrivateMiB, 280.6015625);
  assert.equal(terminal.diagnosticMemory.incrementalPrivateMiB, (browser.memory.peak.privateBytes - browser.blankBaseline.privateBytes) / 1048576);
  assert.deepEqual(parent.protectedOriginalBefore, parent.protectedOriginalAfter);
  assert.equal(parent.ownedRuntimeRemoved, true); assert.equal(parent.ownedBrowserRuntimeRemoved, true);
  assert.ok(parent.processCleanup.every(row => row.status === "owned-identity-absent")); assert.equal(parent.ownerProcessCleanup.status, "owned-identity-absent");
  assert.deepEqual(browser.forbiddenRequests, []); assert.equal(browser.forbiddenRequestOverflow, false);
  const ledger = JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  assert.throws(() => assertBoundaryAllocationNotCompleted(ledger, terminal.nativeWasmSha256), /already complete/);
});
test("retained native dumps authenticate allocation categories and exact object counts without adding overlapping counters", async () => {
  const terminal = JSON.parse(await readFile("evidence/2026-10-29-svg-blur-boundary-allocation-terminal.json"));
  assert.equal(terminal.captures.length, 3);
  for (const capture of terminal.captures) {
    assert.equal(capture.acceptanceMetric, false); assert.equal(capture.allocatorValuesOverlap, true); assert.equal(capture.summedAllocatorTotal, null);
    const archive = await readFile(capture.archive.path); assert.equal(sha(archive), capture.archive.sha256);
    const raw = gunzipSync(archive, { maxOutputLength: 8388608 }); assert.equal(raw.length, capture.archive.restoredBytes);
    assert.equal(sha(raw), capture.archive.restoredSha256);
    const objects = {};
    for (const event of JSON.parse(raw).traceEvents ?? []) {
      if (event.pid !== 30132) continue;
      for (const [name, details] of Object.entries(event.args?.dumps?.allocators ?? {})) {
        if (!/^blink_objects\/(Document|Frame|Node|WorkerGlobalScope|DetachedScriptState)$/.test(name)) continue;
        assert.equal(details.attrs.object_count.units, "objects"); objects[name] = Number.parseInt(details.attrs.object_count.value, 16);
      }
    }
    assert.deepEqual(objects, capture.processes.find(row => row.pid === 30132).objectCounts);
  }
  const [blank, mid, post] = terminal.captures;
  const renderer = capture => capture.processes.find(row => row.pid === 30132);
  const gpu = capture => capture.processes.find(row => row.pid === 680);
  assert.equal(renderer(blank).allocatorCategories.v8.size, 847928);
  assert.equal(renderer(post).allocatorCategories.v8.size, 44787504);
  assert.equal(renderer(post).allocatorCategories.blink_gc.size, 30146640);
  assert.equal(renderer(post).allocatorCategories.malloc.size, 54096674);
  assert.equal(renderer(post).allocatorCategories.partition_alloc.size, 35184640);
  assert.equal(gpu(mid).skiaGpuResources.size, 23924557); assert.equal(gpu(blank).skiaGpuResources.size, 56576);
  assert.deepEqual(renderer(post).objectCounts, { "blink_objects/DetachedScriptState": 15, "blink_objects/Document": 26,
    "blink_objects/Frame": 24, "blink_objects/Node": 5843, "blink_objects/WorkerGlobalScope": 3 });
  assert.equal(terminal.specificAllocationStacksProven, false); assert.equal(terminal.publicEngineReplacement, false);
});
