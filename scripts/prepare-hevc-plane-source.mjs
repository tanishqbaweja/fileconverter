// Read-only source preparation, not native build or browser conversion.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { reconstructExecutedHevcGetBuffer } from "./lib/alignment16-first-malloc-capacity.mjs";
import { reverseSingleIdlePlaneBuffer } from "../media/ffmpeg/mpeg2-encoder-plane-source.mjs";
import { reversePlaneFactoryPrototype } from "../media/ffmpeg/mpeg2-encoder-plane-prototype-source.mjs";
import { applyHevcSingleIdleGetBuffer, makeHevcSingleIdleBuffer, makeHevcPlaneSmoke } from "../media/ffmpeg/mpeg2-hevc-plane-source.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const files = ["scripts/prepare-hevc-plane-source.mjs", "media/ffmpeg/mpeg2-hevc-plane-policy.h", "media/ffmpeg/mpeg2-hevc-plane-source.mjs",
  "scripts/lib/alignment16-first-malloc-capacity.mjs", "media/ffmpeg/mpeg2-encoder-plane-source.mjs", "media/ffmpeg/mpeg2-encoder-plane-smoke.c",
  "media/ffmpeg/patches/hevc-decoder-uncached-frame-buffers.patch", "media/ffmpeg/patches/mpeg2-encoder-uncached-frame-buffers.patch",
  "tests/mpeg2-hevc-plane-source.test.mjs", "media/ffmpeg/mpeg2-encoder-plane-prototype-source.mjs"];
const sourcePins = {}, sourcePreimages = {};
for (const file of files) { const bytes = await read(file); sourcePins[file] = sha(bytes); sourcePreimages[file] = { encoding: "base64", data: bytes.toString("base64") }; }
const getInput = "work/mpeg2-encoder-planes-38044000567/encoder-plane-get-buffer.c", bufferInput = "work/mpeg2-encoder-planes-38044000567/encoder-plane-buffer.c";
const encoderGet = (await read(getInput)).toString(), encoderBuffer = (await read(bufferInput)).toString();
const oldGet = reconstructExecutedHevcGetBuffer(encoderGet), upstreamBuffer = reverseSingleIdlePlaneBuffer(reversePlaneFactoryPrototype(encoderBuffer));
const generatedGet = applyHevcSingleIdleGetBuffer(oldGet.generated), generatedBuffer = makeHevcSingleIdleBuffer(upstreamBuffer);
assert.equal(generatedBuffer, encoderBuffer, "Pool primitive is EXACT actually built encoder source; only decoder selector/wiring changes");
const smoke = makeHevcPlaneSmoke((await read(files[5])).toString()), header = (await read(files[1])).toString();
const archive = { upstreamBuffer, executedDecoderGet: oldGet.generated, generatedGet, generatedBuffer, header, smoke,
  inputs: { [getInput]: sha(encoderGet), [bufferInput]: sha(encoderBuffer) } };
const bytes = Buffer.from(JSON.stringify(archive)), zipped = gzipSync(bytes, { level: 9 });
assert.ok(bytes.length <= 262144 && zipped.length <= 262144); assert.deepEqual(gunzipSync(zipped), bytes);
const archivePath = "outputs/reports/hevc-plane-source-preflight-2026-10-12.json.gz";
await writeFile(path.join(root, archivePath), zipped, { flag: "wx" }); assert.equal(sha(await read(archivePath)), sha(zipped));
const postSourcePins = {}; for (const file of files) postSourcePins[file] = sha(await read(file)); assert.deepEqual(postSourcePins, sourcePins);
const proof = { recordedAt: new Date().toISOString(), status: "private-hevc-plane-source-prepared-not-built", sourcePins, postSourcePins, sourcePreimages,
  archive: { path: archivePath, bytes: zipped.length, sha256: sha(zipped), restoredBytes: bytes.length, restoredSha256: sha(bytes) },
  generatedGetSha256: sha(generatedGet), generatedBufferSha256: sha(generatedBuffer), executedDecoderGetSha256: oldGet.generatedSha256,
  policy: { maximumIdleEntriesPerSelectedPool: 1, atMostFourPixelPlanePoolsPerFramePool: true,
    selector: "HEVC single-thread decoder only, memory-poisoning off", zeroEveryAcquisitionIncludingPadding: true,
    onlyFinalUnreferenceCanCacheOrFree: true, liveReferencesChanged: false, codecSettingsChanged: false,
    nonselectedPoliciesUnchanged: true, publicStructAbiChanged: false, privateFramePoolFieldAddedBytes: 4,
    fixed32MiBDecoderFitProven: false, decoderHeapRaised: false },
  decoderBuildExecuted: false, newCompiledLifecycleExecuted: false, browserLaunches: 0, conversions: 0,
  originalVideoRead: false, publicAcceptance: false, speedGainProven: false, sourceInputsUnchanged: true };
const output = "evidence/hevc-plane-source-preflight-2026-10-12.json";
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, archive: proof.archive, generatedGetSha256: proof.generatedGetSha256, compiledLifecycleExecuted: false }));
