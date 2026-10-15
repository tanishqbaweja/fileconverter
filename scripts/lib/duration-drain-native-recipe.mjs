import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makePacketDrainNativeQualifier } from "./packet-drain-native-recipe.mjs";
export function makeDurationDrainNativeQualifier(source, root) {
  const parent = makePacketDrainNativeQualifier(source, root).generated;
  const uri = file => pathToFileURL(path.join(root, file)).href;
  const checks = `const boundary = build.manifest.packetDurationBoundary, duration = boundary.actualWasmUnit;
assert.equal(sha(boundary.exactSource), boundary.sha256); assert.deepEqual(JSON.parse(boundary.exactSource), duration);
assert.equal(duration.status, "passed"); assert.equal(duration.scope, "actual-wasm32-avutil-cfr-boundaries-not-conversion");
assert.equal(duration.iterations, 126000); assert.equal(duration.sequences, 21); assert.equal(duration.invalidCases, 15);
assert.deepEqual(duration.lastTwoDurations, [666,667]); assert.equal(duration.regressionTotalTicks, 64000);
assert.equal(duration.sourceOffsetLastDts, 64661); assert.equal(duration.independentIntegerOracle, true);
assert.equal(duration.packetBytesUnchanged, true); assert.equal(duration.ptsDtsUnchanged, true);
assert.equal(duration.allocationsAdded, 0); assert.equal(duration.conversionsPerformed, 0);
assert.equal(boundary.parentDrainKernelSha256, sha(drain.parent)); assert.equal(boundary.originalKernelSha256, sha(drain.originalKernel));
assert.equal(boundary.durationBoundaryCorrection, true);
for (const field of ["ptsDtsRewritten", "encoderPacketWireChanged", "codecSettingsChanged", "heapLimitsChanged", "liveReferencesChanged",
  "browserFidelityVerified", "fullOriginalCompleted", "memoryAcceptance", "speedGainProven", "publicAcceptance"])
  assert.equal(boundary[field], false);
`;
  const recipe = exactPatch(parent, [
    ["mpeg2-packet-drain-build-${runId}", "mpeg2-duration-drain-build-${runId}"],
    ["mpeg2-packet-drain-build-branch-2026-10-15.json", "mpeg2-duration-drain-build-branch-2026-10-15.json"],
    ["evidence/mpeg2-packet-interleave-build-38671160915.json", "evidence/mpeg2-packet-drain-build-38673138419.json"],
    [uri("media/ffmpeg/mpeg2-packet-drain-builder-recipe.mjs"), uri("media/ffmpeg/mpeg2-duration-drain-builder-recipe.mjs")],
    ["{ PACKET_DRAIN_EXTRA_FILES }", "{ DURATION_DRAIN_FILES }"], ["...PACKET_DRAIN_EXTRA_FILES", "...DURATION_DRAIN_FILES"],
    ["expectedFiles.length, 116", "expectedFiles.length, 126"],
    [String.raw`|tests\/mpeg2-`, String.raw`|scripts\/(?:prepare|collect)-duration-drain-build(?:-branch)?\.mjs|tests\/mpeg2-`],
    ["realloc-attempt|ebml-reuse|mvf-arena|packet-interleave|packet-drain", "realloc-attempt|ebml-reuse|mvf-arena|packet-interleave|packet-drain|duration-drain"],
    [uri("media/ffmpeg/mpeg2-packet-drain-source.mjs"), uri("media/ffmpeg/mpeg2-duration-drain-source.mjs")],
    ["build.manifest.packetDrain.onlyQueueDrainAdded, true", "build.manifest.packetDrain.onlyQueueDrainAdded, false"],
    ["const slot = `work/mpeg2-packet-drain-${runId}`;", checks + "const slot = `work/mpeg2-duration-drain-${runId}`;"],
    ["outputs/reports/packet-drain-native-sources-${runId}", "outputs/reports/duration-drain-native-sources-${runId}"],
    ["scripts/qualify-packet-drain-native.mjs", "scripts/qualify-duration-drain-native.mjs"],
    ["evidence/packet-drain-native-${runId}", "evidence/duration-drain-native-${runId}"],
    ["actual-native-packet-drain-controls-and-static-ABI-not-browser-acceptance", "actual-native-duration-drain-controls-and-static-ABI-not-browser-acceptance"],
    ["actualPacketDrain: build.manifest.packetDrain,", "actualDurationBoundary: build.manifest.packetDurationBoundary, actualPacketDrain: build.manifest.packetDrain,"],
  ]);
  assert.ok(recipe.generated.includes("expectedFiles.length <= 128")); assert.ok(recipe.generated.includes("raw.length <= 2097152"));
  return recipe;
}
