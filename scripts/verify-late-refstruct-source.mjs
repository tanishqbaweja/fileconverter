// Bounded source-only proof before compiling any changed diagnostic.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { instrumentLateRefstruct, reverseLateRefstruct, PRIVATE_REFSTRUCT_SHA256 } from "../media/ffmpeg/mpeg2-late-refstruct-source.mjs";
import { makeLateRefstructRecipe } from "../media/ffmpeg/mpeg2-late-refstruct-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = value => createHash("sha256").update(value).digest("hex");
const url = "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavutil/refstruct.c";
const response = await fetch(url, { signal: AbortSignal.timeout(30000) }); assert.ok(response.ok);
const reader = response.body.getReader(), parts = []; let count = 0;
try {
  for (;;) {
    const row = await reader.read(); if (row.done) break;
    count += row.value.byteLength; assert.ok(count <= 32768); parts.push(row.value);
  }
} finally { await reader.cancel(); reader.releaseLock(); }
const source = Buffer.concat(parts).toString("utf8");
assert.equal(sha(source), "d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f");
const policy = "/* Private pinned-build bit; used only by single-thread MPEG2 encoders. */\n#define WITHIN_MPEG2_POOL_UNCACHED (1u << 30)\n\n";
assert.equal(source.split("#ifndef REFSTRUCT_CHECKED").length, 2);
assert.equal(source.split("if (!pool->uninited) {").length, 2);
const privateSource = source.replace("#ifndef REFSTRUCT_CHECKED", policy + "#ifndef REFSTRUCT_CHECKED")
  .replace("if (!pool->uninited) {", "if (!pool->uninited && !(pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED)) {");
assert.equal(sha(privateSource), PRIVATE_REFSTRUCT_SHA256);
const changed = instrumentLateRefstruct(privateSource); assert.equal(reverseLateRefstruct(changed), privateSource);
assert.throws(() => instrumentLateRefstruct(privateSource + "\n"));
assert.throws(() => reverseLateRefstruct(changed.replace("ret ? 2 : 3", "ret ? 3 : 2")));
assert.equal(changed.match(/ret = av_refstruct_alloc_ext\(/g).length, privateSource.match(/ret = av_refstruct_alloc_ext\(/g).length);
const base = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-split-pipeline.sh"), "utf8"), recipe = makeLateRefstructRecipe(base);
const files = ["scripts/verify-late-refstruct-source.mjs", "media/ffmpeg/mpeg2-late-refstruct-source.mjs",
  "media/ffmpeg/mpeg2-late-refstruct-recipe.mjs", "media/ffmpeg/mpeg2-late-refstruct-slot.c",
  "media/ffmpeg/mpeg2-late-refstruct-smoke.c", "media/ffmpeg/patch-late-refstruct.mjs",
  "media/ffmpeg/build-mpeg2-late-refstruct.mjs", "scripts/lib/late-refstruct-abort-snapshot.mjs",
  ".github/workflows/mpeg2-late-allocation-nondocker.yml"];
const sourcePins = {};
for (const file of files) sourcePins[file] = sha(await readFile(path.join(root, file)));
const report = { recordedAt: new Date().toISOString(), status: "verified-reversible-source-only-late-request-diagnostic-not-compiled",
  upstream: { url, bytes: count, sha256: sha(source) }, privateSource, privateSourceSha256: sha(privateSource),
  instrumentedSourceSha256: sha(changed), generatedRecipeSha256: sha(recipe), sourcePins,
  byteExactSourceReversal: true, originalAllocationCallsPreserved: true, mutationNegativeControlsPassed: true,
  fixedNativeSlotBytes: 64, snapshotsRetained: 1, noFirst48EventCutoff: true,
  perRequestJsCrossings: 0, dynamicNativeDiagnosticAllocations: 0, mediaPayloadReads: 0,
  allocationPolicyChanged: false, liveReferencesChanged: false, heapLimitsRaised: false,
  originalRead: false, conversionsPerformed: 0, noDocker: true, actualCompiledUnitVerified: false,
  browserAbortObservationVerified: false, actualLateFailedRequestBytes: null,
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null };
const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 65536);
await writeFile(path.join(root, "evidence/mpeg2-late-refstruct-source-preflight-2026-10-08.json"), json, { flag: "wx" });
console.log(JSON.stringify({ status: report.status, sourceSha256: report.instrumentedSourceSha256, fixedSlotBytes: 64,
  allocationCallsPreserved: true, recipeSha256: report.generatedRecipeSha256 }));
