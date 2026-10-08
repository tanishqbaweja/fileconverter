// Production adapter: only the fatal decoder observer changes, never the core.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeLateAbortAdapter } from "./mpeg2-late-abort-adapter.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function makeLateAllocatorAbortAdapter({ allocatorHelper, freeHeaderHelper, allocatorControlProof, layoutProof, ...args }) {
  const previous = makeLateAbortAdapter(args);
  assert.equal(allocatorControlProof.status, "passed-synthetic-abort-control");
  assert.equal(allocatorControlProof.result.terminal.emitted.allocatorFreeBlocksUnavailable, null);
  assert.equal(allocatorControlProof.result.terminal.emitted.allocatorFreeBlocks.complete, true);
  assert.equal(allocatorControlProof.result.terminal.emitted.actualAllocatorRoot, 1786520);
  assert.equal(allocatorControlProof.exportOnlyControl.originalSha256, args.controlProof.exportOnlyControl.originalSha256);
  assert.equal(layoutProof.allocatorRootAddress, allocatorControlProof.allocatorLayoutProof.root);
  assert.equal(layoutProof.binary.sha256, allocatorControlProof.exportOnlyControl.originalSha256);
  assert.equal(sha(allocatorHelper), allocatorControlProof.sourcePins["scripts/lib/late-pool-allocator-abort-capture.mjs"]);
  assert.equal(sha(freeHeaderHelper), allocatorControlProof.sourcePins["scripts/lib/dlmalloc-free-header-inspection.mjs"]);
  assert.equal(sha(args.poolHelper), allocatorControlProof.sourcePins["scripts/lib/late-pool-abort-capture.mjs"]);
  let inline = allocatorHelper;
  for (const entry of [
    'import { createLatePoolAbortCapture } from "./late-pool-abort-capture.mjs";\n',
    'import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";\n',
  ]) { assert.equal(inline.split(entry).length, 2); inline = inline.replace(entry, ""); }
  assert.equal(inline.split("export function ").length, 2);
  assert.equal(freeHeaderHelper.split("export function ").length, 2);
  const prefix = freeHeaderHelper.replaceAll("export const ", "const ").replace("export function ", "function ") +
    "\n" + inline.replace("export function ", "function ") + "\n";
  const before = `createLatePoolAbortCapture({getCore: () => core, emit: emitAbort,
    poolGetterFunctionIndex: 4379, avMallocFunctionIndex: 4311});`;
  const after = `createLatePoolAllocatorAbortCapture({getCore: () => core, emit: emitAbort,
    poolGetterFunctionIndex: 4379, avMallocFunctionIndex: 4311, actualAllocatorRoot: 1786520});`;
  assert.equal(previous.adapter.split(before).length, 2);
  const adapter = prefix + previous.adapter.replace(before, after);
  assert.equal(adapter.slice(prefix.length).replace(after, before), previous.adapter);
  assert.ok(Buffer.byteLength(adapter) < 32768);
  assert.doesNotMatch(adapter, /control_pool_|control_unref|synthetic-oom/);
  return { original: previous.original, adapter, adapterBytes: Buffer.byteLength(adapter), adapterSha256: sha(adapter) };
}
