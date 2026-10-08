// Production-adapter diagnostic only. No synthetic exports/calls in this code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { extractPinnedSplitAdapter, makeAbortSplitAdapter } from "./mpeg2-abort-original-recipe.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function makeLateAbortAdapter({ stager, stackHelper, snapshotHelper, poolHelper, controlProof }) {
  assert.equal(controlProof.status, "passed-synthetic-abort-control");
  assert.equal(controlProof.result.terminal.emitted.latePoolRequest.sequence, 82);
  assert.equal(controlProof.result.terminal.emitted.latePoolRequestUnavailable, null);
  assert.equal(controlProof.exportOnlyControl.originalSha256, "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
  assert.equal(sha(snapshotHelper), controlProof.sourcePins["scripts/lib/late-refstruct-abort-snapshot.mjs"]);
  assert.equal(sha(poolHelper), controlProof.sourcePins["scripts/lib/late-pool-abort-capture.mjs"]);
  const original = extractPinnedSplitAdapter(stager), prior = makeAbortSplitAdapter(original, stackHelper);
  const getter = controlProof.exportOnlyControl.selected.find(row => row.name === "av_refstruct_pool_get");
  const malloc = controlProof.exportOnlyControl.selected.find(row => row.name === "av_malloc");
  assert.deepEqual(getter.params, ["i32"]); assert.deepEqual(malloc.params, ["i32"]);
  const imports = [
    'import { createBoundedWasmAbortCapture } from "./bounded-wasm-abort-capture.mjs";\n',
    'import { readLateRefstructAbortSnapshot } from "./late-refstruct-abort-snapshot.mjs";\n',
  ];
  let inlinePool = poolHelper;
  for (const entry of imports) { assert.equal(inlinePool.split(entry).length, 2); inlinePool = inlinePool.replace(entry, ""); }
  assert.equal(inlinePool.split("export function ").length, 2);
  assert.equal(snapshotHelper.split("export function ").length, 2);
  const prefix = snapshotHelper.replace("export function ", "function ") + "\n" + inlinePool.replace("export function ", "function ") + "\n";
  const before = '  const decoderAbort = createBoundedWasmAbortCapture({role: "decoder", emit: emitAbort});';
  const after = `  const decoderAbort = createLatePoolAbortCapture({getCore: () => core, emit: emitAbort,
    poolGetterFunctionIndex: ${getter.functionIndex}, avMallocFunctionIndex: ${malloc.functionIndex}});`;
  assert.equal(prior.split(before).length, 2);
  const result = prefix + prior.replace(before, after);
  assert.equal(result.slice(prefix.length).replace(after, before), prior,
    "Only failure observer changes; original encoder/session/AVIO/profile/cleanup bytes identical");
  assert.ok(Buffer.byteLength(result) < 16384); assert.doesNotMatch(result, /control_pool_|control_unref|synthetic-oom/);
  return { original, adapter: result, adapterSha256: sha(result), adapterBytes: Buffer.byteLength(result) };
}
