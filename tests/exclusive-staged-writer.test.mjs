import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import ts from "typescript";
import { build } from "esbuild";
import { createExclusiveStagedWriter } from "../scripts/lib/exclusive-staged-writer.mjs";
import { makeExclusiveStageWorker } from "../scripts/lib/exclusive-stage-worker-recipe.mjs";
import { makeStagedCopyDiagnosticWorker } from "../scripts/lib/staged-copy-diagnostic-worker.mjs";
function sink(options = {}) {
  const records = [], events = []; let offset = 0, length = 0, maximumPending = 0, pending = 0, locks = 0;
  const stream = new WritableStream({
    async write(chunk) {
      pending++; maximumPending = Math.max(maximumPending, pending);
      try {
        if (chunk?.type === "truncate") { length = chunk.size; offset = Math.min(offset, length); events.push("truncate"); return; }
        if (options.wait) await options.wait;
        if (options.writeError) throw options.writeError;
        records.push({ offset, data: [...chunk] }); offset += chunk.byteLength; length = Math.max(length, offset); events.push("write");
      } finally { pending--; }
    },
    async close() { events.push("close"); if (options.closeError) throw options.closeError; },
    async abort() { events.push("abort"); if (options.abortError) throw options.abortError; },
  });
  const get = () => { locks++; return stream.getWriter(); };
  return { records, events, stats: () => ({ offset, length, maximumPending, locks, locked: stream.locked }),
    fileStream: { getWriter: get, async truncate(size) { const w = get(); try { await w.write({ type: "truncate", size }); } finally { w.releaseLock(); } },
      close: () => stream.close(), abort: reason => stream.abort(reason) } };
}
test("one held writer preserves exact bytes, tail views, truncation and sequential backpressure", async () => {
  const target = sink(), writer = createExclusiveStagedWriter(target.fileStream), buffer = new Uint8Array(8);
  await writer.truncate(0);
  buffer.set([1, 2, 3, 4, 5, 6, 7, 8]); await writer.write(buffer);
  buffer.fill(9); await writer.write(buffer.subarray(0, 3)); await writer.close();
  assert.deepEqual(target.records, [{ offset: 0, data: [1, 2, 3, 4, 5, 6, 7, 8] }, { offset: 8, data: [9, 9, 9] }]);
  assert.deepEqual(target.stats(), { offset: 11, length: 11, maximumPending: 1, locks: 2, locked: false });
  assert.deepEqual(writer.writerMetrics(), { phase: "closed", locks: 1, releases: 1, writes: 2, maximumWriteBytes: 8,
    pendingOperations: 0, retainedWriter: false, retainedStream: false, additionalCopyBufferBytes: 0, queuedChunks: 0 });
});
test("concurrent writes, close or abort are rejected instead of silently queueing", async () => {
  let unblock; const wait = new Promise(resolve => { unblock = resolve; }), target = sink({ wait }), writer = createExclusiveStagedWriter(target.fileStream);
  const operation = writer.write(new Uint8Array(8));
  await assert.rejects(writer.write(new Uint8Array(8)), /backpressure/);
  await assert.rejects(writer.close(), /backpressure/); await assert.rejects(writer.abort("cancel"), /pending/);
  unblock(); await operation; await writer.abort("cancel"); assert.equal(target.stats().locked, false);
  assert.equal(writer.writerMetrics().retainedStream, false);
});
test("write and close failures propagate unchanged and abort releases the stream lock", async () => {
  for (const key of ["writeError", "closeError"]) {
    const error = new Error(key), target = sink({ [key]: error }), writer = createExclusiveStagedWriter(target.fileStream);
    if (key === "writeError") await assert.rejects(writer.write(new Uint8Array(2)), e => e === error);
    else { await writer.write(new Uint8Array(2)); await assert.rejects(writer.close(), e => e === error); }
    await writer.abort(error); assert.equal(target.stats().locked, false); assert.equal(writer.writerMetrics().retainedWriter, false);
    await assert.rejects(writer.write(new Uint8Array(1)), /not open/);
  }
});
test("abort failure still releases owned references and cancellation is idempotent", async () => {
  const error = new Error("abort"), target = sink({ abortError: error }), writer = createExclusiveStagedWriter(target.fileStream);
  await writer.write(new Uint8Array(1)); await assert.rejects(writer.abort(error), e => e === error); await writer.abort(error);
  assert.equal(writer.writerMetrics().releases, 1); assert.equal(target.stats().locked, false); assert.equal(writer.writerMetrics().retainedStream, false);
});
test("empty copy closes without a retained writer and all out-of-bound writes fail before acquisition", async () => {
  const target = sink(), writer = createExclusiveStagedWriter(target.fileStream);
  for (const value of [new Uint8Array(524289), new Uint8Array(new SharedArrayBuffer(8)), {}, new ArrayBuffer(4)])
    await assert.rejects(writer.write(value), /512KiB/);
  for (const size of [-1, NaN, Infinity, 1.5]) await assert.rejects(writer.truncate(size), /truncate/);
  await writer.truncate(0); await writer.close(); assert.equal(writer.writerMetrics().locks, 0); assert.equal(target.stats().locked, false);
});
test("private production worker has only three reversible sink-binding changes, unchanged copy loops and codec heaps", async () => {
  const source = await readFile(new URL("../workers/conversion.worker.ts", import.meta.url), "utf8"), recipe = makeExclusiveStageWorker(source);
  let restored = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, source); assert.equal(recipe.edits.length, 3); assert.equal(recipe.fixedCopyBufferBytes, 524288);
  assert.equal(recipe.sourceReadWriteAndProgressLoopsChanged, false); assert.equal(recipe.primaryMemoryAcceptance, false);
  assert.throws(() => makeExclusiveStageWorker(source + "\n"));
});
test("changed production worker typechecks in the real project and bundles without writing private assets", async () => {
  const root = path.resolve(import.meta.dirname, ".."), filename = path.join(root, "workers/conversion.worker.ts");
  const source = await readFile(filename, "utf8"), recipe = makeExclusiveStageWorker(source);
  const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile); assert.equal(configFile.error, undefined);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root, undefined, path.join(root, "tsconfig.json")), host = ts.createCompilerHost(config.options);
  const originalRead = host.readFile.bind(host);
  host.readFile = file => path.resolve(file).toLowerCase() === filename.toLowerCase() ? recipe.generated : originalRead(file);
  const program = ts.createProgram(config.fileNames, { ...config.options, noEmit: true }, host);
  const errors = ts.getPreEmitDiagnostics(program).filter(row => row.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => "\n" }));
  const bundle = await build({ stdin: { contents: recipe.generated, loader: "ts", resolveDir: path.join(root, "workers"), sourcefile: "conversion.worker.ts" },
    bundle: true, format: "esm", platform: "browser", target: "es2022", write: false, logLevel: "silent" });
  assert.equal(bundle.errors.length, 0); assert.equal(bundle.outputFiles.length, 1); assert.ok(bundle.outputFiles[0].contents.length < 2097152);
  const diagnostic = makeStagedCopyDiagnosticWorker(source);
  assert.equal(diagnostic.fixtureBytes, 6414309978); assert.equal(diagnostic.mediaConversionAcceptance, false);
  assert.ok(diagnostic.generated.includes("await finalWritable.write(value)"));
});
