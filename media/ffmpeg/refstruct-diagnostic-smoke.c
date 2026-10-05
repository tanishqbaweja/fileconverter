/* Synthetic allocation unit only, not a converter or a media fixture.
 * Run against the actual compiled private diagnostic libavutil before using
 * its scalar reader to diagnose the browser. No data leaves this build.
 */
#include <assert.h>
#include <stddef.h>
#include <stdio.h>
#include <libavutil/refstruct.h>

int within_refstruct_pool_diagnostic(AVRefStructPool *pool, size_t stats[4]);

static void check(AVRefStructPool *pool, size_t live, size_t cached) {
  size_t stats[4] = {0};
  assert(within_refstruct_pool_diagnostic(pool, stats) == 1);
  assert(stats[0] == 1024 && stats[1] > 1024);
  assert(stats[2] == live && stats[3] == cached);
}

int main(void) {
  AVRefStructPool *pool = av_refstruct_pool_alloc(1024, 0);
  assert(pool);
  check(pool, 0, 0);
  void *first = av_refstruct_pool_get(pool);
  assert(first);
  check(pool, 1, 0);
  void *second = av_refstruct_pool_get(pool);
  assert(second);
  check(pool, 2, 0);
  void *extra_ref = av_refstruct_ref(first);
  check(pool, 2, 0); /* References are not separate checked-out entries. */
  av_refstruct_unref(&extra_ref);
  check(pool, 2, 0);
  av_refstruct_unref(&first);
  check(pool, 1, 1);
  void *reused = av_refstruct_pool_get(pool);
  assert(reused);
  check(pool, 2, 0);
  av_refstruct_unref(&second);
  av_refstruct_unref(&reused);
  check(pool, 0, 2);
  av_refstruct_pool_uninit(&pool);
  assert(pool == NULL);

  pool = av_refstruct_pool_alloc(1024, 0);
  assert(pool);
  void *entries[129] = {0};
  for (unsigned i = 0; i < 129; i++) {
    entries[i] = av_refstruct_pool_get(pool);
    assert(entries[i]);
  }
  check(pool, 129, 0);
  for (unsigned i = 0; i < 129; i++) av_refstruct_unref(&entries[i]);
  size_t capped[4] = {0};
  assert(within_refstruct_pool_diagnostic(pool, capped) == 0);
  av_refstruct_pool_uninit(&pool);
  assert(pool == NULL);
  assert(within_refstruct_pool_diagnostic(NULL, capped) == 0);
  puts("{\"status\":\"passed\",\"scope\":\"synthetic-source-reader-unit-not-conversion\","
       "\"payloadBytes\":1024,\"checkedTransitions\":9,\"multipleReferencesNotMultipleEntries\":true,"
       "\"cacheReuseVerified\":true,\"cap129InactiveLinksUnavailable\":true,\"nullPoolUnavailable\":true}");
  return 0;
}
