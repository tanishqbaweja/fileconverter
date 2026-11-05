// Read-only retained vendor source and terminal browser evidence; no media.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), json = async f => JSON.parse(await readFile(path.join(root, f)));
assert.equal(process.argv.length, 2);
const prior = await json("evidence/2026-11-06-vp9-original-cpu-startup-attempt3.json"),
  current = await json("evidence/2026-11-06-vp9-original-cpu-startup-attempt4.json"),
  native = await json("evidence/2026-11-06-vp9-original-width-native-42129383089.json");
assert.match(prior.browserResult.message, /Failed to allocate temporal filter buffer/);
assert.match(current.browserResult.message, /Failed to allocate frame buffer/);
assert.doesNotMatch(current.browserResult.message, /Failed to allocate temporal filter buffer/);
assert.equal(current.originalStartup.passedStartupOnly, false); assert.equal(current.browserResult.cleanupComplete, true);
const file = "work/vp9-duration-input-42129383089/vp9_encoder.temporal.guard.c", source = await readFile(path.join(root, file), "utf8"),
  digest = createHash("sha256").update(source).digest("hex");
assert.equal(digest, native.nativeContract.candidate.vendorAllocationGuard.compiledSourceSha256);
const lines = source.split("\n"), callSites = [];
for (const [index, line] of lines.entries()) if (line.includes('"Failed to allocate frame buffer"')) {
  const offset = lines.slice(0, index).join("\n").length;
  callSites.push({ line: index + 1,
    function: source.lastIndexOf("static void set_frame_size(", offset) > source.lastIndexOf("void vp9_scale_references(", offset) ? "set_frame_size" : "vp9_scale_references",
    context: lines.slice(Math.max(0, index - 15), index + 4).join("\n") });
}
assert.equal(callSites.length, 3); assert.deepEqual(callSites.map(row => row.function), ["vp9_scale_references", "vp9_scale_references", "set_frame_size"]);
const report = { recordedAt: new Date().toISOString(), scope: "Exact retained guarded source / changed actual failure audit, NOT full conversion or proven next optimization",
  priorRunId: 42122918540, currentRunId: native.runId, source: { file, sha256: digest },
  previousFailure: "Failed to allocate temporal filter buffer", currentFailure: "Failed to allocate frame buffer",
  currentFailureMessageHasMultipleSourceSites: true, actualFailingCallSite: null, callSites,
  exactFailedAllocationBytes: null, actualHeapAtFailureBytes: null, lastReportedWasmBytes: current.browserResult.metrics.wasmMemoryBytes,
  declaredMaximumWasmBytes: 100663296, maximumIsNotActualObservedHeap: true,
  memoryVerdictNotConversionSuccess: { incrementalPrivateMiB: current.memory.incrementalPrivateMiB, nativeFailed: true },
  nextAction: "Add bounded failure-only allocation diagnostics to distinguish new-frame vs scaled-reference failure and record requested allocation/current live Wasm heap; retain limits and strict controls, no unchanged original replay",
  codecSettingsOrMemoryLimitsChangedByAudit: false, userMediaReadOrConverted: false, speedGainProven: false, publicAcceptance: false };
await writeFile(path.join(root, "evidence/2026-11-06-vp9-frame-buffer-failure-audit.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ callSites: callSites.length, actualFailingCallSite: null, currentFailure: report.currentFailure, userMediaReadOrConverted: false }));
