// Exact compiler-witness fix only. Never reclassify the first failed Wasm build.
import assert from "node:assert/strict";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
export const FIRST_ATTEMPT_SMOKE_SHA256 = "6cf34bde849e6fa800231b5ce1cca40efd4dc9033bf80ceb865a957cbe259120";
const binding = `#ifdef __EMSCRIPTEN__
EM_JS(void, within_assert_allocator_attempt_binding, (uintptr_t address), {
    if (Module["withinAllocatorAttemptAddress"] !== address || Module["withinAllocatorAttemptWords"] !== 16)
        throw new Error("Actual constructor slot binding failed");
});
#endif
`;
const before = `    EM_ASM({
      if (Module["withinAllocatorAttemptAddress"] !== $0 || Module["withinAllocatorAttemptWords"] !== 16)
        throw new Error("Actual constructor slot binding failed");
    }, (uintptr_t)within_allocator_attempt_words);`;
const after = "    within_assert_allocator_attempt_binding((uintptr_t)within_allocator_attempt_words);";
export function reverseAllocationAttemptBindingFix(source) {
  assert.equal(source.split(binding).length, 2); assert.equal(source.split(after).length, 2);
  const original = source.replace(binding, "").replace(after, before);
  assert.equal(sha(original), FIRST_ATTEMPT_SMOKE_SHA256, "Only EM_ASM witness replaced; dispatch/allocator/abort assertions unchanged");
  return original;
}
