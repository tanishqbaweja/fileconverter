// Private encoder derivative only. Never edit historical build inputs in place.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
export const UPSTREAM_BUFFER_SHA256 = "810049e1ac054af6870a5c58c02903f29a210732ecfe724b79ece8c8a18ad2ac";
export const EXECUTED_ENCODER_GET_BUFFER_SHA256 = "62a73fe537318e4706f25904022d071e8f8ef9535b5334bf5c7b650e572c0478";
const marker = "within_mpeg2_single_idle_plane_free";
export const BUFFER_EDITS = Object.freeze([
  ['AVBufferPool *av_buffer_pool_init2(size_t size, void *opaque,',
    `/* Private marker selects only these pools, without changing public structs. */
static void ${marker}(void *opaque)
{
    (void)opaque;
}

AVBufferPool *ff_within_mpeg2_single_idle_plane_pool(size_t size)
{
    return av_buffer_pool_init2(size, NULL, NULL, ${marker});
}

AVBufferPool *av_buffer_pool_init2(size_t size, void *opaque,`],
  ['    ff_mutex_lock(&pool->mutex);\n    buf->next = pool->pool;\n    pool->pool = buf;\n    ff_mutex_unlock(&pool->mutex);',
    `    ff_mutex_lock(&pool->mutex);
    if (pool->pool_free == ${marker} && pool->pool) {
        /* Callback runs only on final buffer unref; never discard live refs. */
        ff_mutex_unlock(&pool->mutex);
        buf->free(buf->opaque, buf->data);
        av_free(buf);
    } else {
        buf->next = pool->pool;
        pool->pool = buf;
        ff_mutex_unlock(&pool->mutex);
    }`],
  ['    if (ret)\n        atomic_fetch_add_explicit(&pool->refcount, 1, memory_order_relaxed);\n\n    return ret;',
    `    if (ret) {
        atomic_fetch_add_explicit(&pool->refcount, 1, memory_order_relaxed);
        /* Match old allocz on EVERY acquisition, including stride padding. */
        if (pool->pool_free == ${marker})
            memset(ret->data, 0, ret->size);
    }

    return ret;`],
].map(row => Object.freeze(row)));
export const GET_BUFFER_EDITS = Object.freeze([
  ['#include "libavutil/refstruct.h"\n', '#include "libavutil/refstruct.h"\n#include "mpeg2-encoder-plane-policy.h"\n\nAVBufferPool *ff_within_mpeg2_single_idle_plane_pool(size_t size);\n'],
  ['    size_t buffer_size[4];\n', '    size_t buffer_size[4];\n    int encoder_single_idle;\n'],
  ['    if (pool && pool->format == frame->format) {',
    '    if (pool && pool->format == frame->format &&\n        pool->encoder_single_idle == within_mpeg2_plane_single_idle(\n            avctx->codec_id, avctx->thread_count, av_codec_is_encoder(avctx->codec),\n            CONFIG_MEMORY_POISONING)) {'],
  ['    if (!pool)\n        return AVERROR(ENOMEM);\n\n    switch (avctx->codec_type)',
    '    if (!pool)\n        return AVERROR(ENOMEM);\n    pool->encoder_single_idle = within_mpeg2_plane_single_idle(\n        avctx->codec_id, avctx->thread_count, av_codec_is_encoder(avctx->codec),\n        CONFIG_MEMORY_POISONING);\n\n    switch (avctx->codec_type)'],
  ['                pool->pools[i] = av_buffer_pool_init(pool->buffer_size[i],',
    '                pool->pools[i] = pool->encoder_single_idle\n                    ? ff_within_mpeg2_single_idle_plane_pool(pool->buffer_size[i])\n                    : av_buffer_pool_init(pool->buffer_size[i],'],
  ['        // Private MPEG2 core: free inactive encoder planes on last unref.\n        // Preserve upstream layout, padding, zeroing and all live references.\n        // Decoder pools and codec algorithms remain unchanged.\n        pic->buf[i] = av_codec_is_encoder(s->codec)',
    '        // Private single-thread MPEG2: at most one final-unreferenced plane\n        // per pool; pool_get zeroes EVERY acquisition including padding.\n        // Other encoder/decoder allocation policies remain byte-exact.\n        pic->buf[i] = pool->encoder_single_idle\n            ? av_buffer_pool_get(pool->pools[i])\n            : av_codec_is_encoder(s->codec)'],
].map(row => Object.freeze(row)));
function transform(source, digest, edits, reverse) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  if (!reverse) assert.equal(sha(source), digest, "Refuse a changed or wrong historical input");
  let changed = source;
  for (const [before, after] of reverse ? edits.toReversed() : edits) {
    const from = reverse ? after : before, to = reverse ? before : after;
    assert.equal(changed.split(from).length, 2, "Require one exact replacement");
    changed = changed.replace(from, to);
  }
  if (reverse) assert.equal(sha(changed), digest);
  return changed;
}
export function reverseSingleIdlePlaneBuffer(source) { return transform(source, UPSTREAM_BUFFER_SHA256, BUFFER_EDITS, true); }
export function reverseSingleIdlePlaneGetBuffer(source) { return transform(source, EXECUTED_ENCODER_GET_BUFFER_SHA256, GET_BUFFER_EDITS, true); }
export function applySingleIdlePlaneBuffer(source) {
  const changed = transform(source, UPSTREAM_BUFFER_SHA256, BUFFER_EDITS, false);
  assert.equal(reverseSingleIdlePlaneBuffer(changed), source); return changed;
}
export function applySingleIdlePlaneGetBuffer(source) {
  const changed = transform(source, EXECUTED_ENCODER_GET_BUFFER_SHA256, GET_BUFFER_EDITS, false);
  assert.equal(reverseSingleIdlePlaneGetBuffer(changed), source); return changed;
}
