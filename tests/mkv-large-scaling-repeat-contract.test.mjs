import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { largeScalingReference, readLargeScalingReference } from "../scripts/lib/mkv-large-scaling-reference.mjs";

test("repeat preparation binds entire real5.35GB input/output and SAME current native to fresh complete source/output video+PCM proof, with no decoder replay", async () => {
  const bytes = await readFile(largeScalingReference.file), first = JSON.parse(bytes);
  const reference = readLargeScalingReference(bytes, first.candidateBuild);
  assert.equal(reference.sourceBytes, 5347972392); assert.equal(reference.outputBytes, 5350648699);
  assert.equal(reference.noValidationReplay, true);
  const source = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  const start = source.indexOf("  if (largeScalingRepeats) {", source.indexOf("async function validateLoopSourceOutput"));
  const end = source.indexOf("  const v = row.validation =", start + 70);
  const branch = source.slice(start, end);
  assert.match(branch, /await hashFile\(output\)/);
  assert.match(branch, /Scaling repeat changed EVERY-byte validated current-native output/);
  assert.match(branch, /fullDecode = false/); assert.match(branch, /fullDecodedContentInheritedThroughWholeOutputIdentity = true/);
  assert.doesNotMatch(branch, /decodeCompleteScalingContent\(|decodedPcm\(|probeMkvVideoPackets\(/);
  assert.match(source, /for \(const count of largeScalingRepeats \? \[3, 1\] : \[1\]\)/);
  assert.match(source, /const repeatJobs = protectedRepeats \|\| largeScalingRepeats/);
  assert.match(source, /scalingView = largeScaling && !largeScalingRepeats/);
  assert.match(source, /every-100ms-native-row-in-finite-repeat-archive-no-thinning/);
  assert.match(source, /row\.cleanupStable\.privateBytes - result\.loaded\.privateBytes/);
  assert.match(source, /row\.conversionWindow, result\.blank\.privateBytes/);
});
