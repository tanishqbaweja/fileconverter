import { readPreCatalogueUi, readPreMpeg2JobWorker } from "./helpers/historical-published-ui.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import ts from "typescript";
import { makeStagedHandoffApp, makeStagedHandoffWorker } from "../scripts/lib/staged-worker-handoff-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const compiled = await build({ entryPoints: [path.join(root, "workers/staged-save-runtime.ts")], bundle: true, format: "esm", platform: "node", write: false });
const { runStagedSave } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
function fixture(options = {}) {
  const bytes = new Uint8Array(1048576 + 17); for (let i = 0; i < bytes.length; i++) bytes[i] = i & 255;
  const trace = [], responses = [], writes = [], readBuffers = new Set(); let cancelled = Boolean(options.cancelInitially), readClosed = false, pending = 0, maximumPending = 0;
  const profileId = options.profileId ?? "mkv-to-mp4";
  const digest = createHash("sha256"), name = `within-stage-${profileId}-job-1`;
  const access = { read(buffer, { at }) { readBuffers.add(buffer.buffer); trace.push("read"); if (options.readError) throw options.readError;
    if (options.shortRead) return 0; const size = Math.min(buffer.length, bytes.length - at); buffer.set(bytes.subarray(at, at + size)); return size; },
    close() { assert.equal(readClosed, false); readClosed = true; trace.push("read-close"); } };
  const writable = { async truncate(size) { assert.equal(size, 0); trace.push("truncate"); if (options.truncateError) throw options.truncateError; },
    async write(buffer) { pending++; maximumPending = Math.max(maximumPending, pending); trace.push("write");
      try { await Promise.resolve(); if (options.writeError) throw options.writeError; digest.update(buffer); writes.push(buffer.length); if (options.cancelAfterWrite) cancelled = true; }
      finally { pending--; } },
    async close() { trace.push("write-close"); if (options.closeError) throw options.closeError; }, async abort() { trace.push("abort"); } };
  const stage = { async getFile() { return { size: bytes.length + (options.changedSize ? 1 : 0) }; }, async createSyncAccessHandle() { trace.push("read-open"); return access; } };
  const directory = { async getFileHandle(selected) { assert.equal(selected, name); return stage; },
    async removeEntry(selected) { assert.equal(selected, name); trace.push("remove"); if (options.cleanupError) throw options.cleanupError; } };
  const message = { type: "copy-staged", jobId: "job-1", profileId, stagingName: name, jobStartedEpochMs: 1000,
    handle: { async createWritable() { trace.push("write-open"); return writable; } }, cancellationBuffer: new SharedArrayBuffer(4), testFault: options.testFault,
    metrics: { inputBytes: 100, outputBytes: 0, queuedBytes: 0, peakQueuedBytes: 65536, pendingOperations: 0, peakPendingOperations: 1,
      maxReadChunkBytes: 65536, maxWriteChunkBytes: 65536, elapsedMs: 123.5, wasmMemoryBytes: 50331648, peakWasmMemoryBytes: 50331648,
      sharedArrayBufferBytes: 50331652, activeWorkerCount: 1, scratchBytes: bytes.length, peakScratchBytes: bytes.length } };
  const context = { storage: { async getDirectory() { trace.push("root"); return directory; } }, isCancelled: () => cancelled,
    post(response) { if (response.type === "complete") { assert.ok(trace.includes("write-close")); assert.ok(trace.includes("remove")); } responses.push(response); trace.push(response.type); },
    clock: { origin: 2000, now: () => 1000, pause: async () => {} } };
  return { message, context, responses, trace, writes, readBuffers, bytes, digest, maximumPending: () => maximumPending };
}
test("Wasm-free save preserves exact bytes and original fixed-buffer backpressure before genuine completion", async () => {
  const f = fixture(); await runStagedSave(f.message, f.context);
  assert.deepEqual(f.writes, [524288, 524288, 17]); assert.equal(f.maximumPending(), 1); assert.equal(f.readBuffers.size, 1);
  assert.equal(f.digest.digest("hex"), createHash("sha256").update(f.bytes).digest("hex"));
  const last = f.responses.at(-1); assert.equal(last.type, "complete"); assert.equal(last.metrics.outputBytes, f.bytes.length);
  assert.equal(last.metrics.scratchBytes, 0); assert.equal(last.metrics.wasmMemoryBytes, 0); assert.equal(last.metrics.peakWasmMemoryBytes, 50331648);
  assert.equal(last.metrics.sharedArrayBufferBytes, 4); assert.equal(last.metrics.elapsedMs, 2000); assert.equal(last.metrics.pendingOperations, 0);
});
test("cancellation before copying or after one write closes owned resources and never falsely completes", async () => {
  for (const options of [{ cancelInitially: true }, { cancelAfterWrite: true }]) {
    const f = fixture(options); await runStagedSave(f.message, f.context);
    assert.equal(f.responses.at(-1).type, "cancelled"); assert.equal(f.responses.at(-1).metrics.scratchBytes, 0);
    assert.equal(f.responses.some(r => r.type === "complete"), false); assert.ok(f.trace.includes("remove"));
    if (options.cancelInitially) assert.equal(f.trace.includes("write-open"), false);
    else { assert.ok(f.trace.includes("read-close")); assert.ok(f.trace.includes("abort")); assert.equal(f.writes.length, 1); }
  }
});
test("realistic write/truncate/read/close errors and original injected faults preserve failure and cleanup", async () => {
  for (const option of ["writeError", "truncateError", "readError", "closeError"]) {
    const f = fixture({ [option]: new Error(option) }); await runStagedSave(f.message, f.context);
    assert.equal(f.responses.at(-1).type, "error"); assert.equal(f.responses.at(-1).message, option);
    assert.ok(f.trace.includes("remove")); assert.ok(f.trace.includes("abort")); assert.equal(f.responses.some(r => r.type === "complete"), false);
  }
  for (const testFault of ["write", "permission", "quota"]) {
    const f = fixture({ testFault }); await runStagedSave(f.message, f.context);
    assert.equal(f.writes.length, 1); assert.equal(f.responses.at(-1).type, "error"); assert.ok(f.trace.includes("abort")); assert.ok(f.trace.includes("remove"));
  }
});
test("changed/short source and failed stage removal cannot be relabelled successful save or clean scratch", async () => {
  for (const options of [{ changedSize: true }, { shortRead: true }, { cleanupError: new Error("locked stage") }]) {
    const f = fixture(options); await runStagedSave(f.message, f.context);
    assert.equal(f.responses.at(-1).type, "error"); assert.equal(f.responses.some(r => r.type === "complete"), false);
    if (options.cleanupError) { assert.equal(f.responses.at(-1).metrics.scratchBytes, f.bytes.length); assert.ok(f.responses.some(r => r.type === "warning")); }
  }
});
test("invalid handoff stage never opens or deletes unrelated storage", async () => {
  const f = fixture(); f.message.stagingName = "foreign-user-file"; await runStagedSave(f.message, f.context);
  assert.equal(f.responses.at(-1).type, "error"); assert.equal(f.trace.includes("root"), false); assert.equal(f.trace.includes("remove"), false);
});

test("explicit MPEG-2 save uses identical backpressure, real completion and cleanup on every terminal path", async () => {
  for (const options of [{}, { cancelInitially: true }, { cancelAfterWrite: true },
    { writeError: new Error("write refused") }, { changedSize: true }, { cleanupError: new Error("locked") }]) {
    const f = fixture({ ...options, profileId: "mkv-to-mp4-mpeg2" }); await runStagedSave(f.message, f.context);
    assert.ok(f.maximumPending() <= 1); assert.ok(f.readBuffers.size <= 1);
    assert.ok(f.writes.every(bytes => bytes <= 524288));
    assert.equal(f.responses.at(-1).type, options.cancelInitially || options.cancelAfterWrite ? "cancelled" : Object.keys(options).length ? "error" : "complete");
    assert.equal(f.responses.at(-1).metrics.wasmMemoryBytes, 0);
    if (!Object.keys(options).length) assert.equal(f.digest.digest("hex"), createHash("sha256").update(f.bytes).digest("hex"));
    if (!options.cleanupError) assert.equal(f.responses.at(-1).metrics.scratchBytes, 0);
  }
  for (const mutate of [m => { m.jobId = "other"; }, m => { m.profileId = "mkv-to-mp4"; },
    m => { m.stagingName += "-other"; }, m => { m.jobId = "../test.mkv"; }]) {
    const f = fixture({ profileId: "mkv-to-mp4-mpeg2" }); mutate(f.message); await runStagedSave(f.message, f.context);
    assert.equal(f.responses.at(-1).type, "error"); assert.equal(f.trace.includes("root"), false); assert.equal(f.trace.includes("remove"), false);
  }
});
test("new save worker retains byte-exact old copy loop, imports no codec engine and bundles below32KiB", async () => {
  const source = await readFile(path.join(root, "workers/conversion.worker.ts"), "utf8"), current = await readFile(path.join(root, "workers/staged-save-runtime.ts"), "utf8");
  const extract = text => { const start = text.indexOf("        const buffer = new Uint8Array(copyChunkBytes);"), end = text.indexOf("        await finalWritable.close();", start); assert.ok(start > 0 && end > start); return text.slice(start, end + "        await finalWritable.close();".length); };
  assert.equal(extract(current), extract(source));
  const bundle = await build({ entryPoints: [path.join(root, "workers/staged-save.worker.ts")], bundle: true, format: "esm", platform: "browser", write: false, metafile: true });
  assert.ok(bundle.outputFiles[0].contents.length < 32768);
  assert.ok(!Object.keys(bundle.metafile.inputs).some(name => /media-remux|ffmpeg|resvg|conversion\.worker/.test(name)));
  assert.equal(/WebAssembly\.(?:Memory|instantiate|compile)/.test(bundle.outputFiles[0].text), false);
});
test("historical app overlay and unchanged worker overlay reverse exactly and pass full project TypeScript checking", async () => {
  const app = path.join(root, "app/converter/ConverterApp.tsx"), worker = path.join(root, "workers/conversion.worker.ts");
  const appSource = await readPreCatalogueUi("app/converter/ConverterApp.tsx"), workerSource = await readPreMpeg2JobWorker();
  const appRecipe = makeStagedHandoffApp(appSource), workerRecipe = makeStagedHandoffWorker(workerSource);
  for (const [recipe, source] of [[appRecipe, appSource], [workerRecipe, workerSource]]) {
    let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before); assert.equal(reversed, source);
  }
  assert.ok(appRecipe.generated.includes("if (jobIdRef.current) return"));
  const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root, undefined, path.join(root, "tsconfig.json"));
  const host = ts.createCompilerHost(config.options), read = host.readFile.bind(host);
  host.readFile = file => path.resolve(file).toLowerCase() === app.toLowerCase() ? appRecipe.generated : path.resolve(file).toLowerCase() === worker.toLowerCase() ? workerRecipe.generated : read(file);
  const program = ts.createProgram(config.fileNames, { ...config.options, noEmit: true }, host), errors = ts.getPreEmitDiagnostics(program).filter(r => r.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => "\n" }));
});
