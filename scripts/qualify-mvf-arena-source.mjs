// Source-only controls. No conversion, browser, output media or public mutation.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { applyHevcAuxiliaryPolicy, HEVC_DECODER_SOURCE_SHA256 } from "../media/ffmpeg/mpeg2-hevc-auxiliary-policy.mjs";
import { makeExecutedLateRefstructFromUpstream, applySingleIdleRefstruct, UPSTREAM_REFSTRUCT_SHA256 } from "../media/ffmpeg/mpeg2-single-idle-source.mjs";
import { makeMvfArenaRefstruct, makeMvfArenaHevc, reverseMvfArenaRefstruct, reverseMvfArenaHevc } from "../media/ffmpeg/mpeg2-mvf-arena-source.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), sourcePins = {}, sourcePreimages = {};
const files = ["scripts/qualify-mvf-arena-source.mjs", "media/ffmpeg/mpeg2-mvf-arena-source.mjs", "media/ffmpeg/mpeg2-mvf-arena-smoke.c",
  "media/ffmpeg/mpeg2-mvf-arena-recipe.mjs", "media/ffmpeg/mpeg2-mvf-arena-builder-recipe.mjs", "media/ffmpeg/build-mpeg2-mvf-arena.mjs",
  "media/ffmpeg/mpeg2-single-idle-source.mjs", "media/ffmpeg/mpeg2-late-refstruct-source.mjs", "media/ffmpeg/mpeg2-hevc-auxiliary-policy.mjs"];
for (const file of files) { const bytes = await readFile(path.join(root, file)); sourcePins[file] = sha(bytes); sourcePreimages[file] = bytes.toString("base64"); }
async function pinned(file, expected) {
  const url = `https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/${file}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) }); assert.equal(response.status, 200);
  assert.ok(Number(response.headers.get("content-length") ?? 0) <= 196608);
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; assert.ok(bytes <= 196608); chunks.push(item.value); }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const source = Buffer.concat(chunks).toString("utf8"); assert.equal(sha(source), expected); return { url, source, bytes, sha256: expected };
}
const [refstruct, hevc] = await Promise.all([pinned("libavutil/refstruct.c", UPSTREAM_REFSTRUCT_SHA256), pinned("libavcodec/hevc/hevcdec.c", HEVC_DECODER_SOURCE_SHA256)]);
const parentRefstruct = applySingleIdleRefstruct(makeExecutedLateRefstructFromUpstream(refstruct.source));
const actualParent = await readFile(path.join(root, "work/mpeg2-ebml-reuse-38608791023/single-idle-refstruct.c"), "utf8");
assert.equal(parentRefstruct, actualParent);
const refRecipe = makeMvfArenaRefstruct(parentRefstruct), hevcRecipe = makeMvfArenaHevc(applyHevcAuxiliaryPolicy(hevc.source));
assert.equal(reverseMvfArenaRefstruct(refRecipe.generated), parentRefstruct);
assert.equal(reverseMvfArenaHevc(hevcRecipe.generated), applyHevcAuxiliaryPolicy(hevc.source));
assert.throws(() => makeMvfArenaRefstruct(parentRefstruct + "\n"));
assert.throws(() => reverseMvfArenaRefstruct(refRecipe.generated.replace("index < 6", "index < 5")));
assert.throws(() => reverseMvfArenaHevc(hevcRecipe.generated.replace("WITHIN_HEVC_MVF_ARENA : 0", "WITHIN_HEVC_MVF_ARENA : 1")));
const postSourcePins = {}; for (const file of files) postSourcePins[file] = sha(await readFile(path.join(root, file)));
assert.deepEqual(postSourcePins, sourcePins);
const raw = Buffer.from(JSON.stringify({ refstruct, hevc, parentRefstruct, refRecipe, hevcRecipe, sourcePins, sourcePreimages }));
assert.ok(raw.length <= 2 * 1048576); const compressed = gzipSync(raw); assert.deepEqual(gunzipSync(compressed), raw);
const archivePath = "outputs/reports/mvf-arena-source-2026-10-15.json.gz";
await writeFile(path.join(root, archivePath), compressed, { flag: "wx" });
const receipt = { recordedAt: new Date().toISOString(), scope: "private-mvf-arena-source-only-not-runtime-acceptance",
  sourcePins, postSourcePins, archive: { path: archivePath, bytes: compressed.length, sha256: sha(compressed), restoredBytes: raw.length, restoredSha256: sha(raw) },
  actualParentByteExact: true, parentRefstructSha256: sha(actualParent), candidateRefstructSha256: refRecipe.generatedSha256,
  candidateHevcSha256: hevcRecipe.generatedSha256, exactReversals: true, negativeMutationControls: 3,
  maximumRawSlots: 6, maximumReservedBytes: 8388608, selectedMeasuredReservedBytes: 6981216,
  codecSettingsChanged: false, heapLimitsChanged: false, liveReferencesChanged: false, idleObjectAdmissionChanged: false,
  nativeLifecycleExecuted: false, browserConversions: 0, originalVideoRead: false, speedGainProven: false, publicAcceptance: false };
await writeFile(path.join(root, "evidence/mvf-arena-source-2026-10-15.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(receipt));
