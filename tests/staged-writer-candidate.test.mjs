// Regression controls for a measured REJECTED optimization, never production acceptance.
import assert from "node:assert/strict";
import {createHash}from"node:crypto";
import {readFile}from"node:fs/promises";
import path from"node:path";
import test from"node:test";
import{build}from"esbuild";
import{gunzipSync}from"node:zlib";
import archived from"../fixtures/source/staged-save-before-held-writer-2026-11-17.json" with {type:"json"};
import{heldWriterSource}from"../scripts/lib/staged-writer-control.mjs";
const root=path.resolve(import.meta.dirname,"..");
const candidate=heldWriterSource(gunzipSync(Buffer.from(archived.gzipBase64,"base64")).toString()).source;
const compiled=await build({entryPoints:[path.join(root,"workers/staged-save-runtime.ts"),path.join(root,"lib/resource-limits.ts")],outdir:"unused",bundle:true,format:"esm",platform:"node",write:false,plugins:[{name:"rejected-held-writer-only",setup(api){api.onLoad({filter:/staged-save-runtime\.ts$/},()=>({contents:candidate,loader:"ts",resolveDir:path.join(root,"workers")}));}}]});
const importCompiled=async name=>import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles.find(f=>f.path.endsWith(name)).contents).toString("base64"));
const{runStagedSave}=await importCompiled("staged-save-runtime.js");
const{STAGED_SAVE_COPY_CHUNK_BYTES}=await importCompiled("resource-limits.js");
function fixture(options = {}) {
  const bytes = new Uint8Array(1048576 + 17); for (let i = 0; i < bytes.length; i++) bytes[i] = i & 255;
  const trace = [], responses = [], writes = [], readBuffers = new Set(); let cancelled = Boolean(options.cancelInitially), readClosed = false, pending = 0, maximumPending = 0;
  const profileId = options.profileId ?? "mkv-to-mp4";
  const digest = createHash("sha256"), name = `within-stage-${profileId}-job-1`;
  const access = { read(buffer, { at }) { readBuffers.add(buffer.buffer); trace.push("read"); if (options.readError) throw options.readError;
    if (options.shortRead) return 0; const size = Math.min(buffer.length, bytes.length - at); buffer.set(bytes.subarray(at, at + size)); return size; },
    close() { assert.equal(readClosed, false); readClosed = true; trace.push("read-close"); } };
  let locked = false;
  const writer = { closed: Promise.resolve(),
    async write(buffer) { assert.equal(locked,true); pending++; maximumPending = Math.max(maximumPending, pending); trace.push("write");
      try { await Promise.resolve(); if (options.writeError) throw options.writeError; digest.update(buffer); writes.push(buffer.length); if (options.cancelAfterWrite) cancelled = true; }
      finally { pending--; } },
    async close() { assert.equal(locked,true); trace.push("write-close"); if (options.closeError) throw options.closeError; },
    releaseLock() { assert.equal(locked,true); locked=false;trace.push("writer-release"); } };
  const writable = {
    async truncate(size) { assert.equal(locked,false);assert.equal(size,0);trace.push("truncate");if(options.truncateError)throw options.truncateError; },
    getWriter() { assert.equal(locked,false);if(options.writerError)throw options.writerError;locked=true;trace.push("writer-acquire");return writer; },
    async write() { assert.fail("No per-chunk convenience writer acquisition"); },
    async close() { assert.fail("Close through the held writer"); },
    async abort() { assert.equal(locked,false,"Release the writer before aborting its stream");trace.push("abort"); } };
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
test("Rejected held-writer candidate: Wasm-free save preserves exact bytes and original fixed-buffer backpressure before genuine completion", async () => {
  const f = fixture(); await runStagedSave(f.message, f.context);
  assert.deepEqual(f.writes, [524288, 524288, 17]); assert.equal(f.maximumPending(), 1); assert.equal(f.readBuffers.size, 1);
  assert.equal(f.digest.digest("hex"), createHash("sha256").update(f.bytes).digest("hex"));
  const last = f.responses.at(-1); assert.equal(last.type, "complete"); assert.equal(last.metrics.outputBytes, f.bytes.length);
  assert.equal(last.metrics.scratchBytes, 0); assert.equal(last.metrics.wasmMemoryBytes, 0); assert.equal(last.metrics.peakWasmMemoryBytes, 50331648);
  assert.equal(last.metrics.sharedArrayBufferBytes, 4); assert.equal(last.metrics.elapsedMs, 2000); assert.equal(last.metrics.pendingOperations, 0);
  assert.equal(f.trace.filter(x=>x==="writer-acquire").length,1);
  assert.equal(f.trace.filter(x=>x==="writer-release").length,1);
  assert.ok(f.trace.indexOf("writer-release")<f.trace.lastIndexOf("complete"));
});
test("Rejected held-writer candidate: separate-saver disclosure and real buffer share512KiB without changing other staged profiles", async () => {
  assert.equal(STAGED_SAVE_COPY_CHUNK_BYTES, 524288);
  const worker = await readFile(path.join(root, "workers/conversion.worker.ts"), "utf8");
  const saver = await readFile(path.join(root, "workers/staged-save-runtime.ts"), "utf8");
  assert.match(worker, /profileId === MPEG2_JOB_PROFILE \|\| isVpxDecoderProfile\(profileId\) \? STAGED_SAVE_COPY_CHUNK_BYTES : copyChunkBytes/);
  assert.match(saver, /copyChunkBytes = STAGED_SAVE_COPY_CHUNK_BYTES/);
  const f = fixture({ profileId: "mkv-to-mp4-mpeg2" }); await runStagedSave(f.message, f.context);
  assert.deepEqual(f.writes, [STAGED_SAVE_COPY_CHUNK_BYTES, STAGED_SAVE_COPY_CHUNK_BYTES, 17]);
  assert.equal(f.maximumPending(), 1); assert.equal(f.readBuffers.size, 1);
});
test("Rejected held-writer candidate: cancellation before copying or after one write closes owned resources and never falsely completes", async () => {
  for (const options of [{ cancelInitially: true }, { cancelAfterWrite: true }]) {
    const f = fixture(options); await runStagedSave(f.message, f.context);
    assert.equal(f.responses.at(-1).type, "cancelled"); assert.equal(f.responses.at(-1).metrics.scratchBytes, 0);
    assert.equal(f.responses.some(r => r.type === "complete"), false); assert.ok(f.trace.includes("remove"));
    if (options.cancelInitially) assert.equal(f.trace.includes("write-open"), false);
    else { assert.ok(f.trace.includes("read-close")); assert.ok(f.trace.includes("abort")); assert.equal(f.writes.length, 1); }
  }
});
test("Rejected held-writer candidate: realistic write/truncate/read/close errors and original injected faults preserve failure and cleanup", async () => {
  for (const option of ["writeError", "truncateError", "readError", "closeError", "writerError"]) {
    const f = fixture({ [option]: new Error(option) }); await runStagedSave(f.message, f.context);
    assert.equal(f.responses.at(-1).type, "error"); assert.equal(f.responses.at(-1).message, option);
    assert.ok(f.trace.includes("remove")); assert.ok(f.trace.includes("abort")); assert.equal(f.responses.some(r => r.type === "complete"), false);
    if(f.trace.includes("writer-acquire"))assert.ok(f.trace.indexOf("writer-release")<f.trace.indexOf("abort"));
  }
  for (const testFault of ["write", "permission", "quota"]) {
    const f = fixture({ testFault }); await runStagedSave(f.message, f.context);
    assert.equal(f.writes.length, 1); assert.equal(f.responses.at(-1).type, "error"); assert.ok(f.trace.includes("abort")); assert.ok(f.trace.includes("remove"));
  }
});
test("Rejected held-writer candidate: changed/short source and failed stage removal cannot be relabelled successful save or clean scratch", async () => {
  for (const options of [{ changedSize: true }, { shortRead: true }, { cleanupError: new Error("locked stage") }]) {
    const f = fixture(options); await runStagedSave(f.message, f.context);
    assert.equal(f.responses.at(-1).type, "error"); assert.equal(f.responses.some(r => r.type === "complete"), false);
    if (options.cleanupError) { assert.equal(f.responses.at(-1).metrics.scratchBytes, f.bytes.length); assert.ok(f.responses.some(r => r.type === "warning")); }
  }
});
test("Rejected held-writer candidate: invalid handoff stage never opens or deletes unrelated storage", async () => {
  const f = fixture(); f.message.stagingName = "foreign-user-file"; await runStagedSave(f.message, f.context);
  assert.equal(f.responses.at(-1).type, "error"); assert.equal(f.trace.includes("root"), false); assert.equal(f.trace.includes("remove"), false);
});

test("Rejected held-writer candidate: explicit MPEG-2 save uses identical backpressure, real completion and cleanup on every terminal path", async () => {
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
