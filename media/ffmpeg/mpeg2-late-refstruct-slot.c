/* One fixed64-byte slot, bound to Module once at initialization. No media or
 * allocator calls, payload inspection, dynamic diagnostic allocations or logs.
 */
#include <stdint.h>
#include <emscripten.h>

volatile uint32_t within_refstruct_abort_words[16];

EM_JS(void, within_bind_refstruct_abort_slot, (uintptr_t address), {
  Module["withinRefstructAbortSnapshotAddress"] = address;
  Module["withinRefstructAbortSnapshotWords"] = 16;
});

__attribute__((constructor))
static void within_refstruct_abort_slot_init(void)
{
  within_bind_refstruct_abort_slot((uintptr_t)within_refstruct_abort_words);
}
