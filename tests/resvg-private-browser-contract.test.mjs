import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { gunzipSync } from "node:zlib";
import { readPreImageSizePatch } from "./helpers/pre-image-size-patch.mjs";
import { readPreCiRuntimeInput } from "./helpers/pre-ci-runtime-inputs.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const json = async file => JSON.parse(await read(file));
test("real bounded source-built SVG renders through all ten existing browser cases but its 275 MiB complete-tree failure is never accepted", async () => {
  const proof = await json("evidence/2026-10-27-svg-private-browser-terminal.json"), bytes = await read(proof.rawReport);
  assert.equal(bytes.length, proof.rawReportBytes); assert.equal(sha(bytes), proof.rawReportSha256);
  const row = JSON.parse(bytes); assert.equal(row.executedHead, proof.executedHead);
  assert.equal(row.status, "failed-private-svg-browser-qualification"); assert.equal(row.failures.length, 1);
  assert.match(row.failures[0], /Complete Chromium process-tree small-suite private-memory limit failed/);
  assert.deepEqual([row.stats.expected, row.stats.unexpected, row.stats.skipped, row.stats.flaky], [10, 0, 0, 0]);
  assert.equal(row.cases.length, 10); assert.ok(row.cases.every(value => value.ok)); assert.equal(row.wasmRequests, 4);
  assert.equal(row.memory.validSamples, 170); assert.equal(row.memory.unavailableSamples, 0);
  assert.equal((row.memory.peak.privateBytes - row.blankBaseline.privateBytes) / 1048576, 275.04296875);
  assert.equal(row.memory.incrementalPrivateMiB, 275.04296875); assert.ok(row.memory.incrementalPrivateMiB > row.memory.limitMiB);
  assert.equal(row.baselineAdjusted, false); assert.equal(row.browserServicesDisabledByDriver, false);
  assert.equal(row.ownedRuntimeRemoved, true); assert.equal(row.processCleanup.length, 4);
  assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent"));
  assert.deepEqual(row.protectedOriginalAfter, row.protectedOriginalBefore);
  assert.equal(row.publicEngineReplacement, false); assert.equal(row.fullStressOrOomAcceptance, false);
  assert.equal(proof.allocationSourceProven, false); assert.equal(proof.workerRealmDiagnosticsContainUnavailableValues, true);
  const archive = await json("fixtures/source/svg-browser-51baf25e.json"); assert.equal(archive.sourceCommit, row.executedHead);
  for (const [file, digest] of Object.entries(row.sourcePins)) {
    const old = archive.files[file]; let source;
    if (old) { source = gunzipSync(Buffer.from(old.gzipBase64, "base64"), { maxOutputLength: 32768 }); assert.equal(source.length, old.bytes); assert.equal(sha(source), old.sha256); }
    else source = await readPreImageSizePatch(file);
    assert.equal(sha(source), digest, file);
  }
});
test("first browser attempt remains a failed navigation control with zero engine fetches, unchanged original and completed owned cleanup", async () => {
  const row = await json("evidence/2026-10-27T15-02-07-989Z-source-svg-browser.json");
  assert.equal(row.status, "failed-private-svg-browser-qualification");
  assert.equal(row.stats.expected, 0); assert.equal(row.stats.unexpected, 1); assert.equal(row.stats.skipped, 9);
  assert.equal(row.wasmRequests, 0); assert.match(row.failures[0], /Cannot navigate to invalid URL/);
  assert.deepEqual(row.protectedOriginalAfter, row.protectedOriginalBefore); assert.equal(row.ownedRuntimeRemoved, true);
  assert.equal(row.processCleanup.length, 4); assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent"));
  const archive = await json("fixtures/source/svg-browser-c0dd4198.json"); assert.equal(archive.sourceCommit, row.executedHead);
  for (const [file, digest] of Object.entries(row.sourcePins)) {
    const old = archive.files[file]; let bytes;
    if (old) { bytes = gunzipSync(Buffer.from(old.gzipBase64, "base64"), { maxOutputLength: 262144 }); assert.equal(bytes.length, old.bytes); assert.equal(sha(bytes), old.sha256); }
    else bytes = await readPreImageSizePatch(file);
    assert.equal(sha(bytes), digest, file);
  }
});
test("actual postprocessor success is receipt/source/artifact bound, not browser, exact published reproduction or source-repeat acceptance", async () => {
  const proof = await json("evidence/2026-10-27-svg-postprocess-terminal.json"), pins = await json(proof.artifactPin), bytes = await read(proof.rawReceipt);
  assert.equal(bytes.length, pins.receiptBytes); assert.equal(sha(bytes), pins.receiptSha256);
  const row = JSON.parse(bytes); assert.equal(row.executedHead, pins.headSha); assert.equal(row.failures.length, 0);
  assert.equal(row.ownedScratchRemoved, true); assert.equal(row.publicSvgUnchanged, true);
  assert.equal(row.staticAbi.namesAndKindsEqual, true); assert.equal(row.staticAbi.instantiated, false);
  assert.equal(row.boundedMemory[0].initialPages, 24); assert.equal(row.boundedMemory[0].maximumPages, 1536);
  assert.equal(row.candidate.wasmSha256, pins.wasmSha256); assert.equal(row.candidate.wasmBytes, pins.wasmBytes);
  assert.equal(row.memoryBoundProof.onlyMemorySectionChanged, true); assert.equal(row.memoryBoundProof.allCodeAndDataBytesPreserved, true);
  assert.equal(row.sourceRecompileAttempted, false); assert.equal(row.rendererInstantiated, false);
  assert.equal(row.publicEngineReplacement, false); assert.equal(row.originalGoalComplete, false);
  for (const [file, digest] of Object.entries(row.sourcePins)) assert.equal(sha(await readPreCiRuntimeInput(file)), digest, file);
});
test("private browser driver keeps normal services, earliest blank/all-tree formula, fixed thresholds and birth-aware owned cleanup", async () => {
  const source = (await read("scripts/test-source-built-svg-candidate.mjs")).toString();
  assert.match(source, /inspectStressHostMemory\(\)/); assert.match(source, /sampleChromiumTree\(chrome.pid\)/);
  assert.match(source, /baselineDeadline = baselineStarted \+ 30000/); assert.match(source, /stableWindow\(report.blankSamples\)/);
  assert.match(source, /startChromiumMemoryMonitor\(\.\.\.args\)/); assert.match(source, /report.memory.incrementalPrivateMiB <= 250/);
  assert.doesNotMatch(source, /--disable-|ignoreDefaultArgs|WebAssembly\.instantiate|ffmpeg[^\n]*-i/);
  assert.match(source, /windowsHide: true/); assert.match(source, /queryReliableProcessIdentity\(child.pid\)/);
  assert.match(source, /observeOwnedProcessExit\(identity\)/); assert.match(source, /await runtime\?\.close\(\)/);
  assert.match(source, /protectedOriginalAfter = await originalIdentity\(\)/);
  assert.match(source, /stats.expected, 10/); assert.match(source, /stats.skipped, 0/);
  assert.match(source, /--max-failures=1/); assert.match(source, /fullStressOrOomAcceptance: false/);
});
test("existing suite private hook requires exact candidate bytes and isolated repository-owned descriptor without changing worker or conversion settings", async () => {
  const source = (await read("tests/browser/image-conversions.spec.ts")).toString();
  assert.match(source, /WITHIN_PRIVATE_SVG_DESCRIPTOR/); assert.match(source, /pins.wasmSha256/);
  assert.match(source, /privateSvg = descriptor/); assert.match(source, /outputRoot = path.join\(descriptor.runtime, "validation"\)/);
  assert.match(source, /context.route\("\*\*\/engines\/svg\/resvg.wasm"/);
  assert.match(source, /chromium.connectOverCDP\(descriptor.endpoint\)/);
  assert.match(source, /page.goto = \(url, options\) => navigate\(new URL\(url, baseURL\).href, options\)/);
  assert.match(source, /if \(privateSvg\)/); assert.match(source, /await context.unroute/);
  assert.match(source, /minimumReferenceSsim/); assert.match(source, /peakPendingOperations\)\.toBe\(1\)/);
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
  assert.deepEqual(result.diagnostics, []);
});
