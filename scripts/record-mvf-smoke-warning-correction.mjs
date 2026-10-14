import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
assert.equal(process.argv.length, 2); const root = path.resolve(import.meta.dirname, "..");
const read = file => readFile(path.join(root, file));
const proof = JSON.parse(await read("evidence/mvf-arena-source-2026-10-15.json"));
const zipped = await read(proof.archive.path); assert.equal(sha(zipped), proof.archive.sha256);
const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(raw), proof.archive.restoredSha256);
const archive = JSON.parse(raw), target = "media/ffmpeg/mpeg2-mvf-arena-smoke.c";
const before = Buffer.from(archive.sourcePreimages[target], "base64").toString(), after = (await read(target)).toString();
assert.equal(sha(before), proof.sourcePins[target]);
const oldInclude = '#include "libavutil/refstruct.c"';
const newInclude = `/* Pinned upstream internal headers have intentionally unused parameters.
 * Keep -Werror for this harness; scope the exception to that exact include. */
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunused-parameter"
#include "libavutil/refstruct.c"
#pragma clang diagnostic pop`;
assert.equal(before.split(oldInclude).length, 2); assert.equal(before.replace(oldInclude, newInclude), after);
assert.equal(after.replace(newInclude, oldInclude), before);
for (const file of ["media/ffmpeg/mpeg2-mvf-arena-source.mjs", "media/ffmpeg/mpeg2-mvf-arena-recipe.mjs", "media/ffmpeg/mpeg2-mvf-arena-builder-recipe.mjs", "media/ffmpeg/build-mpeg2-mvf-arena.mjs"])
  assert.equal(sha(await read(file)), proof.sourcePins[file], file);
const failure = JSON.parse(await read("evidence/mvf-arena-build-failure-38641789883.json"));
assert.equal(failure.run.conclusion, "failure"); assert.equal(failure.cleanupStep.conclusion, "success"); assert.equal(failure.artifactCount, 0);
assert.equal(failure.failures.filter(line => /error: unused parameter/.test(line)).length, 2);
const output = "evidence/mvf-arena-smoke-warning-correction-2026-10-15.json";
const own = "scripts/record-mvf-smoke-warning-correction.mjs", ownBytes = await read(own);
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), failedRunId: "38641789883", target,
  originalSourceProofUnmodified: true, oldSha256: sha(before), correctedSha256: sha(after), beforeInclude: oldInclude, afterInclude: newInclude,
  onlyUpstreamIncludeWarningScopeChanged: true, ownHarnessStrictWarningsPreserved: true,
  productionDecoderAndBuildRecipeUnchanged: true, codecSettingsChanged: false, heapLimitsChanged: false,
  failedBuildCleanupPassed: true, hostedArtifacts: 0, browserConversions: 0, originalRead: false, publicAcceptance: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, oldSha256: sha(before), correctedSha256: sha(after) }));
