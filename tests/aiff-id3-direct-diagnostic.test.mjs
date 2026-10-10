import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { makeAiffId3DiagnosticRecipe, makeAiffId3DiagnosticLaunchRecipe } from "../scripts/lib/aiff-id3-direct-diagnostic-recipe.mjs";
import { createAiffDirectDiagnosticObserver, AIFF_DIAGNOSTIC_LIMITS } from "../scripts/lib/aiff-id3-direct-diagnostic-observer.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "scripts/memory-profile.mjs"), "utf8");
const launch = await readFile(path.join(root, "scripts/validate-aiff-id3-stress.mjs"), "utf8");
const metadata = (socket = "ws://127.0.0.1:9222/devtools/browser/test") => ({ ok: true, body: [Buffer.from(JSON.stringify({ webSocketDebuggerUrl: socket }))] });
const worker = used => ({ targetId: "worker", type: "worker", url: "http://127.0.0.1:3000/assets/worker.js",
  usedJSHeapBytes: used, allocatedJSHeapBytes: used === null ? null : 456,
  embedderHeapUsedBytes: null, backingStorageBytes: null, error: null });
test("Diagnostic source reverses exactly to unchanged stress gates; generated driver/launcher parse with hidden/headless private-only flags", () => {
  const driver = makeAiffId3DiagnosticRecipe(source, root, path.join(root, "work/diagnostic-recipe-not-created"));
  const outer = makeAiffId3DiagnosticLaunchRecipe(launch, root);
  for (const generated of [driver.generated, outer.generated]) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(generated.includes("windowsHide: true"));
  }
  for (const token of ["--headless=new", "--enable-logging=stderr", "decoded-pcm-sha256", "<= 250", "90_000",
    "source.artwork && (mp3Output || flacOutput || aiffOutput)", "Refusing reused or unrelated PID cleanup", "diagnostic-observer.json"])
    assert.ok(driver.generated.includes(token), token);
  assert.ok(outer.generated.includes('assert.equal(mode, "direct-handle")'));
  assert.ok(outer.generated.includes("diagnostic-gates-passed-not-production-acceptance"));
  assert.ok(outer.generated.includes("diagnosticOnly: true, diagnosticObserverEvidence"));
  assert.ok(outer.generated.includes('WITHIN_RUN_COUNT: "3"'));
  assert.throws(() => makeAiffId3DiagnosticLaunchRecipe(launch + "\n", root));
  assert.throws(() => makeAiffId3DiagnosticRecipe(source + "\n", root, path.join(root, "work/example")));
});
test("Diagnostic observer retains unavailable worker heaps as null, bounded logs/snapshots and closes reused CDP sampler", async () => {
  let calls = 0, closed = 0;
  const stream = new PassThrough(), observer = createAiffDirectDiagnosticObserver(stream, {
    fetchVersion: async () => metadata(), connectSampler: async () => ({ close() { closed++; },
      async sample() { return { targetsAvailable: true, targets: [worker(++calls === 1 ? null : 123)] }; } }),
  });
  await observer.connect(9222, "http://127.0.0.1:3000");
  await observer.sample("conversion-1");
  for (let i = 0; i < 300; i++) { stream.write(Buffer.from(`GPU ${i} ${"x".repeat(1024)}\n`)); await observer.sample("conversion-1"); }
  stream.write(Buffer.from("y".repeat(10000)));
  const report = observer.close();
  assert.equal(report.sequence, 301); assert.equal(report.snapshots.length, AIFF_DIAGNOSTIC_LIMITS.snapshots);
  assert.equal(report.evictedSnapshots, 45); assert.equal(report.logs.length, AIFF_DIAGNOSTIC_LIMITS.logLines);
  assert.equal(report.gpuLogs.length, AIFF_DIAGNOSTIC_LIMITS.gpuLogLines);
  assert.ok(report.logs.every(row => row.text.length <= AIFF_DIAGNOSTIC_LIMITS.logChars));
  assert.equal(report.phases[0].unavailableWorkerHeaps, 1);
  assert.equal(report.phases[0].peakWorkerUsedJSHeapBytes, 123);
  assert.equal(report.phases[0].peakWorkerAllocatedJSHeapBytes, 456);
  assert.equal(report.phases[0].peakWorkerBackingStorageBytes, null);
  assert.equal(report.productionAcceptance, false); assert.equal(report.noForcedGarbageCollection, true);
  assert.equal(closed, 1); observer.close(); assert.equal(closed, 1);
  assert.equal(stream.listenerCount("data"), 0);
});
test("Diagnostic metadata cannot redirect outside its exact owned loopback debugger or exceed16KiB", async () => {
  for (const response of [metadata("ws://other.example:9222/devtools/browser/test"),
    { ok: true, body: [Buffer.alloc(AIFF_DIAGNOSTIC_LIMITS.versionBytes + 1)] }]) {
    let connected = false;
    const observer = createAiffDirectDiagnosticObserver(new PassThrough(), { fetchVersion: async () => response,
      connectSampler: async () => { connected = true; } });
    await assert.rejects(observer.connect(9222, "http://127.0.0.1:3000"));
    assert.equal(connected, false); observer.close();
  }
});
