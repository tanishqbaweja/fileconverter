import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { extractPinnedSplitAdapter, makeAbortSplitAdapter, makeAbortOriginalDriver } from "../scripts/lib/mpeg2-abort-original-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const helper = await readFile(path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "utf8");
const stager = await readFile(path.join(root, "scripts/stage-mpeg2-split-direct.mjs"), "utf8");
const source = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");

test("failure-only original derivative preserves every full-source acceptance and cleanup gate", () => {
  const adapter = extractPinnedSplitAdapter(stager);
  const generated = makeAbortOriginalDriver(source, root, s => import.meta.resolve(s), adapter, helper);
  for (const text of ['const diagnosticOnly = false;', 'number <= 3', '6 * 60 * 60_000', 'minimumMs: 300000',
    'blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes', 'run.incrementalPrivateMiB <= 250',
    'assert.ok(ssim >= 0.98)', 'assert.equal(video.width, 1920)', 'assert.equal(video.height, 804)',
    '32 * MiB', '16 * MiB', 'maximumTimestampErrorSeconds <= 0.001', 'await verifySource(); cleanup.protectedFixtureUnchanged = true;',
    'observer.finishCapture()', 'observer.stop()', 'context.route', 'WITHIN_BOUNDED_WASM_ABORT', 'records.length < 8',
    'stack.length <= 8192', 'text.length <= 65536', 'Exact served original adapter', 'abortDiagnostic, failure,'])
    assert.ok(generated.includes(text), text);
  assert.ok(!/Tracing.requestMemoryDump|Memory.startSampling|collectGarbage|Debugger.pause|_malloc\(/.test(generated));
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("unverified helpers, modified historical driver/stager and ambiguous adapters are rejected", () => {
  const adapter = extractPinnedSplitAdapter(stager);
  assert.throws(() => extractPinnedSplitAdapter(stager + "\n"));
  assert.throws(() => makeAbortSplitAdapter(adapter, helper + "\n"));
  assert.throws(() => makeAbortSplitAdapter(adapter + adapter, helper));
  assert.throws(() => makeAbortOriginalDriver(source + "\n", root, s => import.meta.resolve(s), adapter, helper));
});

test("served observer changes neither original bridge/progress nor native call mapping and preserves prior abort error", async () => {
  const changed = makeAbortSplitAdapter(extractPinnedSplitAdapter(stager), helper);
  const calls = [], logs = []; let decoderOptions, encoderOptions, priorCalls = 0, closes = 0;
  const originalError = new Error("original abort callback error");
  const options = { withinBridge: { cancelled: () => false, progress: row => calls.push(row), write: () => 7 },
    onAbort: () => { priorCalls++; throw originalError; }, print: () => {}, printErr: () => {} };
  const stacks = { _emscripten_stack_get_base: () => 262144, _emscripten_stack_get_end: () => 0 };
  const decoderFactory = async value => { decoderOptions = value; return { ...stacks, HEAPU8: { byteLength: 33554432 },
    ccall: (...args) => { calls.push(args); return 17; } }; };
  const encoderFactory = async value => { encoderOptions = value; return { ...stacks, HEAPU8: { byteLength: 16777216 } }; };
  const createSession = () => ({ close: () => { closes++; }, metrics: () => ({ closed: true }) });
  const executable = changed.replace(/^import .+;\n/gm, "").replace("export default async function(options)", "return async function(options)");
  const factory = new Function("decoderFactory", "encoderFactory", "createMpeg2SplitSession", "console", executable)(
    decoderFactory, encoderFactory, createSession, { debug: value => logs.push(value) });
  const core = await factory(options);
  assert.equal(decoderOptions.print, options.print); assert.equal(encoderOptions.print, options.print);
  assert.equal(decoderOptions.withinBridge.write(0, new Uint8Array(1)), 7);
  decoderOptions.withinBridge.progress({ wasmMemoryBytes: 33554432 });
  assert.equal(calls[0].wasmMemoryBytes, 50331648);
  assert.equal(await core.ccall("within_remux", "number", [], [4, 1, 2, 3, 9], {}), 17);
  assert.deepEqual(calls[1][3], [6, 1, 2, 3, 0, 0, 0, 9]); assert.equal(closes, 1);
  assert.equal(logs.filter(value => value.startsWith("WITHIN_BOUNDED_WASM_ABORT ")).length, 0);
  assert.throws(() => decoderOptions.onAbort("pure-test-not-native-OOM"), error => error === originalError);
  assert.equal(priorCalls, 1);
  const rows = logs.filter(value => value.startsWith("WITHIN_BOUNDED_WASM_ABORT "));
  assert.equal(rows.length, 1); const row = JSON.parse(rows[0].slice("WITHIN_BOUNDED_WASM_ABORT ".length));
  assert.equal(row.role, "decoder"); assert.equal(row.failedIndividualAllocationBytes, null);
  assert.equal(row.publicAcceptance, false); assert.equal(row.stackLimitRestored, true);
});
