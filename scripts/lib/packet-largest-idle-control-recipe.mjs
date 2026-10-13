import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makePacketCacheExportRecipe, makePacketCacheControlBrowserFactory, makePacketCacheControlCaller, PACKET_CACHE_DECODER_SHA256 } from "./packet-cache-control-recipe.mjs";
export const PACKET_LARGEST_IDLE_DECODER_SHA256 = "7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439";
function exact(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) { assert.equal(generated.split(before).length - 1, count, before.slice(0, 160)); generated = generated.replaceAll(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replaceAll(after, before);
  assert.equal(reverse, source); return { generated, generatedSha256: sha(generated), edits, publicAcceptance: false };
}
const added = ["scripts/lib/packet-largest-idle-control-recipe.mjs", "scripts/check-packet-largest-idle-abort-control.mjs",
  "scripts/lib/packet-largest-idle-attempt-abort-capture.mjs", "scripts/lib/packet-largest-idle-composite-abort-capture.mjs",
  "scripts/lib/packet-largest-idle-native-envelope.mjs", "tests/packet-largest-idle-control.test.mjs",
  "evidence/mpeg2-packet-largest-idle-build-38327579000.json", "evidence/mpeg2-packet-largest-idle-build-branch-2026-10-13.json",
  "evidence/packet-largest-idle-native-sources-38327579000.json", "scripts/retain-mpeg2-packet-largest-idle-native-sources.mjs"];
export function makeLargestIdleExportRecipe(source) {
  return exact(makePacketCacheExportRecipe(source).generated, [[JSON.stringify(PACKET_CACHE_DECODER_SHA256), JSON.stringify(PACKET_LARGEST_IDLE_DECODER_SHA256)]]);
}
export function makeLargestIdleControlBrowserFactory(source) {
  const prior = makePacketCacheControlBrowserFactory(source).generated;
  const served = '"packet-cache-attempt-abort-capture.mjs","packet-cache-composite-abort-capture.mjs"';
  return exact(prior, [
    ['from "./packet-cache-attempt-abort-capture.mjs";', 'from "./packet-largest-idle-attempt-abort-capture.mjs";'],
    ['from "/packet-cache-composite-abort-capture.mjs";', 'from "/packet-largest-idle-composite-abort-capture.mjs";'],
    [served, served + ',"packet-largest-idle-attempt-abort-capture.mjs","packet-largest-idle-composite-abort-capture.mjs"'],
    ["work/mpeg2-packet-cache-38206263853", "work/mpeg2-packet-largest-idle-38327579000"],
    ["packet-cache-abort-control", "packet-largest-idle-abort-control", 7],
    ["export const allocationAttemptControlFiles = [", "export const allocationAttemptControlFiles = [" + added.map(file => JSON.stringify(file) + ",").join("")],
    ["assert.equal(terminal.emitted.qualifiedPoolCallPath,false);", "assert.equal(terminal.emitted.qualifiedPoolCallPath,false);\n  assert.equal(terminal.emitted.qualifiedPacketCallPath,false);"],
  ]);
}
export function makeLargestIdleControlCaller(source, root) {
  const prior = makePacketCacheControlCaller(source, root).generated;
  const edits = [
    ["evidence/mpeg2-packet-cache-build-38206263853.json", "evidence/mpeg2-packet-largest-idle-build-38327579000.json"],
    ["evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix.json", "evidence/mpeg2-packet-largest-idle-build-branch-2026-10-13.json"],
    ["actual-packet-cache-build-unit-verified-not-browser-acceptance", "actual-largest-idle-packet-build-unit-verified-not-browser-acceptance"],
    ["work/mpeg2-packet-cache-38206263853", "work/mpeg2-packet-largest-idle-38327579000"],
    ["sbrk: 4442, av_refstruct_pool_get: 4381", "sbrk: 4442, av_refstruct_pool_get: 4381, mpeg2_packets: 4471"],
    ['"packet-cache-control-caller-"', '"packet-largest-idle-control-caller-"'],
    ["packet-cache-abort-control", "packet-largest-idle-abort-control", 3],
    ["verifyPacketCacheNativeEnvelope", "verifyPacketLargestIdleNativeEnvelope", 3],
    ["evidence/packet-cache-native-sources-38206263853.json", "evidence/packet-largest-idle-native-sources-38327579000.json"],
    ['"scripts/lib/packet-cache-native-envelope.mjs"', '"scripts/lib/packet-largest-idle-native-envelope.mjs"'],
    [pathToFileURL(path.join(root, "scripts/lib/packet-cache-native-envelope.mjs")).href, pathToFileURL(path.join(root, "scripts/lib/packet-largest-idle-native-envelope.mjs")).href],
  ];
  for (const [file, target, before, after] of [
    ["packet-cache-attempt-abort-capture.mjs", "packet-largest-idle-attempt-abort-capture.mjs", "ALLOCATION_ATTEMPT_ROOT } from ", "ALLOCATION_ATTEMPT_ROOT } from "],
    ["packet-cache-control-recipe.mjs", "packet-largest-idle-control-recipe.mjs", "import { makePacketCacheExportRecipe as makeAllocationAttemptExportRecipe } from ", "import { makeLargestIdleExportRecipe as makeAllocationAttemptExportRecipe } from "],
    ["packet-cache-control-recipe.mjs", "packet-largest-idle-control-recipe.mjs", "import { makePacketCacheControlBrowserFactory as makeAllocationAttemptBrowserFactory } from ", "import { makeLargestIdleControlBrowserFactory as makeAllocationAttemptBrowserFactory } from "],
  ]) edits.push([before + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", file)).href), after + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", target)).href)]);
  return exact(prior, edits);
}
