import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { makeObservedResvgBinding } from "../images/resvg-source/observed-binding-contract.mjs";
import { getInitializedResvgMemory, initWasm } from "../lib/vendor/resvg-binding.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const bundle = await build({ stdin: { contents: 'export { observeSvgMemory } from "./lib/svg-memory-observation.ts";', loader: "ts", resolveDir: root },
  bundle: true, platform: "node", format: "esm", write: false });
const { observeSvgMemory } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));

test("observed binding preserves every pinned upstream byte and adds only a stateless accessor with the original license", async () => {
  const original = await read("node_modules/@resvg/resvg-wasm/index.mjs"), actual = await read("lib/vendor/resvg-binding.mjs");
  assert.equal(sha(actual), sha(makeObservedResvgBinding(original)), "Exact additive binding recipe");
  const license = await read("lib/vendor/resvg-LICENSE-MPL-2.0.txt");
  // The upstream license has no final newline; repository text adds exactly LF.
  assert.equal(license.at(-1), 10);
  assert.equal(sha(license.subarray(0, -1)), "4b89d4518bd135ab4ee154a7bce722246b57a98c3d7efc1a09409898160c2bd1");
  assert.equal(sha(license), "1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5");
  assert.equal(getInitializedResvgMemory(), null);
});
test("Node binding identity smoke exposes actual initialized memory and preserves one-shot init; no SVG is rasterized", async () => {
  const bytes = await read("public/engines/svg/resvg.wasm");
  assert.equal(sha(bytes), "22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70");
  await initWasm(bytes); const memory = getInitializedResvgMemory();
  assert.ok(memory instanceof WebAssembly.Memory); assert.equal(memory.buffer.byteLength, 23 * 65536);
  assert.equal(getInitializedResvgMemory(), memory); await assert.rejects(initWasm(bytes), /Already initialized/);
});
test("real memory growth is sampled without copies and cleanup keeps actual linear size and peak, not a fabricated zero", () => {
  const metrics = { wasmMemoryBytes: 0, peakWasmMemoryBytes: 0, wasmMemories: {} }, memory = new WebAssembly.Memory({ initial: 1, maximum: 4 });
  observeSvgMemory(metrics, "initialized", memory); assert.equal(metrics.wasmMemoryBytes, 65536);
  memory.grow(2); observeSvgMemory(metrics, "rasterized", memory); observeSvgMemory(metrics, "released", memory);
  assert.equal(metrics.wasmMemoryBytes, 196608); assert.equal(metrics.peakWasmMemoryBytes, 196608);
  assert.deepEqual(metrics.wasmMemories, { resvg: 196608 }); assert.equal(metrics.svgMemoryObservation.maximumBytes, null);
  assert.equal(metrics.svgMemoryObservation.observations, 3); assert.equal(metrics.svgMemoryObservation.unavailableObservations, 0);
  assert.equal(metrics.svgMemoryObservation.phase, "released");
  assert.deepEqual(metrics.svgMemoryObservation.phaseBytes, { initialized: 65536, rasterized: 196608, released: 196608 });
  assert.equal(metrics.svgMemoryObservation.currentPages, 3); assert.equal(metrics.svgMemoryObservation.peakPages, 3);
  assert.equal(metrics.svgMemoryObservation.maximumPages, null);
  assert.throws(() => observeSvgMemory(metrics, "unbounded-foreign-key", memory), /Unknown SVG/);
  assert.ok(Object.values(metrics.svgMemoryObservation).every(value => !(value instanceof WebAssembly.Memory)));
  assert.ok(JSON.stringify(metrics).length < 1024);
});
test("missing or throwing observations are null and excluded from peaks; preparing is not a failed initialized sample", () => {
  const metrics = { wasmMemoryBytes: 0, peakWasmMemoryBytes: 0, wasmMemories: {} };
  observeSvgMemory(metrics, "preparing", null);
  assert.equal(metrics.svgMemoryObservation.currentBytes, null); assert.equal(metrics.svgMemoryObservation.peakBytes, null);
  assert.equal(metrics.wasmMemoryBytes, undefined); assert.equal(metrics.peakWasmMemoryBytes, undefined);
  assert.equal(metrics.svgMemoryObservation.unavailableObservations, 0);
  observeSvgMemory(metrics, "initialized", new WebAssembly.Memory({ initial: 2 }));
  observeSvgMemory(metrics, "encoded", { get buffer() { throw new Error("Unavailable"); } });
  assert.equal(metrics.svgMemoryObservation.currentBytes, null); assert.equal(metrics.svgMemoryObservation.peakBytes, 131072);
  assert.equal(metrics.svgMemoryObservation.unavailableObservations, 1); assert.equal(metrics.wasmMemoryBytes, undefined);
  assert.equal(metrics.peakWasmMemoryBytes, 131072); assert.deepEqual(metrics.wasmMemories, {});
});
test("a legitimately observed zero-page memory is distinct from unavailable; scalar counts do not retain samples", () => {
  const metrics = {}; observeSvgMemory(metrics, "initialized", new WebAssembly.Memory({ initial: 0, maximum: 1 }));
  assert.equal(metrics.svgMemoryObservation.available, true); assert.equal(metrics.wasmMemoryBytes, 0);
  assert.equal(metrics.svgMemoryObservation.currentBytes, 0); assert.equal(metrics.svgMemoryObservation.peakBytes, 0);
  assert.equal(metrics.svgMemoryObservation.unavailableObservations, 0);
});
test("production SVG captures all allocation stages and nested release cleanup; UI distinguishes missing memory from not-used", async () => {
  const worker = (await read("workers/conversion.worker.ts")).toString(), app = (await read("app/converter/ConverterApp.tsx")).toString();
  for (const phase of ["preparing", "initialized", "parsed", "rasterized", "encoded", "released"])
    assert.ok(worker.includes(`observeSvgMemory(metrics, "${phase}", getInitializedResvgMemory())`), phase);
  assert.match(worker, /finally \{ observeSvgMemory\(metrics, "released"/);
  assert.match(app, /metrics.svgMemoryObservation.peakBytes === null/); assert.match(app, /"Unavailable"/);
  assert.match(app, /svgMemoryObservation\?\.unavailableObservations/);
});
