/* Synthetic real-libavutil allocation lifecycle only. Never converts media. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <emscripten.h>
#include <libavutil/refstruct.h>

extern volatile uint32_t within_refstruct_abort_words[16];

static void check(AVRefStructPool *pool, uint32_t live, uint32_t sequence)
{
  assert(within_refstruct_abort_words[0] == 0x52504631u);
  assert(within_refstruct_abort_words[1] == 1);
  assert(within_refstruct_abort_words[2] == sequence);
  assert(within_refstruct_abort_words[3] == 2);
  assert(within_refstruct_abort_words[4] == (uint32_t)(uintptr_t)pool);
  assert(within_refstruct_abort_words[5] == 1024);
  assert(within_refstruct_abort_words[6] == 16);
  assert(within_refstruct_abort_words[7] == 1040);
  assert(within_refstruct_abort_words[8] == live);
  assert(within_refstruct_abort_words[9] == 0);
  assert(within_refstruct_abort_words[10] == 0);
  assert(within_refstruct_abort_words[12] == 4);
  assert(within_refstruct_abort_words[13] == 1);
}

int main(void)
{
  assert(EM_ASM_INT({ return Module["withinRefstructAbortSnapshotAddress"] === $0 &&
                            Module["withinRefstructAbortSnapshotWords"] === 16; },
                   (uintptr_t)within_refstruct_abort_words));
  AVRefStructPool *pool = av_refstruct_pool_alloc(1024, 0);
  assert(pool);
  void *first = av_refstruct_pool_get(pool);
  assert(first); check(pool, 0, 1);
  void *second = av_refstruct_pool_get(pool);
  assert(second); check(pool, 1, 2);
  void *extra = av_refstruct_ref(first);
  assert(extra); av_refstruct_unref(&extra);
  av_refstruct_unref(&first);
  void *reused = av_refstruct_pool_get(pool);
  assert(reused); check(pool, 1, 2); /* Reuse does NOT make a fresh request. */
  av_refstruct_unref(&second); av_refstruct_unref(&reused);
  av_refstruct_pool_uninit(&pool); assert(pool == NULL);
  /* Prove this remains useful AFTER the older first48-event observer stopped. */
  for (uint32_t i = 0; i < 80; i++) {
    pool = av_refstruct_pool_alloc(1024, 0); assert(pool);
    void *entry = av_refstruct_pool_get(pool); assert(entry);
    check(pool, 0, i + 3);
    av_refstruct_unref(&entry); av_refstruct_pool_uninit(&pool);
  }
  puts("{\"status\":\"passed\",\"scope\":\"synthetic-real-wasm32-libavutil-request-slot-not-conversion\","
       "\"fixedSlotBytes\":64,\"freshRequestsObserved\":82,\"afterFirst48Verified\":true,"
       "\"cacheReuseDoesNotCreateFreshRequest\":true,\"initializationAddressBound\":true,"
       "\"actualRefcountHeaderBytes\":16,\"conversionsPerformed\":0}");
  return 0;
}
