import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { largeScalingReference, readLargeScalingReference } from "../scripts/lib/mkv-large-scaling-reference.mjs";
import { near10GbContentReference, readNear10GbContentReference } from "../scripts/lib/mkv-near10gb-content-reference.mjs";

test("repeat preparation binds entire real5.35GB input/output and SAME current native to fresh complete source/output video+PCM proof, with no decoder replay", async () => {
  const bytes = await readFile(largeScalingReference.file), first = JSON.parse(bytes);
  const reference = readLargeScalingReference(bytes, first.candidateBuild);
  assert.equal(reference.sourceBytes, 5347972392); assert.equal(reference.outputBytes, 5350648699);
  assert.equal(reference.noValidationReplay, true);
  const source = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  const start = source.indexOf("  if (largeScalingRepeats || headerProductionDirectScaling) {", source.indexOf("async function validateLoopSourceOutput"));
  assert.ok(start > 0);
  const end = source.indexOf("\n  const v = row.validation =", start);
  assert.ok(end > start);
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

test("production direct scaling requires exact inherited complete content, never the small cancellation sequence", async () => {
  const bytes = await readFile(near10GbContentReference.file), first = JSON.parse(bytes);
  const proof = readNear10GbContentReference(bytes, first.candidateBuild);
  assert.equal(proof.sourceBytes, 9507509956); assert.equal(proof.outputBytes, 9512261399);
  assert.equal(proof.decodedFrames, 460800); assert.equal(proof.noValidationReplay, true);
  assert.throws(() => readNear10GbContentReference(Buffer.from("wrong report"), first.candidateBuild));
  assert.throws(() => readNear10GbContentReference(bytes, { ...first.candidateBuild, runId: "not-the-current-core" }));
  const source = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  assert.match(source, /if \(headerProductionDirectScaling\) await arm\("production-direct", created.file/);
  assert.match(source, /created.bytes, directContent.sourceBytes/);
  assert.match(source, /report.fixture.sha256, directContent.sourceSha256/);
  assert.match(source, /const selected = headerProductionDirectSmall && cancel \? baseline.cancellationFixture.file/);
  assert.match(source, /else if \(headerProductionDirectSmall\) \{\s*await open\(\); await job\(false, true\);/);
  assert.match(source, /assert\.ok\(!largeRun \|\| \(!fault && !cancel\)/);
});
