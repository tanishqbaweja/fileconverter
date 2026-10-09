// Exact additive bounded-cache policy atop the executed late-slot source.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { instrumentLateRefstruct } from "./mpeg2-late-refstruct-source.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const UPSTREAM_REFSTRUCT_SHA256 = "d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f";
export const EXECUTED_LATE_REFSTRUCT_SHA256 = "c2a288ddbd4c814ab3d63cc14798a7de76690bc0fc11775fc7c62dd8247f72f6";
export function makeExecutedLateRefstructFromUpstream(source) {
  assert.equal(sha(source), UPSTREAM_REFSTRUCT_SHA256);
  const edits = [
    ['#include "thread.h"\n', '#include "thread.h"\n\n/* Private pinned-build bit; used only by single-thread MPEG2 encoders. */\n#define WITHIN_MPEG2_POOL_UNCACHED (1u << 30)\n'],
    ['if (!pool->uninited) {', 'if (!pool->uninited && !(pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED)) {'],
  ];
  for (const [before, after] of edits) { assert.equal(source.split(before).length, 2); source = source.replace(before, after); }
  return instrumentLateRefstruct(source); // Existing exact e31… private hash gate.
}
export const SINGLE_IDLE_EDITS = Object.freeze([
  ['#define WITHIN_MPEG2_POOL_UNCACHED (1u << 30)',
    '#define WITHIN_MPEG2_POOL_UNCACHED (1u << 30)\n#define WITHIN_HEVC_POOL_SINGLE_IDLE (1u << 29)'],
  ['if (!pool->uninited && !(pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED)) {',
    'if (!pool->uninited && !(pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED) &&\n' +
    '        (!(pool->pool_flags & WITHIN_HEVC_POOL_SINGLE_IDLE) || !pool->available_entries)) {'],
].map(row => Object.freeze(row)));
export function applySingleIdleRefstruct(source, expectedLateSha256 = EXECUTED_LATE_REFSTRUCT_SHA256) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  assert.equal(expectedLateSha256, EXECUTED_LATE_REFSTRUCT_SHA256); assert.equal(sha(source), expectedLateSha256);
  let changed = source;
  for (const [before, after] of SINGLE_IDLE_EDITS) { assert.equal(changed.split(before).length, 2); changed = changed.replace(before, after); }
  assert.equal(reverseSingleIdleRefstruct(changed, expectedLateSha256), source); return changed;
}
export function reverseSingleIdleRefstruct(source, expectedLateSha256 = EXECUTED_LATE_REFSTRUCT_SHA256) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  let restored = source;
  for (const [before, after] of SINGLE_IDLE_EDITS.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(expectedLateSha256, EXECUTED_LATE_REFSTRUCT_SHA256);
  assert.equal(sha(restored), expectedLateSha256); return restored;
}
