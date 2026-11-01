// Offline role/birth annotation only. No new browser, altered totals or exclusions.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { annotateNativeProcessTypes } from "./lib/chromium-attribution.mjs";
const root = new URL("../", import.meta.url), output = new URL("evidence/2026-11-01-webcodecs-vp9-fallback-allocation.json", root);
await assert.rejects(access(output), { code: "ENOENT" });
let receipt = JSON.parse(await readFile(new URL("evidence/2026-11-01-webcodecs-vp9-rebuilt-cpu-fallback.json", root)));
if (receipt.rawArchive) receipt = JSON.parse(gunzipSync(await readFile(new URL(receipt.rawArchive.file, root)), { maxOutputLength: 4194304 }));
assert.equal(receipt.browserResult.selection.backend, "wasm"); assert.equal(receipt.memory.incrementalPrivateMiB, 300.87109375);
const rootPid = receipt.memory.peak.processes.find(row => row.type === "browser").pid;
const samples = annotateNativeProcessTypes([structuredClone(receipt.memory.peak)], [{ tree: receipt.loadedIdle }], rootPid);
const peak = samples[0]; assert.equal(peak.privateBytes, receipt.memory.peak.privateBytes);
const micros = value => { const match = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/.exec(value); assert.ok(match);
  return BigInt(Date.parse(match[1] + "Z")) * 1000n + BigInt((match[2] ?? "").padEnd(6, "0").slice(0, 6)); };
const processes = peak.processes.map(row => {
  const idle = receipt.loadedIdle.processes.find(before => before.pid === row.pid && before.parentPid === row.parentPid && micros(before.createdAt) === micros(row.createdAt));
  return { pid: row.pid, parentPid: row.parentPid, createdAt: row.createdAt, type: row.type,
    peakPrivateBytes: row.privateBytes, loadedIdlePrivateBytes: idle?.privateBytes ?? null,
    increaseSinceLoadedIdleBytes: idle ? row.privateBytes - idle.privateBytes : null, birthAndParentMatched: Boolean(idle) };
});
const renderer = processes.filter(row => row.type === "renderer").sort((a, b) => b.increaseSinceLoadedIdleBytes - a.increaseSinceLoadedIdleBytes)[0];
assert.equal(renderer.pid, 8996); assert.equal(renderer.increaseSinceLoadedIdleBytes, 246960128);
const report = { scope: "Offline process-role diagnosis of the existing failed fallback; NOT allocation-stack proof or new acceptance",
  originalIncrementalPrivateMiB: receipt.memory.incrementalPrivateMiB, blankPrivateBytes: receipt.blankBaseline.privateBytes,
  simultaneousPeakPrivateBytes: peak.privateBytes, processes, dominantRenderer: renderer,
  actualPrivateWorkerMetrics: receipt.browserResult.metrics,
  hypothesesNotProven: ["Eight helper worker contexts/compiled code and stacks", "Retained failed-candidate instance or exception call graph"],
  codeHygieneFollowup: "Keep only bounded rejection text before CPU work; clear exception references on bridge/core close. Byte effect unmeasured;300.871MiB failure retained.",
  additionalAllocationCategoriesMeasured: false, newBrowserRuns: 0, memoryFormulaChanged: false, processExclusions: false, publicAcceptance: false };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output: output.pathname, dominantRenderer: renderer, originalIncrementalPrivateMiB: report.originalIncrementalPrivateMiB }));
