// Read-only native observer integration. Target is THIS Node process tree, NOT
// Chromium or a conversion; this cannot certify browser memory or codec support.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startClockFencedNativeBudgetFailureObserver, stopNativeObserverEvenAfterPhaseFailure } from "./lib/clock-fenced-native-failure-observer.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
assert.equal(process.argv.length, 2); assert.equal(process.platform, "win32");
const sourcePins = {};
for (const file of ["scripts/validate-native-receipt-clock.mjs", "scripts/lib/native-receipt-clock-fence.mjs",
  "scripts/lib/clock-fenced-native-failure-observer.mjs", "scripts/lib/native-budget-failure-observer.mjs",
  "scripts/lib/parallel-memory-observer.mjs", "scripts/lib/persistent-chromium-memory.mjs",
  "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/windows-tree-monitor.cs"])
  sourcePins[file] = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
// Hashing can fail before ownership exists; allocate disposable scratch only
// once every source preflight has passed and the finally guard is ready.
const runtime = await createOwnedRuntimeScratch("native-receipt-clock-check-");
const proof = { recordedAt: null, status: "failed-or-incomplete", failure: null, targetType: "owned-Node-process-tree-not-Chromium",
  targetPid: process.pid, observerIdentity: null, observerAbsent: null, native: null, fence: null,
  protectedInputOpened: false, nativeConversionPerformed: false, browsersLaunched: 0, genuineConversions: 0,
  completeChromiumMemoryAcceptance: false, publicAcceptance: false, noDocker: true, subprocessWindowsHidden: true,
  runtime: runtime.directory, runtimeAbsent: false, sourcePins };
let observer, closed = false;
try {
  observer = await startClockFencedNativeBudgetFailureObserver(process.pid, runtime.directory, {
    getBlankBaseline: () => null, onFailure: async () => { throw new Error("Diagnostic cannot evaluate conversion acceptance"); },
  });
  proof.observerIdentity = await queryProcessIdentity(observer.pid);
  assert.equal(proof.observerIdentity.parentPid, process.pid);
  await new Promise(resolve => setTimeout(resolve, 2000));
  observer.healthy();
  await observer.finishCapture();
  await stopNativeObserverEvenAfterPhaseFailure(observer); closed = true;
  proof.native = observer.report(); proof.fence = observer.failureCaptureReport().receiptClockFence;
  assert.equal(proof.native.error, null); assert.ok(proof.native.sequence >= 5);
  assert.equal(proof.fence.monitorClosed, true); assert.equal(proof.fence.samplesDropped, 0);
  assert.equal(proof.fence.timestampsRewritten, 0); assert.equal(proof.fence.failedBatch, null);
} catch (error) { proof.failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally {
  if (observer && !closed) {
    try { await observer.stop(); } catch (error) { proof.failure ??= String(error).slice(0, 8192); }
  }
  if (proof.observerIdentity) {
    proof.observerAbsent = await observeOwnedProcessExit(proof.observerIdentity);
    assert.equal(proof.observerAbsent.status, "owned-identity-absent");
  }
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); proof.runtimeAbsent = true;
}
if (proof.failure == null && proof.runtimeAbsent && proof.observerAbsent?.status === "owned-identity-absent")
  proof.status = "actual-native-receipt-clock-and-owned-close-passed-not-browser-acceptance";
proof.recordedAt = new Date().toISOString();
const output = `evidence/${stamp}-native-receipt-clock-diagnostic.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, nativeRows: proof.native?.sequence ?? null,
  runtimeAbsent: proof.runtimeAbsent, completeChromiumMemoryAcceptance: false }));
assert.equal(proof.failure, null);
