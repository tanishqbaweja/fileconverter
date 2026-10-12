// Fresh actual 4421 core binding. Historical executed sources remain immutable.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeHevcPlaneExportRecipe, makeHevcPlaneControlBrowserFactory, makeHevcPlaneControlCaller, HEVC_PLANE_DECODER_SHA256 } from "./hevc-plane-control-recipe.mjs";
export const PACKET_CACHE_DECODER_SHA256 = "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb";
const addedFiles = ["scripts/lib/packet-cache-control-recipe.mjs", "scripts/check-packet-cache-abort-control.mjs",
  "scripts/lib/packet-cache-attempt-abort-capture.mjs", "scripts/lib/packet-cache-composite-abort-capture.mjs",
  "scripts/lib/packet-cache-native-envelope.mjs", "tests/packet-cache-control.test.mjs",
  "evidence/mpeg2-packet-cache-build-38206263853.json", "evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix.json",
  "evidence/packet-cache-native-sources-38206263853.json", "scripts/retain-mpeg2-packet-cache-native-sources.mjs"];
function exact(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) {
    assert.ok(before && after); assert.equal(generated.split(before).length - 1, count, before.slice(0, 160));
    generated = generated.replaceAll(before, after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, source, "Only explicit core binding/source-envelope edits; all privacy/ownership/heap/cleanup/export gates retained");
  return { generated, generatedSha256: sha(generated), previousSourceSha256: sha(source), edits, publicAcceptance: false };
}
export function makePacketCacheExportRecipe(source) {
  return exact(makeHevcPlaneExportRecipe(source).generated, [[JSON.stringify(HEVC_PLANE_DECODER_SHA256), JSON.stringify(PACKET_CACHE_DECODER_SHA256)]]);
}
export function makePacketCacheControlBrowserFactory(source) {
  const prior = makeHevcPlaneControlBrowserFactory(source).generated;
  const served = '"hevc-plane-attempt-abort-capture.mjs","hevc-plane-composite-abort-capture.mjs"';
  return exact(prior, [
    ['from "./hevc-plane-attempt-abort-capture.mjs";', 'from "./packet-cache-attempt-abort-capture.mjs";'],
    ['from "/hevc-plane-composite-abort-capture.mjs";', 'from "/packet-cache-composite-abort-capture.mjs";'],
    [served, served + ',"packet-cache-attempt-abort-capture.mjs","packet-cache-composite-abort-capture.mjs"'],
    ["work/mpeg2-hevc-planes-38183370743", "work/mpeg2-packet-cache-38206263853"],
    ["hevc-plane-abort-control", "packet-cache-abort-control", 6],
    ["export const allocationAttemptControlFiles = [", "export const allocationAttemptControlFiles = [" + addedFiles.map(file => JSON.stringify(file) + ",").join("")],
  ]);
}
export function makePacketCacheControlCaller(source, root) {
  const prior = makeHevcPlaneControlCaller(source, root).generated;
  const nativeUrl = JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/packet-cache-native-envelope.mjs")).href);
  const edits = [
    ["evidence/mpeg2-hevc-plane-build-38183370743.json", "evidence/mpeg2-packet-cache-build-38206263853.json"],
    ["evidence/mpeg2-hevc-plane-build-branch-2026-10-12-include-fix.json", "evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix.json"],
    ["actual-hevc-plane-build-unit-verified-not-browser-acceptance", "actual-packet-cache-build-unit-verified-not-browser-acceptance"],
    ["work/mpeg2-hevc-planes-38183370743", "work/mpeg2-packet-cache-38206263853"],
    ["__wrap_posix_memalign: 4472", "__wrap_posix_memalign: 4473"],
    ['"hevc-plane-control-caller-"', '"packet-cache-control-caller-"'],
    ["hevc-plane-abort-control", "packet-cache-abort-control", 3],
    ['import assert from "node:assert/strict";', 'import assert from "node:assert/strict";\nimport { verifyPacketCacheNativeEnvelope } from ' + nativeUrl + ';'],
    ['const binaryPath = `${candidate}/within-mpeg2-split.wasm`', 'const nativeSourceEnvelope = await verifyPacketCacheNativeEnvelope(root, build, buildBytes, branch);\nconst binaryPath = `${candidate}/within-mpeg2-split.wasm`'],
    ["allocator, slot, poolSlot, functions };", "allocator, slot, poolSlot, functions, nativeSourceEnvelope };"],
    // Native code was executed by the hosted compiler, not this browser caller.
    // Keep every actual native preimage in its already-qualified independent
    // 72-source envelope, joined before AND after this run; no cap is increased.
    ["...Object.keys(build.manifest.sources),", '"scripts/lib/packet-cache-native-envelope.mjs", "evidence/packet-cache-native-sources-38206263853.json",'],
    ["receipt.postSourcePins = {};", "receipt.nativeSourceEnvelopePost = await verifyPacketCacheNativeEnvelope(root, build, buildBytes, branch);\n  assert.deepEqual(receipt.nativeSourceEnvelopePost, nativeSourceEnvelope);\n  receipt.postSourcePins = {};"],
  ];
  for (const [file, target, before, after] of [
    ["hevc-plane-attempt-abort-capture.mjs", "packet-cache-attempt-abort-capture.mjs", "ALLOCATION_ATTEMPT_ROOT } from ", "ALLOCATION_ATTEMPT_ROOT } from "],
    ["hevc-plane-control-recipe.mjs", "packet-cache-control-recipe.mjs", "import { makeHevcPlaneExportRecipe as makeAllocationAttemptExportRecipe } from ", "import { makePacketCacheExportRecipe as makeAllocationAttemptExportRecipe } from "],
    ["hevc-plane-control-recipe.mjs", "packet-cache-control-recipe.mjs", "import { makeHevcPlaneControlBrowserFactory as makeAllocationAttemptBrowserFactory } from ", "import { makePacketCacheControlBrowserFactory as makeAllocationAttemptBrowserFactory } from "],
  ]) edits.push([before + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", file)).href), after + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", target)).href)]);
  return exact(prior, edits);
}
