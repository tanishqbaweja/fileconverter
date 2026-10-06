import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = async file => (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");

test("Actual initialization evidence records rejected overflow and bounded successful trace, never conversion acceptance", async () => {
  const proof = JSON.parse(await read("evidence/mpeg2-split-initialization-attribution-2026-10-06.json"));
  assert.equal(proof.originalRead, false); assert.equal(proof.conversionsPerformed, 0);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
  assert.equal(proof.allocationRootCauseOfOriginalFailureProven, false);
  assert.equal(proof.rejectedDetailedAttempt.tracing.overflow, true);
  assert.equal(proof.narrowedLightAttempt.tracing.overflow, false);
  assert.equal(proof.narrowedLightAttempt.tracing.dataLossOccurred, false);
  assert.equal(proof.narrowedLightAttempt.phases.length, 8); assert.equal(proof.attribution.length, 8);
  assert.ok(proof.trace.bytes <= 8388608); assert.equal(proof.trace.removedAfterCompaction, true);
  assert.equal(proof.independentRuntimeAndPidAbsence, true); assert.equal(proof.generatedAssetsMatchPublished, true);
  const [single, reload] = proof.narrowedLightAttempt.phases;
  assert.equal(single.dom.nodes, 6282); assert.equal(reload.dom.nodes, 12586);
  assert.equal(reload.osPrivateBytes - single.osPrivateBytes, 44969984);
  for (const row of proof.attribution) {
    assert.equal(row.acceptanceMetric, false); assert.equal(row.summedAllocatorTotal, null);
    assert.equal(row.allocatorValuesOverlap, true); assert.ok(row.processes.length > 0);
    assert.notEqual(row.requestDumpGuid, row.serializedDumpIds[0]);
  }
  for (const [file, hash] of Object.entries(proof.narrowedLightAttempt.sourcePins)) {
    const bytes = await readFile(new URL(`../${file}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, file);
  }
});

test("Single-navigation original-source gate changes only page reuse and its own report identity", async () => {
  let expected = await read("scripts/mpeg2-split-protected-memory.mjs");
  const patches = [
  [
    "// Full protected source, production browser I/O; native tools inspect/validate only.",
    "// Full protected source, ONE page navigation; normal production worker recycling between repeats.\n// Historical redundant-navigation driver remains unchanged for its executed source pins."
  ],
  [
    "\"scripts/mpeg2-split-protected-memory.mjs\",",
    "\"scripts/mpeg2-split-single-navigation-memory.mjs\","
  ],
  [
    "-private-mpeg2-split-protected-direct-native-100ms",
    "-private-mpeg2-split-single-navigation-native-100ms"
  ],
  [
    "createOwnedRuntimeScratch(\"mpeg2-split-large-runtime-\")",
    "createOwnedRuntimeScratch(\"mpeg2-split-single-nav-runtime-\")"
  ],
  [
    "    await page.goto(query); await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === \"ready\");",
    "    // No reload/forced GC/larger baseline: exercise the existing production worker lifecycle.\n    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === \"ready\");"
  ],
  [
    "    await emptyOpfs(); await page.goto(query); await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === \"ready\");",
    "    await emptyOpfs(); await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === \"ready\");"
  ],
  [
    "Full protected source HEVC to separate MPEG2 encoder via production selected OPFS handle; no native OS-picker or speed-A/B certification",
    "Full protected source HEVC to separate MPEG2 encoder via production selected OPFS handle, single page navigation with normal worker replacement; no native OS-picker or speed-A/B certification"
  ]
];
  for (const [from, to] of patches) { assert.equal(expected.split(from).length, 2); expected = expected.replace(from, to); }
  const actual = await read("scripts/mpeg2-split-single-navigation-memory.mjs");
  assert.equal(actual.trimEnd(), expected.trimEnd());
  assert.equal(actual.split("await page.goto(query)").length - 1, 1);
  assert.ok(actual.includes("for (let number = 1; number <= 3; number++)"));
  assert.ok(actual.includes("assert.ok(run.incrementalPrivateMiB <= 250"));
  assert.ok(actual.includes("cancelBrowserConversionBeforeCleanup(page)"));
});

test("Single-navigation original progressed to actual encoding but remains failed, incomplete and non-comparable", async () => {
  const p = JSON.parse(await read("evidence/mpeg2-split-single-navigation-original-failed-2026-10-06.json"));
  assert.equal(p.status, "failed-original-decoder-heap"); assert.match(p.failure.message, /33779712 bytes \(OOM\)/);
  for (const field of ["publicAcceptance", "completeChromiumMemoryAcceptance", "completedConversion", "comparableSpeedBenchmark",
    "comparableMemorySaving", "exactFailedNativeAllocationProven"]) assert.equal(p[field], false);
  assert.equal(p.completedRuns, 0); assert.equal(p.requestedRuns, 3); assert.equal(p.attemptedRuns, 1);
  assert.equal(p.independentValidation, null); assert.equal(p.lastState.jobState, "error");
  assert.equal(p.original.bytes, 2958573265); assert.equal(p.original.independentlyVerifiedAfter, true);
  const ownership = p.nativeEncoderSessionOwnership[0];
  assert.equal(ownership.frames, 243); assert.equal(ownership.completedPackets, 243);
  assert.equal(ownership.closed, true); assert.equal(ownership.activePackets, 0);
  assert.equal(p.incrementalPrivateMiBIncomplete, (p.actualCompleteNativePeak.privateBytes - p.blankBaseline.privateBytes) / 1048576);
  assert.equal(p.actualCompleteNativePeak.processes.reduce((sum, row) => sum + row.privateBytes, 0), p.actualCompleteNativePeak.privateBytes);
  assert.equal(p.independentRuntimeAndPidAbsence, true); assert.equal(p.generatedAssetsMatchPublished, true);
  assert.equal(p.cleanup.errors, undefined);
  for (const [file, hash] of Object.entries(p.sourcePins)) {
    const bytes = await readFile(new URL(`../${file}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, file);
  }
});
