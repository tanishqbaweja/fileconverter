// A reversible observer-only derivative of the EXACT measured 4 Mbps adapter.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { ALLOCATION_ATTEMPT_DECODER_SHA256 } from "./allocation-attempt-abort-capture.mjs";
export function makeCompositeAllocationAbortAdapter({ previousAdapter, attemptHelper, compositeHelper, controlProofBytes }) {
  assert.equal(sha(previousAdapter), "81ea465cb26a839fed9ae4b25223e42a19d0486023cd443ff34126ed3a3eb2a7");
  assert.equal(Buffer.byteLength(previousAdapter), 20047);
  assert.equal(sha(controlProofBytes), "6bcfd734fdb7ed20b1fd260138424d550abbad772ea8efdd2e8db8369a5f7d64");
  const control = JSON.parse(controlProofBytes);
  assert.equal(control.status, "passed-synthetic-abort-control");
  assert.equal(control.exportOnlyControl.originalSha256, ALLOCATION_ATTEMPT_DECODER_SHA256);
  assert.equal(control.result.terminal.emitted.allocationAttemptUnavailable, null);
  assert.equal(control.result.terminal.emitted.allocatorFreeBlocksUnavailable, null);
  assert.equal(sha(attemptHelper), control.sourcePins["scripts/lib/allocation-attempt-abort-capture.mjs"]);
  function inline(source, imports) {
    let value = source;
    for (const entry of imports) { assert.equal(value.split(entry).length, 2, entry); value = value.replace(entry, ""); }
    assert.doesNotMatch(value, /^import /m);
    return value.replaceAll("export function ", "function ").replaceAll("export const ", "const ");
  }
  const attempt = inline(attemptHelper, [
    'import { createBoundedWasmAbortCapture } from "./bounded-wasm-abort-capture.mjs";\n',
    'import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";\n',
  ]);
  const composite = inline(compositeHelper, [
    'import { createBoundedWasmAbortCapture } from "./bounded-wasm-abort-capture.mjs";\n',
    'import { readAllocationAttemptSnapshot, ALLOCATION_ATTEMPT_DECODER_SHA256, ALLOCATION_ATTEMPT_ROOT, ALLOCATION_ATTEMPT_SLOT } from "./allocation-attempt-abort-capture.mjs";\n',
    'import { readLateRefstructAbortSnapshot } from "./late-refstruct-abort-snapshot.mjs";\n',
    'import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";\n',
  ]);
  const prefix = attempt + "\n" + composite + "\n";
  const before = `createLatePoolAllocatorAbortCapture({getCore: () => core, emit: emitAbort,
    poolGetterFunctionIndex: 4379, avMallocFunctionIndex: 4311, actualAllocatorRoot: 1786520});`;
  const after = `createCompositeAllocationAbortCapture({getCore: () => core, emit: emitAbort,
    qualifiedBinarySha256: "${ALLOCATION_ATTEMPT_DECODER_SHA256}"});`;
  assert.equal(previousAdapter.split(before).length, 2);
  const adapter = prefix + previousAdapter.replace(before, after);
  assert.equal(adapter.slice(prefix.length).replace(after, before), previousAdapter,
    "Original encoder/session/AVIO/profile/bitrate/native-audit/fatal-chain bytes unchanged");
  assert.ok(Buffer.byteLength(adapter) < 32768);
  assert.doesNotMatch(adapter, /control_pool_|control_buffer_|synthetic-oom/);
  return { adapter, adapterBytes: Buffer.byteLength(adapter), adapterSha256: sha(adapter),
    previousAdapterSha256: sha(previousAdapter), prefix, edits: [[before, after]],
    attemptHelperSha256: sha(attemptHelper), compositeHelperSha256: sha(compositeHelper),
    qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256, publicAcceptance: false, fullOriginalAcceptance: false };
}
