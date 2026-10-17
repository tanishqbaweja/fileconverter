import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveRepeatStartupMedia, deriveRepeatStartupRunner } from "../scripts/lib/repeat-startup-diagnostic.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proof = JSON.parse(await read("evidence/2026-10-15T17-20-01-310Z-composited-handoff-media.json"));
const parent = JSON.parse(gunzipSync(await read(proof.generatedArchive.path), { maxOutputLength: 8388608 })).generated;
const pin = JSON.parse(await read("evidence/2026-10-16T16-36-10-030Z-threaded-validation-reboot-recovery.json")).browserNow;

test("six same-page diagnostic repeats preserve complete independent validation and fixed memory", async () => {
  const result = deriveRepeatStartupMedia(parent, root, path.join(root, "work/packet-cache-media-testABC"), "2026-10-17T10-00-00-000Z", pin);
  const spec = result.generated.spec;
  for (const text of ['iteration<=6', 'validateConversion(page,adapter,false)', 'startChromiumMemoryMonitor(rootPid,candidate)',
    'history.consume(await observer!.drain())', 'expect(ordinalSsim).toBeGreaterThanOrEqual(0.98)',
    'await observer?.close()', 'observeOwnedProcessExit(monitorIdentity)', 'stableWindow(baselineSamples)',
    'expect(state.metrics?.peakWasmMemoryBytes).toBe(expectedMemoryBytes)', 'expect(outputDecodedAudioHashes,',
    'startupTimingInstrumentation']) {
    if (text === 'startupTimingInstrumentation') assert.equal(result[text], true);
    else assert.ok(spec.includes(text), text);
  }
  assert.equal(result.publicAcceptance, false);
  assert.equal(result.fullOriginalAcceptance, false);
  assert.ok(result.generated.config.includes('grep:/same-page startup diagnostic six validated repeats/'));
  assert.ok(result.generated.config.includes('"headless":true'));
  assert.ok(result.generated.driver.includes('windowsHide: true'));
  assert.ok(result.generated.config.includes('"screenshots":false,"snapshots":false,"sources":false'));
  assert.ok(result.generated.driver.includes('repeat-startup-trace.zip'));
  await transform(result.generated.spec, { loader: "ts" });
  await transform(result.generated.config, { loader: "js" });
  await transform(result.generated.driver, { loader: "js" });
});

test("runner retains ownership, source and original-file guards but does not relabel diagnostics as qualification", async () => {
  const runner = deriveRepeatStartupRunner((await read("scripts/qualify-updated-chrome-media.mjs")).toString(), root);
  assert.ok(runner.includes('repeat-startup-diagnostic.json'));
  assert.ok(runner.includes('completedValidatedSmallRuns:validated'));
  assert.ok(runner.includes('receipt.driverFailure='));
  assert.ok(runner.includes('await verifyHelpers()'));
  assert.ok(runner.includes('receipt.protectedAfter=await sourceHash()'));
  assert.ok(runner.includes('six-small-same-page-diagnostic-conversions-passed-not-full-acceptance'));
  assert.ok(!runner.includes('receipt.actualRuntimeVersions=versions;'));
});
