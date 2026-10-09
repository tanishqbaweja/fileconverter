// Join actual failed request/free headers with actual binary static padding flow.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { alignedFallbackCapacityFacts } from "./lib/aligned-fallback-capacity.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const inputs = {};
async function load(file) { const bytes = await read(file); inputs[file] = { bytes: bytes.length, sha256: sha(bytes) }; return JSON.parse(bytes); }
const callsite = await load("evidence/progress-full-aligned-callsite-2026-10-10.json");
const flow = await load("evidence/progress-full-aligned-normalization-verified-2026-10-10.json");
const allocator = await load("output/playwright/2026-10-08T07-27-40-370Z-late-dlmalloc-static.json");
const terminal = await load("evidence/2026-10-09T16-55-27-062Z-progress-compositing-original-full-completion-analysis.json");
assert.equal(callsite.failure, null); assert.equal(flow.failure, null); assert.equal(allocator.failure, null);
assert.equal(flow.input.sha256, inputs[flow.input.path].sha256);
assert.equal(flow.allocatorInput.sha256, inputs[flow.allocatorInput.path].sha256);
assert.deepEqual(callsite.inspection.binary, flow.inspection.binary); assert.deepEqual(flow.inspection.binary, allocator.inspection.binary);
assert.deepEqual(flow.inspection.binary, terminal.actualDecoderBinary);
assert.equal(flow.inspection.actualFatalCallIsSecondMallocSite, true);
assert.deepEqual(callsite.inspection.runtimeRequest, terminal.failedDecoderRequest);
assert.deepEqual(callsite.inspection.runtimeFreeHeaders, terminal.allocatorFreeHeaders);
const binary = await read(flow.inspection.binary.path); assert.equal(sha(binary), flow.inspection.binary.sha256);
const metadata = readWasmFunctionMetadata(binary, new Set(["__wrap_posix_memalign", "emscripten_builtin_malloc"]));
for (const actual of metadata) {
  const expected = actual.name === "__wrap_posix_memalign" ? callsite.inspection.functions[actual.name] : allocator.inspection.selectedFunctions[actual.name];
  assert.deepEqual(actual, expected.originalMetadata);
  assert.equal(sha(binary.subarray(actual.bodyStart, actual.bodyEnd)), expected.originalBodySha256);
}
assert.equal(sha(flow.inspection.wrapperText), flow.inspection.wrapperTextSha256);
const allocatorText = allocator.inspection.selectedFunctions.emscripten_builtin_malloc.text;
assert.equal(sha(allocatorText), allocator.inspection.selectedFunctions.emscripten_builtin_malloc.sha256);
const facts = alignedFallbackCapacityFacts({ wrapperText: flow.inspection.wrapperText, allocatorText,
  fatalCallOffset: flow.inspection.actualFatalCallOffset, request: terminal.failedDecoderRequest, freeHeaders: terminal.allocatorFreeHeaders });
const sourceFiles = ["scripts/analyze-progress-full-aligned-capacity.mjs", "scripts/lib/aligned-fallback-capacity.mjs"];
const result = { recordedAt: new Date().toISOString(), status: "actual-aligned-fallback-free-capacity-failure-explained-not-fix", inputs,
  actualBinary: flow.inspection.binary, actualRequestAndFreeHeadersJoined: true, exactCompiledAllocatorAndWrapperBodiesVerified: true,
  ...facts, historicalRawAndTerminalFactsUnmodified: true, browserConversionsPerformed: 0,
  actualConverterFunctionsExecuted: 0, heapLimitRaised: false, noDocker: true,
  sourcePins: Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await read(file))]))),
  nextAction: "Choose and test a bounded alignment/cache policy that avoids the padded fallback/auxiliary churn without modifying live references, quality or fixed heaps; no unchanged full replay." };
const output = "evidence/progress-full-aligned-capacity-2026-10-10.json";
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: result.status, ...facts }));
