import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("parallel native gate keeps the early CIM baseline and cannot replace a higher observed peak with a lower sampler result", async () => {
  const source = await readFile(new URL("../scripts/h264-private-memory.mjs", import.meta.url), "utf8");
  assert.match(source, /WITHIN_H264_NATIVE_MEMORY/);
  assert.match(source, /candidateName, "h264-uninstrumented-candidate-output"/);
  assert.ok(source.indexOf("await startChromiumMemoryMonitor(rootPid, temporary)") < source.indexOf('blankBaseline = await stable("blank-baseline")'));
  assert.match(source, /tree = await sampleChromiumTree\(rootPid\)/);
  assert.match(source, /combinedTreePeak\(cimPeakPrivateBytes, nativePeaks.peak.privateBytes, blankBaseline.privateBytes\)/);
  assert.match(source, /no CIM-only acceptance fallback/);
  assert.match(source, /Native coverage flush deadline exceeded/);
  assert.match(source, /while \(nativeLive\) \{ await drainNative\(\); await delay\(500\); \}/);
  assert.ok(source.indexOf("await nativeMonitor?.close()") < source.indexOf("await rm(work"));
  assert.match(source, /-native-100ms/);
  assert.match(source, /-native.csv/);
  assert.match(source, /points="\$\{nativePoints\}"/);
  assert.match(source, /summary.incrementalPrivateMiB <= 250/);
});
