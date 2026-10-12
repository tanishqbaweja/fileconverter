// Separate input-only experiment. Never substitute this receipt for a conversion gate.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { scanProductionInput } from "./bounded-production-input-scan.mjs";
import { inputReadMediaSourceFiles, makeInputReadMediaBrowserRecipe, makeInputReadMediaCaller } from "./input-read-media-recipe.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
function once(source, before, after) { assert.equal(source.split(before).length, 2, before.slice(0, 120)); return source.replace(before, after); }
export async function inputScanSourceFiles(root) { return [...new Set([...await inputReadMediaSourceFiles(root),
  "scripts/lib/bounded-production-input-scan.mjs", "scripts/lib/input-scan-browser-recipe.mjs", "scripts/scan-original-production-input.mjs",
  "tests/bounded-production-input-scan.test.mjs", "tests/input-scan-browser.test.mjs"])]; }
export async function makeInputScanBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  const old = await makeInputReadMediaBrowserRecipe(sources, root, runtime, stamp, branch, build);
  const start = old.stage.indexOf("const adapter = "), end = old.stage.indexOf(";\nconst replacing = ", start);
  assert.ok(start > 0 && end > start);
  const literal = old.stage.slice(start + "const adapter = ".length, end);
  let adapter = JSON.parse(literal);
  adapter = once(adapter, "    let successfulReadBytes = 0;", "    let successfulReadBytes = 0, scanStarted = false;");
  adapter = once(adapter, "read: inputCapture.read,", `read: async (offset, destination) => {
      if (globalThis.__WITHIN_INPUT_SCAN_CONTROL__ === true) {
        if (!scanStarted) {
          scanStarted = true;
          const result = await (${scanProductionInput.toString()})({ read: inputCapture.read, inputSize: originalBridge.inputSize });
          console.debug("WITHIN_INPUT_SCAN_RESULT "+JSON.stringify(result));
        }
        // Stop before demux/decode/encode. Subsequent native AVIO calls cannot restart the scan.
        throw new Error("Input-only scan completed; no conversion");
      }
      return inputCapture.read(offset, destination);
    },`);
  const stage = once(old.stage, literal, JSON.stringify(adapter));
  let spec = once(old.spec, "const inputReadFailureSamples:", "const inputScanResults: Array<Record<string, unknown>> = [];\nconst inputReadFailureSamples:");
  spec = once(spec, "  inputReadFailureSamples.length = 0;", "  inputReadFailureSamples.length = 0;\n  inputScanResults.length = 0;");
  // The diagnostic performs the whole JS scan inside ONE native suspension;
  // unlike a conversion it deliberately never starts repeated codec crossings.
  spec = once(spec, "expect(sample.acquisitions).toBeGreaterThan(1);", "expect(sample.acquisitions).toBe(1);");
  spec = once(spec, '    const inputPrefix = "WITHIN_INPUT_READ_FAILURE ";', `    const scanPrefix = "WITHIN_INPUT_SCAN_RESULT ";
    if (text.startsWith(scanPrefix) && text.length <= 2048 && inputScanResults.length < 1)
      inputScanResults.push(JSON.parse(text.slice(scanPrefix.length)));
    const inputPrefix = "WITHIN_INPUT_READ_FAILURE ";`);
  const beforeAll = spec.indexOf("test.beforeAll(async () => {"), beforeEach = spec.indexOf("test.beforeEach(", beforeAll);
  assert.ok(beforeAll > 0 && beforeEach > beforeAll);
  // No fixture generation or copied/sliced replacement input in this diagnostic.
  spec = spec.slice(0, beforeAll) + `test.beforeAll(async () => {
  await mkdir(path.join(root, "work"), { recursive: true });
  work = await mkdtemp(path.join(root, "work/mpeg2-artwork-validation-"));
});

` + spec.slice(beforeEach);
  const conversionTests = spec.indexOf("async function validateConversion("); assert.ok(conversionTests > 0);
  spec = spec.slice(0, conversionTests) + `test("private production input scans whole original without converting", async ({ page }) => {
  test.setTimeout(600000);
  const source = path.join(root, "test.mkv"); expect((await stat(source)).size).toBe(2958573265);
  await page.goto("/?test=1&directory=1");
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  expect(page.workers()).toHaveLength(1); const originalWorker = page.workers()[0];
  await originalWorker.evaluate(() => { (globalThis as typeof globalThis & { __WITHIN_INPUT_SCAN_CONTROL__?: boolean }).__WITHIN_INPUT_SCAN_CONTROL__ = true; });
  await page.locator('[data-testid="file-input"]').setInputFiles(source);
  await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
  await page.locator('[data-testid="convert-button"]').click();
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "error", undefined, { timeout: 570000 });
  const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
  expect(state.error).toContain("Input-only scan completed; no conversion");
  expect(inputScanResults).toHaveLength(1); expect(inputReadFailureSamples).toEqual([]);
  expect(inputScanResults[0].sequentialBytes).toBe(2958573265); expect(inputScanResults[0].bufferBytes).toBe(65536);
  expect(inputScanResults[0].maximumPendingReads).toBe(1);
  expect(state.metrics?.outputBytes).toBe(0); expect(state.metrics?.pendingOperations).toBe(0); expect(state.metrics?.queuedBytes).toBe(0);
  const remaining = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory(); const sizes: number[] = [];
    for await (const [, handle] of directory.entries()) if (handle.kind === "file") sizes.push((await (handle as FileSystemFileHandle).getFile()).size);
    return sizes;
  });
  expect(remaining.every(bytes => bytes === 0)).toBe(true);
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  expect(page.workers()).not.toContain(originalWorker);
  rows.push({ kind: "whole-original-production-input-scan", result: inputScanResults[0], terminalState: state.jobState,
    metrics: state.metrics, partialBytes: remaining, productionWorkerRetired: true, notConversion: true });
});
`;
  const filter = ',maxFailures:1,grep:/private split MPEG2 (hevc to mp4 via direct:|propagates direct output write failure|propagates input read failure|cancels after genuine direct output)/';
  const config = once(old.config, filter, ',maxFailures:1,grep:/private production input scans whole original/');
  return { ...old, stage, spec, config, inputOnlyDiagnostic: true, noGeneratedFixtures: true, publicAcceptance: false };
}
export function inspectInputScanReport(report) {
  const rows = report.rows.filter(row => row.kind === "whole-original-production-input-scan"); assert.equal(rows.length, 1);
  const row = rows[0], scan = row.result; assert.equal(row.notConversion, true); assert.equal(row.terminalState, "error");
  assert.equal(row.productionWorkerRetired, true); assert.ok(row.partialBytes.every(bytes => bytes === 0));
  assert.equal(scan.scope, "whole-original-production-input-read-and-seek-only-not-conversion");
  assert.equal(scan.inputSize, 2958573265); assert.equal(scan.sequentialBytes, scan.inputSize); assert.ok(scan.sequentialReads >= Math.ceil(scan.inputSize / 65536));
  assert.deepEqual(scan.seekOffsets, [2186655938, 2958507729, 0]); assert.equal(scan.seekBytes, 3 * 65536); assert.ok(scan.seekReads >= 3);
  assert.equal(scan.bufferBytes, 65536); assert.equal(scan.maximumPendingReads, 1); assert.ok(scan.elapsedMs > 0);
  for (const field of ["fullConversionAcceptance", "fidelityAcceptance", "memoryAcceptance", "originalFailureCauseProven"]) assert.equal(scan[field], false);
  for (const field of ["outputBytes", "queuedBytes", "pendingOperations"]) assert.equal(row.metrics[field], 0);
  assert.deepEqual(report.rows.filter(r => r.kind === "input-read-diagnostics").flatMap(r => r.samples), []);
  const splits = report.rows.filter(r => r.kind === "actual-split-native-ownership").flatMap(r => r.samples); assert.equal(splits.length, 1);
  assert.equal(splits[0].frames, 0); assert.equal(splits[0].packets, 0); assert.equal(splits[0].closed, true);
  const leases = report.rows.filter(r => r.kind === "actual-asyncify-storage-lifecycle").flatMap(r => r.samples); assert.equal(leases.length, 1);
  assert.equal(leases[0].allocations, 1); assert.equal(leases[0].frees, 1); assert.equal(leases[0].activeLeases, 0); assert.equal(leases[0].retainedBytes, 0);
  return { scan, diagnosticThroughputMiBPerSecond: scan.sequentialBytes / 1048576 / (scan.elapsedMs / 1000),
    inputOnlyProductionBridgeDiagnostic: true, notConversionOrControlledSpeedEvidence: true, immediateReadFailureReproduced: false,
    originalLongLivedFailureCauseProven: false, fullOriginalAcceptance: false, publicAcceptance: false };
}
export function makeInputScanCaller(source, root) {
  const old = makeInputReadMediaCaller(source, root), url = pathToFileURL(path.join(root, "scripts/lib/input-scan-browser-recipe.mjs")).href;
  let generated = once(old.generated,
    `import { makeInputReadMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectInputReadMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/input-read-media-recipe.mjs")).href)};`,
    `import { makeInputScanBrowserRecipe as makeSingleIdleBrowserRecipe, inspectInputScanReport as verifySingleIdleGoldenReport } from ${JSON.stringify(url)};`);
  generated = once(generated,
    `import { inputReadMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/input-read-media-recipe.mjs")).href)};`,
    `import { inputScanSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(url)};`);
  generated = generated.replaceAll("${stamp}-input-read-media", "${stamp}-input-only-original-scan")
    .replaceAll("four-headless-conversions-input-failure-and-recovery-passed-not-full-acceptance", "whole-original-input-only-scan-passed-not-conversion");
  generated = once(generated, "assert.ok(info.size <= 8388608 && failureArtifacts.length < 16);", `assert.ok(failureArtifacts.length < 16);
            if (info.size > 8388608) {
              failureArtifacts.push({ omitted: true, artifactKind: entry.name, bytes: info.size, reason: "unchanged8MiB-retention-cap" });
              continue;
            }
            assert.ok(info.size <= 8388608);`);
  return { generated, generatedSha256: sha(generated), previousCallerSha256: old.generatedSha256 };
}
