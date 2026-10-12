// Fresh additive private diagnostic; historically executed helpers remain byte-exact.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBoundedInputReadCapture } from "./bounded-input-read-capture.mjs";
import { asyncifyMediaSourceFiles, makeAsyncifyMediaBrowserRecipe, makeAsyncifyMediaCaller, inspectAsyncifyMediaReport } from "./asyncify-storage-media-recipe.mjs";
import { inspectBitrateDiagnostic } from "./encoder-plane-bitrate-browser-recipe.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";

function once(source, before, after) { assert.equal(source.split(before).length, 2, before.slice(0, 160)); return source.replace(before, after); }
export async function inputReadMediaSourceFiles(root) {
  return [...new Set([...await asyncifyMediaSourceFiles(root), "scripts/lib/bounded-input-read-capture.mjs",
    "scripts/lib/input-read-media-recipe.mjs", "scripts/qualify-input-read-media.mjs",
    "tests/bounded-input-read-capture.test.mjs", "tests/input-read-media.test.mjs"])];
}
export async function makeInputReadMediaBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  const old = await makeAsyncifyMediaBrowserRecipe(sources, root, runtime, stamp, branch, build);
  const start = old.stage.indexOf("const adapter = "), end = old.stage.indexOf(";\nconst replacing = ", start);
  assert.ok(start > 0 && end > start);
  const literal = old.stage.slice(start + "const adapter = ".length, end), adapter = JSON.parse(literal);
  let updated = once(adapter, "    const withinBridge = {...originalBridge, readSync: undefined,", `    let successfulReadBytes = 0;
    const inputCapture = (${createBoundedInputReadCapture.toString()})({ inputSize: originalBridge.inputSize,
      emit: row => console.debug("WITHIN_INPUT_READ_FAILURE "+JSON.stringify(row)),
      async read(offset, destination) {
        // Explicit worker-local headless control, never enabled by production UI.
        if (globalThis.__WITHIN_INPUT_READ_CONTROL__ === true && successfulReadBytes >= 1048576)
          throw new DOMException("Bounded input read control", "NotReadableError");
        const count = await originalBridge.read(offset, destination); successfulReadBytes += count; return count;
      } });
    const withinBridge = {...originalBridge, readSync: undefined, read: inputCapture.read,`);
  const stage = once(old.stage, literal, JSON.stringify(updated));
  let spec = once(old.spec, "const asyncifyStorageSamples:", "const inputReadFailureSamples: Array<Record<string, unknown>> = [];\nconst asyncifyStorageSamples:");
  spec = once(spec, "  asyncifyStorageSamples.length = 0;", "  asyncifyStorageSamples.length = 0;\n  inputReadFailureSamples.length = 0;");
  spec = once(spec, '    const storagePrefix = "WITHIN_ASYNCIFY_STORAGE_FINAL ";', `    const inputPrefix = "WITHIN_INPUT_READ_FAILURE ";
    if (text.startsWith(inputPrefix) && text.length <= 2048 && inputReadFailureSamples.length < 4)
      inputReadFailureSamples.push(JSON.parse(text.slice(inputPrefix.length)));
    const storagePrefix = "WITHIN_ASYNCIFY_STORAGE_FINAL ";`);
  spec = once(spec, '  rows.push({ kind: "actual-asyncify-storage-lifecycle",', '  rows.push({ kind: "input-read-diagnostics", samples: [...inputReadFailureSamples] });\n  rows.push({ kind: "actual-asyncify-storage-lifecycle",');
  const begin = spec.indexOf('test("private split MPEG2 propagates direct output write failure'),
    finish = spec.indexOf('\n\ntest("private split MPEG2 cancels', begin);
  assert.ok(begin > 0 && finish > begin);
  let control = spec.slice(begin, finish).replaceAll("propagates direct output write failure", "propagates input read failure")
    .replaceAll("direct-write-failure", "input-read-failure").replaceAll('"write-failure"', '"input-read-failure"')
    .replaceAll("destination rejected a bounded write", "bounded input read control").replaceAll("&fault=write", "");
  control = once(control, '  await page.goto("/?test=1&directory=1");', '  rows.push({ kind: "input-read-control-start" });\n  await page.goto("/?test=1&directory=1");');
  control = once(control, "const originalWorker = page.workers()[0];", "const originalWorker = page.workers()[0];\n  await originalWorker.evaluate(() => { (globalThis as typeof globalThis & { __WITHIN_INPUT_READ_CONTROL__?: boolean }).__WITHIN_INPUT_READ_CONTROL__ = true; });");
  control = once(control, '  await recoverOnSamePage(page, originalWorker, "input-read-failure");', `  // Native FFmpeg asks again after AVIO returns -5; the wrapper never retries.
  expect(inputReadFailureSamples).toHaveLength(2);
  expect(inputReadFailureSamples[1].failureOrdinal).toBe(2);
  expect(inputReadFailureSamples[1].offset).toBe(inputReadFailureSamples[0].offset);
  expect(inputReadFailureSamples[0].exceptionName).toBe("NotReadableError");
  expect(inputReadFailureSamples[0].exceptionCode).toBe(0);
  expect(inputReadFailureSamples[0].messageClass).toBe("injected-control");
  expect(inputReadFailureSamples[0].requestedBytes).toBe(65536);
  await recoverOnSamePage(page, originalWorker, "input-read-failure");`);
  spec += "\n\n" + control + "\n";
  const config = once(old.config, "propagates direct output write failure|cancels", "propagates direct output write failure|propagates input read failure|cancels");
  return { ...old, stage, spec, config, inputReadDiagnostic: { maximumRecordsPerJob: 2, rawTextRetained: false, retries: 0, originalReadUnchanged: true }, publicAcceptance: false };
}
export function inspectInputReadMediaReport(report, baseline, build) {
  const boundary = report.rows.findIndex(row => row.kind === "input-read-control-start"); assert.ok(boundary > 0);
  const previous = inspectAsyncifyMediaReport({ ...report, rows: report.rows.slice(0, boundary) }, baseline, build);
  assert.deepEqual(report.rows.slice(0, boundary).filter(row => row.kind === "input-read-diagnostics").flatMap(row => row.samples), []);
  const rows = report.rows.slice(boundary), adverse = rows.filter(row => row.kind === "input-read-failure");
  assert.equal(adverse.length, 1); assert.equal(adverse[0].status, "passed"); assert.ok(adverse[0].partialBytes.every(bytes => bytes === 0));
  assert.equal(adverse[0].metrics.queuedBytes, 0); assert.equal(adverse[0].metrics.pendingOperations, 0);
  const samples = rows.filter(row => row.kind === "input-read-diagnostics").flatMap(row => row.samples); assert.equal(samples.length, 2);
  const failure = samples[0]; assert.equal(failure.exceptionName, "NotReadableError"); assert.equal(failure.exceptionCode, 0);
  assert.equal(failure.messageClass, "injected-control"); assert.equal(failure.requestedBytes, 65536); assert.equal(failure.failureOrdinal, 1);
  assert.equal(failure.inputSize, previous.normal.input.bytes); assert.ok(Number.isSafeInteger(failure.offset) && failure.offset >= 0 && failure.offset < failure.inputSize);
  assert.deepEqual(samples[1], { ...failure, failureOrdinal: 2 }, "Existing native AVIO second call, no diagnostic-layer retry");
  const markers = rows.filter(row => row.kind === "validated-same-page-recovery"); assert.equal(markers.length, 1);
  const marker = markers[0]; assert.equal(marker.phase, "input-read-failure"); assert.equal(marker.noPageReload, true);
  for (const field of ["retiredWorkerAbsent", "productionReplacementWorkerUsed", "completedWorkerRetired"]) assert.equal(marker[field], true);
  const recovery = inspectBitrateDiagnostic({ ...report, rows: report.rows.slice(marker.startRow, marker.endRow) }, baseline, build, 4000000);
  assert.equal(recovery.caseStatus, "passed"); assert.deepEqual(recovery.input, previous.normal.input);
  assert.equal(recovery.outputBytes, previous.normal.outputBytes);
  const leases = rows.filter(row => row.kind === "actual-asyncify-storage-lifecycle").flatMap(row => row.samples); assert.equal(leases.length, 2);
  for (const lease of leases) { assert.equal(lease.allocations, 1); assert.equal(lease.frees, 1); assert.equal(lease.activeLeases, 0); assert.equal(lease.retainedBytes, 0); }
  return { previous, inputReadFailures: samples, validatedInputFailureRecovery: recovery, actualExtraAsyncifyLifecycle: leases,
    genuineValidatedConversions: 4, injectedFailureNotOriginalCauseReproduction: true, fullOriginalAcceptance: false, publicAcceptance: false, speedImprovementProven: false };
}
export function makeInputReadMediaCaller(source, root) {
  const old = makeAsyncifyMediaCaller(source, root), url = pathToFileURL(path.join(root, "scripts/lib/input-read-media-recipe.mjs")).href;
  let generated = once(old.generated,
    `import { makeAsyncifyMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectAsyncifyMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/asyncify-storage-media-recipe.mjs")).href)};`,
    `import { makeInputReadMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectInputReadMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(url)};`);
  generated = once(generated,
    `import { asyncifyMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/asyncify-storage-media-recipe.mjs")).href)};`,
    `import { inputReadMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(url)};`);
  generated = generated.replaceAll("${stamp}-asyncify-storage-media", "${stamp}-input-read-media")
    .replaceAll("three-headless-attempt-core-conversions-and-recovery-passed-not-full-acceptance", "four-headless-conversions-input-failure-and-recovery-passed-not-full-acceptance");
  // Retain only bounded direct failure attachments, not trace-resource trees or
  // generated media. Preserve the old depth/file/size/count caps unchanged.
  generated = once(generated, "if (entry.isDirectory()) await visit(file, depth + 1);",
    'if (entry.isDirectory()) { if (depth === 0 && !entry.name.startsWith(".")) await visit(file, depth + 1); }');
  return { generated, generatedSha256: sha(generated), previousCallerSha256: old.generatedSha256 };
}
