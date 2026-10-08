// Reversible observation only, atop the EXACT executed private refstruct policy.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const PRIVATE_REFSTRUCT_SHA256 = "e31af1df1e6e7b60b9112e2fcd22917664bc365d65db6c1d2b7038f5d532e084";
const sha = text => createHash("sha256").update(text).digest("hex");
const declaration = `
/* Diagnostic fixed64-byte request slot; never payloads, ownership or allocation. */
extern volatile uint32_t within_refstruct_abort_words[16];
static void within_refstruct_before_fresh_allocation(AVRefStructPool *pool)
{
    uintptr_t references = atomic_load_explicit(&pool->refcount, memory_order_acquire);
    uint32_t sequence = within_refstruct_abort_words[2] + 1;
    within_refstruct_abort_words[0] = 0;
    within_refstruct_abort_words[1] = 1;
    within_refstruct_abort_words[2] = sequence;
    within_refstruct_abort_words[3] = 1;
    within_refstruct_abort_words[4] = (uint32_t)(uintptr_t)pool;
    within_refstruct_abort_words[5] = (uint32_t)pool->size;
    within_refstruct_abort_words[6] = (uint32_t)REFCOUNT_OFFSET;
    within_refstruct_abort_words[7] = pool->size <= UINT32_MAX - REFCOUNT_OFFSET
                                    ? (uint32_t)(pool->size + REFCOUNT_OFFSET) : 0;
    within_refstruct_abort_words[8] = references >= 1 && references - 1 <= UINT32_MAX
                                    ? (uint32_t)(references - 1) : 0;
    within_refstruct_abort_words[9] = (uint32_t)(uintptr_t)pool->available_entries;
    within_refstruct_abort_words[10] = pool->uninited;
    within_refstruct_abort_words[11] = pool->pool_flags;
    within_refstruct_abort_words[12] = sizeof(size_t);
    within_refstruct_abort_words[13] = references >= 1 && references - 1 <= UINT32_MAX;
    within_refstruct_abort_words[14] = 0;
    within_refstruct_abort_words[15] = 0;
    within_refstruct_abort_words[0] = 0x52504631u;
}
`;
const allocation = `        ret = av_refstruct_alloc_ext(pool->size, pool->entry_flags, pool,
                                     pool->reset_cb ? pool_reset_entry : NULL);`;
export const LATE_REFSTRUCT_EDITS = Object.freeze([
  ["static void pool_free(AVRefStructPool *pool)", declaration + "\nstatic void pool_free(AVRefStructPool *pool)"],
  [allocation, "        within_refstruct_before_fresh_allocation(pool);\n" + allocation +
    "\n        within_refstruct_abort_words[3] = ret ? 2 : 3;"],
].map(row => Object.freeze(row)));
export function instrumentLateRefstruct(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  assert.equal(sha(source), PRIVATE_REFSTRUCT_SHA256, "Exact private policy required; no historical repinning");
  let changed = source;
  for (const [before, after] of LATE_REFSTRUCT_EDITS) {
    assert.equal(changed.split(before).length, 2); changed = changed.replace(before, after);
  }
  assert.equal(reverseLateRefstruct(changed), source);
  return changed;
}
export function reverseLateRefstruct(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  let restored = source;
  for (const [before, after] of LATE_REFSTRUCT_EDITS.toReversed()) {
    assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before);
  }
  assert.equal(sha(restored), PRIVATE_REFSTRUCT_SHA256); return restored;
}
