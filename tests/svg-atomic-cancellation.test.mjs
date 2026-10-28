// Unit-only mock renderer: no image decoding/encoding or native conversion in Node.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const workerSource = await readFile("workers/conversion.worker.ts", "utf8"), appSource = await readFile("app/converter/ConverterApp.tsx", "utf8");
const workerTree = ts.createSourceFile("worker.ts", workerSource, ts.ScriptTarget.Latest, true);
const appTree = ts.createSourceFile("app.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(tree, predicate) { let result; const visit = node => { if (predicate(node)) { assert.equal(result, undefined); result = node; } ts.forEachChild(node, visit); }; visit(tree); assert.ok(result); return result; }
const runSvg = find(workerTree, node => ts.isFunctionDeclaration(node) && node.name?.text === "runSvgToPng").getText(workerTree);
const isCancelled = find(workerTree, node => ts.isFunctionDeclaration(node) && node.name?.text === "isCancelled").getText(workerTree);
const assertActive = find(workerTree, node => ts.isFunctionDeclaration(node) && node.name?.text === "assertActive").getText(workerTree);
const cancellationBufferExpression = find(appTree, node => ts.isVariableDeclaration(node) && node.name.getText(appTree) === "cancellationBuffer").initializer.getText(appTree);
const cancelExpression = find(appTree, node => ts.isVariableDeclaration(node) && node.name.getText(appTree) === "cancelConversion").initializer.getText(appTree);
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

test("actual app allocates exactly four shared bytes for SVG and FFmpeg only, with the existing no-SAB fallback", () => {
  for (const [engine, id, expected] of [["resvg", "svg-to-png", 4], ["ffmpeg-remux", "mkv-to-mp4", 4], ["other", "png-to-jpeg", undefined]]) {
    const value = runInNewContext(compile(`const result = ${cancellationBufferExpression}; result;`), { batch: { profile: { engine, id } }, SharedArrayBuffer });
    assert.equal(value?.byteLength, expected);
  }
  assert.equal(runInNewContext(compile(`const result = ${cancellationBufferExpression}; result;`),
    { batch: { profile: { engine: "resvg", id: "svg-to-png" } }, SharedArrayBuffer: undefined }), undefined);
});
test("actual Cancel handler changes atomic state immediately and still sends its ordinary job-scoped message", () => {
  const signal = new Int32Array(new SharedArrayBuffer(4)), messages = [], phases = [];
  const cancel = runInNewContext(compile(`const cancel = ${cancelExpression}; cancel;`), {
    jobIdRef: { current: "unit-job" }, workerRef: { current: { postMessage: value => messages.push(value) } },
    cancellationSignalRef: { current: signal }, setPhase: value => phases.push(value), Atomics,
  });
  cancel(); assert.equal(Atomics.load(signal, 0), 1);
  assert.equal(JSON.stringify(messages), '[{"type":"cancel","jobId":"unit-job"}]'); assert.deepEqual(phases, ["Cancelling safely"]);
});

function mockJob(cancelAt) {
  const signal = new Int32Array(new SharedArrayBuffer(4)), trace = [], writes = [], observations = [];
  const touch = phase => { trace.push(phase); if (cancelAt === phase) Atomics.store(signal, 0, 1); };
  const rendered = { width: 2, height: 2, asPng() { touch("encode"); return new Uint8Array(256 * 1024 + 1); }, free() { touch("free-rendered"); } };
  class Renderer {
    constructor() { this.width = 2; this.height = 2; touch("parse"); }
    render() { touch("rasterize"); return rendered; }
    free() { touch("free-renderer"); }
  }
  const run = runInNewContext(compile(`${isCancelled}\n${assertActive}\n${runSvg}\nrunSvgToPng;`), {
    cancellationSignal: signal, cancelled: false, resvgInitialization: undefined, Resvg: Renderer, Atomics, DOMException,
    MAX_SVG_INPUT_BYTES: 4 * 1024 * 1024, MAX_IMAGE_PIXELS: 8_294_400, MAX_IMAGE_OUTPUT_BYTES: 64 * 1024 * 1024, MAX_WRITE_CHUNK: 256 * 1024,
    RESVG_WASM_URL: "/unit-only.wasm", getInitializedResvgMemory: () => null,
    observeSvgMemory: (_, phase) => observations.push(phase),
    readBoundedUtf8: async () => { touch("read"); return "unit-only-not-image-data"; }, parseSvgDimensions: () => ({ width: 2, height: 2 }),
    initResvgWasm: async () => touch("initialize"), fetch: () => undefined, emitProgress: () => {},
    writeBounded: async (_, bytes) => { writes.push(bytes.byteLength); touch("write"); },
  });
  return { promise: run({ size: 1 }, {}, "unit-job", {}, 0), trace, writes, observations };
}
for (const [phase, forbidden] of [["read", "initialize"], ["initialize", "parse"], ["parse", "rasterize"], ["rasterize", "encode"], ["encode", "write"]]) {
  test(`actual SVG function observes atomic cancellation after ${phase} before ${forbidden}, freeing every created mock object`, async () => {
    const job = mockJob(phase); await assert.rejects(job.promise, error => error.name === "AbortError");
    assert.ok(!job.trace.includes(forbidden)); assert.deepEqual(job.writes, []);
    assert.equal(job.trace.includes("free-renderer"), ["parse", "rasterize", "encode"].includes(phase));
    assert.equal(job.trace.includes("free-rendered"), ["rasterize", "encode"].includes(phase));
    if (phase !== "read") assert.equal(job.observations.at(-1), "released");
  });
}
test("actual chunk loop sees the same atomic flag before the second bounded mock write", async () => {
  const job = mockJob("write"); await assert.rejects(job.promise, error => error.name === "AbortError");
  assert.deepEqual(job.writes, [256 * 1024]); assert.ok(job.trace.includes("free-rendered")); assert.ok(job.trace.includes("free-renderer"));
});
test("non-cancelled function still writes every bounded mock byte and observes all six phases", async () => {
  const job = mockJob(null); await job.promise; assert.deepEqual(job.writes, [256 * 1024, 1]);
  assert.deepEqual(job.observations, ["preparing", "initialized", "parsed", "rasterized", "encoded", "released"]);
});
