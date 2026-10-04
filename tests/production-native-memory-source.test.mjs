import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production profiler requires parallel native peaks, a stable early baseline and owned cleanup", async () => {
  const source = await readFile(new URL("../scripts/memory-profile.mjs", import.meta.url), "utf8");
  assert.ok(source.indexOf("await startParallelMemoryObserver(") < source.indexOf("blankStable = await waitForStableMemory("));
  assert.match(source, /blankStable\.stable !== true/);
  assert.match(source, /loadedStable\.stable !== true/);
  assert.match(source, /const stable = stableWindow\(local\)/);
  assert.match(source, /combinedTreePeak\(cimPeakPrivateBytes, nativePeaks\.peak\.privateBytes, blankPrivateBytes\)/);
  assert.match(source, /await nativeObserver\.through\(conversionStoppedAt\)/);
  assert.match(source, /sourceHashes,/);
  assert.match(source, /nativeMemory: nativeObserver\.report\(\)/);
  assert.match(source, /return \(await sampleChromiumTree\(rootPid\)\)\.processes/);
  assert.match(source, /stress-native-100ms/);
  assert.match(source, /-native-peaks\.csv/);
  assert.ok(source.indexOf('await nativeObserver.stop();') < source.indexOf('const checks = {'));
  const final = source.split("} finally {")[1];
  assert.ok(final.indexOf("await nativeObserver?.stop()") < final.indexOf("await removeWithRetries(profileRoot)"));
  assert.match(final, /assertInside\(workRoot, nativeTemporary\)/);
});
