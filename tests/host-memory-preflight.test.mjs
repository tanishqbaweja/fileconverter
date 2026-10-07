import assert from "node:assert/strict";
import test from "node:test";
import { checkStressHostMemory, STRESS_HOST_MINIMUM_BYTES } from "../scripts/lib/host-memory-preflight.mjs";
test("host stress safety requires actual physical AND commit availability; never lower primary250MiB", () => {
  const enough = STRESS_HOST_MINIMUM_BYTES / 1024;
  assert.equal(checkStressHostMemory({ freePhysicalKiB: enough, freeVirtualKiB: enough }).safeToStart, true);
  for (const value of [{ freePhysicalKiB: enough - 1, freeVirtualKiB: enough }, { freePhysicalKiB: enough, freeVirtualKiB: enough - 1 }])
    assert.equal(checkStressHostMemory(value).safeToStart, false);
  assert.equal(checkStressHostMemory({ freePhysicalKiB: enough, freeVirtualKiB: enough }).primaryConversionLimitMiB, 250);
  for (const value of [null, {}, { freePhysicalKiB: null, freeVirtualKiB: enough }, { freePhysicalKiB: -1, freeVirtualKiB: enough }])
    assert.throws(() => checkStressHostMemory(value), /unavailable/);
});
