import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectRebootInterruption } from "../scripts/lib/reboot-interruption.mjs";

const checkpoint = JSON.parse(await readFile(new URL("../outputs/reports/2026-10-15T22-28-56-383Z-private-mpeg2-threaded-validation-full-native-100ms-native-checkpoint.json", import.meta.url)));
const identities = [checkpoint.identities.root, checkpoint.identities.monitor, ...checkpoint.native.identities];
const boot = "2026-10-16T00:59:19.5000000Z";
test("real interrupted checkpoint retains observed peak without claiming completion", () => {
  const result = inspectRebootInterruption(checkpoint, boot, identities);
  assert.equal(result.partialObservedIncrementalPrivateMiB, 228.56640625);
  assert.equal(result.validConversionSamples, 77122);
  assert.equal(result.unavailableConversionSamples, 0);
  assert.equal(result.completeChromiumMemoryAcceptance, false);
  assert.equal(result.completedValidatedRuns, 0);
  assert.equal(result.exactTerminationTimeAndCause, null);
});
test("missing, earlier, or ambiguous boot and birth data cannot authorize reboot recovery", () => {
  for (const time of [null, "invalid", checkpoint.updatedAt, "2026-10-15T00:00:00Z"])
    assert.throws(() => inspectRebootInterruption(checkpoint, time, identities));
  assert.throws(() => inspectRebootInterruption(checkpoint, boot, []));
  assert.throws(() => inspectRebootInterruption(checkpoint, boot, [{pid: 1, createdAt: boot}]));
});
test("terminal or falsely accepted checkpoints cannot be relabelled as interruptions", () => {
  for (const [key, value] of [["status", "passed"], ["conversionAcceptance", true], ["completeRunCoverageProven", true]]) {
    const changed = structuredClone(checkpoint); changed[key] = value;
    assert.throws(() => inspectRebootInterruption(changed, boot, identities));
  }
});
