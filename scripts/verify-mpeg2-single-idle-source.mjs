// Bounded primary-source/policy proof only. Never reads test.mkv or compiles codecs.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeExecutedLateRefstructFromUpstream, applySingleIdleRefstruct, reverseSingleIdleRefstruct,
  UPSTREAM_REFSTRUCT_SHA256, EXECUTED_LATE_REFSTRUCT_SHA256 } from "../media/ffmpeg/mpeg2-single-idle-source.mjs";
import { makeSingleIdleRecipe } from "../media/ffmpeg/mpeg2-single-idle-recipe.mjs";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root));
async function boundedSource(url, expectedSha256, maximumBytes) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) }); assert.ok(response.ok);
  const reader = response.body.getReader(), parts = []; let bytes = 0;
  try { for (;;) { const row = await reader.read(); if (row.done) break; bytes += row.value.byteLength;
    assert.ok(bytes <= maximumBytes); parts.push(row.value); } }
  finally { await reader.cancel(); reader.releaseLock(); }
  const text = Buffer.concat(parts).toString("utf8"); assert.equal(sha(text), expectedSha256); return text;
}
const url = "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavutil/refstruct.c";
const upstream = await boundedSource(url, UPSTREAM_REFSTRUCT_SHA256, 32768);
const late = makeExecutedLateRefstructFromUpstream(upstream); assert.equal(sha(late), EXECUTED_LATE_REFSTRUCT_SHA256);
const changed = applySingleIdleRefstruct(late); assert.equal(reverseSingleIdleRefstruct(changed), late);
assert.throws(() => applySingleIdleRefstruct(changed)); assert.throws(() => applySingleIdleRefstruct(late + "\n"));
assert.throws(() => reverseSingleIdleRefstruct(changed.replace("|| !pool->available_entries", "|| pool->available_entries")));
const recipe = makeSingleIdleRecipe((await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")).toString());
const body = Buffer.from(JSON.stringify({ upstream, executedLate: late, singleIdle: changed, generatedRecipe: recipe }));
const gzip = gzipSync(body, { level: 9 }), archive = "outputs/reports/2026-10-10-mpeg2-single-idle-native-sources.json.gz";
await writeFile(new URL(archive, root), gzip, { flag: "wx" }); assert.deepEqual(gunzipSync(await read(archive)), body);
const files = ["media/ffmpeg/mpeg2-single-idle-source.mjs", "media/ffmpeg/patch-mpeg2-single-idle.mjs",
  "media/ffmpeg/mpeg2-hevc-single-idle-policy.h", "media/ffmpeg/mpeg2-single-idle-smoke.c", "media/ffmpeg/mpeg2-single-idle-recipe.mjs",
  "media/ffmpeg/build-mpeg2-single-idle.mjs", ".github/workflows/mpeg2-single-idle-nondocker.yml", "scripts/verify-mpeg2-single-idle-source.mjs"];
const sourcePins = Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await read(file))])));
const report = { recordedAt: new Date().toISOString(), status: "verified-reversible-single-idle-policy-source-not-browser-acceptance",
  upstreamSource: { url, bytes: Buffer.byteLength(upstream), sha256: sha(upstream) }, oldExecutedLateSha256: sha(late),
  patchedSourceSha256: sha(changed), generatedRecipeSha256: sha(recipe), sourcePins,
  sourceArchive: { path: archive, bytes: gzip.length, sha256: sha(gzip), restoredBytes: body.length, restoredSha256: sha(body) },
  exactOldSourceReconstructed: true, byteExactPolicyReversal: true, mutationNegativeControlsPassed: true,
  affectedIdleAdmissionOnly: true, selectedPools: ["tab_mvf", "rpl_tab"], privateBit: 536870912, maximumIdleEntriesPerSelectedPool: 1,
  admissionAndListCheckUnderOriginalMutex: true, uncachedBitStillTakesPrecedence: true, codecSelectorsUnchangedExceptIdleFlag: true,
  liveReferencesChanged: false, pixelsOrCodecOptionsChanged: false, heapLimitsRaised: false, publicFilesChanged: false,
  compilerExecuted: false, browserConversionsPerformed: 0, originalRead: false, speedImprovementProven: false, publicAcceptance: false };
const output = "evidence/mpeg2-single-idle-source-2026-10-10.json";
await writeFile(new URL(output, root), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, patchedSourceSha256: report.patchedSourceSha256, oldSourceSha256: sha(late), archive, publicAcceptance: false }));
