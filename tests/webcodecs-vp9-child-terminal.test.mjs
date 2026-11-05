// Real private worker/async destination adapter, mocked native engine only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const compiled = await build({ entryPoints: ["workers/webcodecs-vp9-qualification.worker.ts"], bundle: true, format: "esm", platform: "node", write: false,
  plugins: [{ name: "private-engine-unit", setup(builder) {
    builder.onResolve({ filter: /^\.\/media-remux$/ }, () => ({ path: "runtime", namespace: "mock" }));
    builder.onResolve({ filter: /^\.\/webcodecs-vp9-core$/ }, () => ({ path: "core", namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: path === "runtime" ?
      'export const runMediaRemux = options => globalThis.__vp9ChildUnit.run(options);' :
      'export const loadWebCodecsVp9Core = async () => ({ snapshot: () => null }); export const assertWebCodecsVp9Options = () => {};' }));
  } }],
});
let sequence = 0;
async function execute({ run, stream = {}, implementation = "candidate", output = undefined }) {
  const saved = { self: globalThis.self, unit: globalThis.__vp9ChildUnit }, messages = [], calls = [];
  const scope = { postMessage: message => messages.push(message), close: () => calls.push("worker-close") };
  globalThis.self = scope; globalThis.__vp9ChildUnit = { run };
  try {
    await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64") + "#" + sequence++);
    const fileStream = { write: async () => calls.push("write"), truncate: async () => {},
      close: async () => calls.push("stream-close"), abort: async () => calls.push("abort"), ...stream };
    await scope.onmessage({ data: { file: new File(["tiny"], "mock.mkv"), output: output ?? { createWritable: async () => fileStream },
      cancellation: new SharedArrayBuffer(4), nativeProfile: 10, video: { codec: "vp9" }, implementation, fallbackCore: "single-thread" } });
    return { result: messages.at(-1), calls };
  } finally {
    if (saved.self === undefined) delete globalThis.self; else globalThis.self = saved.self;
    if (saved.unit === undefined) delete globalThis.__vp9ChildUnit; else globalThis.__vp9ChildUnit = saved.unit;
  }
}
test("unsupported native initialization reports zero write attempts only AFTER actual stream abort completes", async () => {
  const { result, calls } = await execute({ run: async () => { throw new DOMException("unsupported", "NotSupportedError"); } });
  assert.equal(result.type, "error"); assert.equal(result.errorName, "NotSupportedError"); assert.equal(result.errorStage, "conversion");
  assert.equal(result.writeAttempts, 0); assert.equal(result.cleanupComplete, true); assert.deepEqual(calls, ["abort", "worker-close"]);
});
test("failed stream write counts as an attempt even with zero output bytes", async () => {
  const { result, calls } = await execute({ run: async options => options.writable.write(new Uint8Array([1])),
    stream: { write: async () => { throw new DOMException("disk failure", "NotSupportedError"); } } });
  assert.equal(result.type, "error"); assert.equal(result.writeAttempts, 1); assert.equal(result.metrics.outputBytes, 0);
  assert.equal(result.cleanupComplete, true); assert.deepEqual(calls, ["abort", "worker-close"]);
});
test("abort rejection is NOT swallowed into a false cleanup-complete signal", async () => {
  const { result, calls } = await execute({ run: async () => { throw new DOMException("unsupported", "NotSupportedError"); },
    stream: { abort: async () => { throw new Error("abort failed"); } } });
  assert.equal(result.cleanupComplete, false); assert.match(result.cleanupError, /abort failed/);
  assert.equal(result.writeAttempts, 0); assert.deepEqual(calls, ["worker-close"]);
});
test("destination API rejection is labelled separately and never called native initialization", async () => {
  const { result } = await execute({ run: () => assert.fail("No native execution"),
    output: { createWritable: async () => { throw new DOMException("destination unsupported", "NotSupportedError"); } } });
  assert.equal(result.errorStage, "destination-open"); assert.equal(result.writeAttempts, 0);
});
test("CPU-only child explicitly selects single-thread general core and commits real adapter writes", async () => {
  const { result, calls } = await execute({ implementation: "wasm-baseline", run: async options => {
    assert.equal(options.singleThreadVideoCore, true); assert.equal(options.webCodecsVp9Core, undefined);
    await options.writable.write(new Uint8Array([1, 2, 3]));
  } });
  assert.equal(result.type, "complete"); assert.equal(result.writeAttempts, 1); assert.equal(result.cleanupComplete, true);
  assert.deepEqual(calls, ["write", "stream-close", "worker-close"]);
});
