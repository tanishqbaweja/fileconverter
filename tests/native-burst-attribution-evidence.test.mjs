import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { makeBurstAttributionDriver } from "../scripts/lib/mpeg2-burst-attribution-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(path.join(root, file));

test("initial real native control failure and exact executed source remain preserved without historical repinning", async () => {
  const proof = JSON.parse(await read("evidence/native-burst-control-initial-2026-10-07.json"));
  assert.equal(proof.status, "failed-diagnostic"); assert.equal(proof.bursts.callbacks.length, 0);
  assert.match(proof.failure, /Actual native burst must trigger/);
  assert.match(proof.next, /BEFORE allocating/);
  for (const value of Object.values(proof.cleanup)) assert.equal(value, true);
  for (const [file, digest] of Object.entries(proof.sourcePins))
    assert.equal(sha(proof.archivedExecutedSources[file] ?? await read(file)), digest, file);
});
test("actual blank-browser native bursts trigger bounded light dumps without loss, media or acceptance claims", async () => {
  const proof = JSON.parse(await read("evidence/native-burst-control-passed-2026-10-07.json"));
  assert.equal(proof.status, "completed-diagnostic"); assert.equal(proof.browserVersion, "Chrome/154.0.8037.98");
  assert.equal(proof.trace.status, "completed-diagnostic"); assert.equal(proof.trace.trace.dataLossOccurred, false);
  assert.equal(proof.trace.trace.overflow, false); assert.equal(proof.trace.summedAllocatorTotal, null);
  assert.equal(proof.bursts.limits.drainIntervalMs, 100); assert.equal(proof.bursts.eventsDiscarded, 0);
  assert.equal(proof.bursts.callbackQueueLength, 0); assert.equal(proof.bursts.maximumPendingCallbacks, 1);
  assert.ok(proof.bursts.events.some(e => e.delta.processDeltas.some(p => p.deltaPrivateBytes >= 32 * 1048576)));
  assert.equal(proof.bursts.callbacks.length, 2);
  for (const row of proof.bursts.callbacks) {
    assert.equal(row.status, "completed"); assert.equal(row.result.success, true);
    const dump = proof.trace.dumps.find(d => d.memoryDump.dumpGuid === row.result.dumpGuid);
    assert.ok(dump); assert.equal(dump.processes.length,
      proof.bursts.events.find(e => e.after.sequence === row.sequence).after.processes.length);
    assert.ok(row.acquisitionLagMs >= 0); assert.ok(row.finishedAt >= row.requestedAt);
  }
  for (const key of ["originalRead", "converterLoaded", "publicAcceptance", "completeChromiumMemoryAcceptance", "conversionSpeedAcceptance"])
    assert.equal(proof[key], false, key);
  assert.equal(proof.conversionsPerformed, 0); assert.equal(proof.generatedMediaCopies, 0);
  for (const value of Object.values(proof.cleanup)) assert.equal(value, true);
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest, file);
});
test("changed full-original diagnostic is strictly reversible and preserves memory/source/quality/cancel gates", async () => {
  const source = (await read("scripts/mpeg2-split-single-navigation-memory.mjs")).toString();
  const generated = makeBurstAttributionDriver(source, root, specifier => import.meta.resolve(specifier));
  for (const required of ["const diagnosticOnly = true;", "minimumIncreaseBytes: 32 * MiB",
    "const deadline = Date.now() + 70 * 60_000", "minimumMs: 300000",
    "blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes",
    "assert.ok(run.incrementalPrivateMiB <= 250,", "assert.equal(diagnosticOnly, false",
    "cancelBrowserConversionBeforeCleanup(page)", "await verifySource(); cleanup.protectedFixtureUnchanged = true",
    "const expectedSourceBytes = 2958573265", "assert.equal(manifest.decoderMemoryBytes, 32 * MiB)",
    "assert.equal(manifest.encoderMemoryBytes, 16 * MiB)", "ssim >= 0.98",
    "maximumTimestampErrorSeconds <= 0.001", "nativeBurstResult = observer.burstReport()"])
    assert.ok(generated.includes(required), required);
  assert.ok(generated.indexOf("rendererAttributionResult = await rendererAttribution.stop()") <
    generated.indexOf("cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page)"));
  assert.ok(generated.includes("observer.burstReport().eventsDiscarded, 0"));
  assert.ok(!generated.includes("const deadline = Date.now() + 90000;"));
  for (const mutation of [source + "\n", source.replace("250", "251")])
    assert.throws(() => makeBurstAttributionDriver(mutation, root, specifier => import.meta.resolve(specifier)));
  const runtime = await createOwnedRuntimeScratch("burst-syntax-control-");
  try {
    const file = path.join(runtime.directory, "generated.mjs");
    await writeFile(file, generated, { flag: "wx" });
    await promisify(execFile)(process.execPath, ["--check", file],
      { env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 65536 });
  } finally { await runtime.close(); }
});
