// Private bounded-placement candidate atop the actual executed refstruct code.
// No codec math, object size, reference count, idle admission or heap-limit edit.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile,realpath,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { reverseHevcAuxiliaryPolicy } from "./mpeg2-hevc-auxiliary-policy.mjs";
const sha=source=>createHash("sha256").update(source).digest("hex");
export const MVF_PARENT_REFSTRUCT_SHA256="774749111621629ff38291ea1d197bf566b628a88eb4ed3fb3ef484e8599da5e";
function patch(source,edits) {
  let generated=source;for(const [before,after]of edits){assert.equal(generated.split(before).length,2,before.slice(0,150));generated=generated.replace(before,after);}
  let reversed=generated;for(const [before,after]of edits.toReversed()){assert.equal(reversed.split(after).length,2);reversed=reversed.replace(after,before);}
  assert.equal(reversed,source);return {generated,generatedSha256:sha(generated),parentSha256:sha(source),edits,publicAcceptance:false};
}
const helpers=`/* Six raw slots, <=8MiB, reserved before decoder frames fragment the heap.
 * Raw unused capacity remains owned by this pool and is NOT an idle object.
 * The normal mutex protects slot admission/release; all live aliases survive. */
static int within_mvf_arena_init(AVRefStructPool *pool)
{
    const size_t maximum_bytes = 8u * 1024u * 1024u;
    size_t stride;
    if (!(pool->pool_flags & WITHIN_HEVC_MVF_ARENA) ||
        sizeof(size_t) != 4 || REFCOUNT_OFFSET != 16)
        return 0;
    if (pool->size > maximum_bytes / 6 - REFCOUNT_OFFSET - 15)
        return 0; /* Larger profiles retain the original allocation path. */
    stride = FFALIGN(pool->size + REFCOUNT_OFFSET, 16);
    if (!stride || stride > maximum_bytes / 6)
        return 0;
    pool->within_mvf_arena = av_malloc(stride * 6);
    if (!pool->within_mvf_arena)
        return AVERROR(ENOMEM);
    pool->within_mvf_stride = stride;
    return 0;
}

static void within_mvf_release_raw(AVRefStructPool *pool, RefCount *ref)
{
    uintptr_t address = (uintptr_t)ref;
    uintptr_t base = (uintptr_t)pool->within_mvf_arena;
    if (pool->within_mvf_arena && address >= base &&
        address - base < pool->within_mvf_stride * 6) {
        unsigned index;
        av_assert0((address - base) % pool->within_mvf_stride == 0);
        index = (unsigned)((address - base) / pool->within_mvf_stride);
        ff_mutex_lock(&pool->mutex);
        av_assert0(pool->within_mvf_used & (1u << index));
        pool->within_mvf_used &= ~(1u << index);
        ff_mutex_unlock(&pool->mutex);
        return;
    }
    av_free(ref); /* Ordinary and overflow allocations still free upstream. */
}

`;
const allocator=`static void *within_mvf_alloc_entry(AVRefStructPool *pool)
{
    RefCount *ref = NULL;
    void *object;
    if (pool->within_mvf_arena) {
        ff_mutex_lock(&pool->mutex);
        for (unsigned index = 0; index < 6; index++) {
            if (!(pool->within_mvf_used & (1u << index))) {
                pool->within_mvf_used |= 1u << index;
                ref = (RefCount *)(pool->within_mvf_arena +
                                  index * pool->within_mvf_stride);
                break;
            }
        }
        ff_mutex_unlock(&pool->mutex);
    }
    if (!ref)
        return av_refstruct_alloc_ext(pool->size, pool->entry_flags, pool,
                                     pool->reset_cb ? pool_reset_entry : NULL);
    refcount_init(ref, (AVRefStructOpaque){ .nc = pool },
                  pool->reset_cb ? pool_reset_entry : NULL);
    object = get_userdata(ref);
    if (!(pool->entry_flags & AV_REFSTRUCT_FLAG_NO_ZEROING))
        memset(object, 0, pool->size);
    return object;
}

`;
const refstructEdits=[
    ["#define WITHIN_HEVC_POOL_SINGLE_IDLE (1u << 29)","#define WITHIN_HEVC_POOL_SINGLE_IDLE (1u << 29)\n#define WITHIN_HEVC_MVF_ARENA (1u << 28)"],
    ["    AVMutex mutex;\n};","    AVMutex mutex;\n    uint8_t *within_mvf_arena;\n    size_t within_mvf_stride;\n    unsigned within_mvf_used;\n};"],
    ["static void pool_free(AVRefStructPool *pool)",helpers+"static void pool_free(AVRefStructPool *pool)"],
    ["        pool->free_cb(pool->opaque);\n    av_free(get_refcount(pool));","        pool->free_cb(pool->opaque);\n    av_assert0(!pool->within_mvf_used);\n    av_free(pool->within_mvf_arena);\n    av_free(get_refcount(pool));"],
    ["        pool->free_entry_cb(pool->opaque, get_userdata(ref));\n    av_free(ref);","        pool->free_entry_cb(pool->opaque, get_userdata(ref));\n    within_mvf_release_raw(pool, ref);"],
    ["static int refstruct_pool_get_ext(void *datap, AVRefStructPool *pool)",allocator+"static int refstruct_pool_get_ext(void *datap, AVRefStructPool *pool)"],
    ["        ret = av_refstruct_alloc_ext(pool->size, pool->entry_flags, pool,\n                                     pool->reset_cb ? pool_reset_entry : NULL);","        ret = within_mvf_alloc_entry(pool);"],
    ["                av_free(ref);\n                return err;","                within_mvf_release_raw(pool, ref);\n                return err;"],
    ["    return pool;\n}","    err = within_mvf_arena_init(pool);\n    if (err < 0) {\n        /* Allocation failure must not consume the caller's opaque/free_cb. */\n        ff_mutex_destroy(&pool->mutex);\n        av_free(get_refcount(pool));\n        return NULL;\n    }\n    return pool;\n}"],
  ];
export function makeMvfArenaRefstruct(source) {
  assert.equal(sha(source),MVF_PARENT_REFSTRUCT_SHA256);assert.equal(Buffer.byteLength(source),13264);
  return {...patch(source,refstructEdits),maximumRawSlots:6,maximumReservedBytes:8388608,logicalSizesChanged:false,
    referenceSemanticsChanged:false,upstreamOverflowSupported:true,idleAdmissionChanged:false,codecSettingsChanged:false,heapLimitsChanged:false};
}
const hevcEdits=[
    ['#include "mpeg2-hevc-auxiliary-policy.h"\n','#include "mpeg2-hevc-auxiliary-policy.h"\n#define WITHIN_HEVC_MVF_ARENA (1u << 28)\n'],
    ["l->tab_mvf_pool = av_refstruct_pool_alloc(min_pu_size * sizeof(MvField), pool_flags);",
      "l->tab_mvf_pool = av_refstruct_pool_alloc(min_pu_size * sizeof(MvField),\n        pool_flags | ((pool_flags & WITHIN_HEVC_AUXILIARY_SINGLE_IDLE) ? WITHIN_HEVC_MVF_ARENA : 0));"],
  ];
function reverse(source,edits) {
  let restored=source;
  for(const [before,after] of edits.toReversed()) {
    assert.equal(restored.split(after).length,2);restored=restored.replace(after,before);
  }
  return restored;
}
export function reverseMvfArenaRefstruct(source) {
  const restored=reverse(source,refstructEdits);
  assert.equal(sha(restored),MVF_PARENT_REFSTRUCT_SHA256);
  assert.equal(makeMvfArenaRefstruct(restored).generated,source);return restored;
}
export function makeMvfArenaHevc(source) {
  reverseHevcAuxiliaryPolicy(source); // Exact pinned upstream reversal gate.
  return patch(source,hevcEdits);
}
export function reverseMvfArenaHevc(source) {
  const restored=reverse(source,hevcEdits);
  reverseHevcAuxiliaryPolicy(restored);
  assert.equal(makeMvfArenaHevc(restored).generated,source);return restored;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length,4);const mode=process.argv[2];assert.ok(["--refstruct","--hevc"].includes(mode));
  const root=path.resolve(import.meta.dirname,"../.."),target=path.resolve(process.argv[3]);
  const expected=path.join(root,"work/mpeg2-split-pipeline-build/ffmpeg",mode==="--refstruct"?"libavutil/refstruct.c":"libavcodec/hevc/hevcdec.c");
  assert.equal(target,expected);assert.equal(await realpath(target),target);
  const source=await readFile(target,"utf8"),recipe=(mode==="--refstruct"?makeMvfArenaRefstruct:makeMvfArenaHevc)(source);
  await writeFile(target,recipe.generated);console.log(JSON.stringify({mode,parentSha256:recipe.parentSha256,generatedSha256:recipe.generatedSha256}));
}
