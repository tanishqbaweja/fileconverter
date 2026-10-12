// Read-only executed-source investigation and private candidate preparation.
// No browser, media conversion, original-file read or native execution.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/layered-full-source-archive.mjs";
import { makePacketCacheBridge, makePacketCacheKernel } from "../media/ffmpeg/mpeg2-packet-cache-source.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const auditPath = "evidence/2026-10-11T23-47-49-089Z-hevc-plane-original-full-terminal-analysis.json";
const auditBytes = await read(auditPath); assert.equal(sha(auditBytes), "0587b19e2b5675e277fdd00e54bae9f1440af0dce6a6825aa008a68e39c87705");
const audit = JSON.parse(auditBytes); assert.equal(audit.failure, null); assert.equal(audit.result.observedFailureCallPath, "packet-reallocation");
assert.equal(audit.result.individualAllocationObserved, false);
const executed = await materializeLayeredFullSourceArchive(root, audit.sourceArchive);
assert.equal(Object.keys(executed.sourcePins).length, 338);
const files = ["scripts/prepare-mpeg2-packet-cache-source.mjs", "media/ffmpeg/mpeg2-packet-cache.h", "media/ffmpeg/mpeg2-packet-cache-source.mjs",
  "media/ffmpeg/mpeg2-packet-cache-smoke.c", "tests/mpeg2-packet-cache-source.test.mjs", "media/ffmpeg/mpeg2-split-kernel.mjs",
  "media/ffmpeg/mpeg2-split-mux-bridge.h", "media/ffmpeg/mpeg2-candidate.c", "work/mpeg2-hevc-planes-38183370743/hevc-plane-buffer.c"];
const sourcePins = {}, sourcePreimages = {}, texts = {};
for (const file of files) {
  const bytes = await read(file); assert.ok(bytes.length <= 65536); sourcePins[file] = sha(bytes);
  sourcePreimages[file] = { encoding: "base64", data: bytes.toString("base64") }; texts[file] = bytes.toString();
  if (file in executed.sourcePins) assert.equal(sourcePins[file], executed.sourcePins[file]);
}
const actualBuffer = texts[files[8]]; assert.equal(sha(actualBuffer), "76fcae1c9409074b9b287d77d189ba06ab84e680e818a7649c56a6ad43db081a");
const createStart = actualBuffer.indexOf("AVBufferRef *av_buffer_create("), createEnd = actualBuffer.indexOf("void av_buffer_default_free(", createStart);
assert.ok(createStart >= 0 && createEnd > createStart);
const actualBufferCreate = actualBuffer.slice(createStart, createEnd);
assert.match(actualBufferCreate, /if \(!ret\) \{\s+av_free\(buf\);\s+return NULL;/);
assert.ok(!actualBufferCreate.includes("free(opaque") && !actualBufferCreate.includes("av_free(data)"));
const generatedBridge = makePacketCacheBridge(texts[files[6]]), generatedKernel = makePacketCacheKernel(texts[files[7]]);
const payload = Buffer.from(JSON.stringify({ sourcePins, sourcePreimages, generatedBridge, generatedKernel, actualBufferCreate }));
assert.ok(payload.length <= 262144);
const zipped = gzipSync(payload, { level: 9 }); assert.deepEqual(gunzipSync(zipped), payload);
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const archivePath = `outputs/reports/${stamp}-mpeg2-packet-cache-source.json.gz`;
await writeFile(path.join(root, archivePath), zipped, { flag: "wx" }); assert.equal(sha(await read(archivePath)), sha(zipped));
const postSourcePins = {}; for (const file of files) postSourcePins[file] = sha(await read(file)); assert.deepEqual(postSourcePins, sourcePins);
const proof = { recordedAt: new Date().toISOString(), status: "private-packet-cache-source-prepared-not-built",
  actualFailure: { path: auditPath, sha256: sha(auditBytes), callPath: audit.result.observedFailureCallPath,
    individualAllocationBytes: null, allocatorInventory: null, failureCauseProven: false, completedConversions: 0 },
  actual338ExecutedSourcesJoined: true, sourcePins, postSourcePins,
  archive: { path: archivePath, bytes: zipped.length, sha256: sha(zipped), restoredBytes: payload.length, restoredSha256: sha(payload) },
  generatedBridgeSha256: sha(generatedBridge), generatedKernelSha256: sha(generatedKernel),
  unchangedFragmentationOptions: { movflags: "frag_keyframe+delay_moov+default_base_moof+skip_trailer", fragDurationUs: 1000000, fragSizeBytes: 1048576, maxInterleaveUs: 1000000 },
  candidatePolicy: { maximumIdleLeases: 1, maximumIdlePayloadBytes: 1048576, paddingBytes: 64, allocateActualRequiredBytes: true,
    fixedMaximumAllocationForEveryLivePacket: false, liveReferencesReleasedEarly: false, zeroEveryAcquisitionIncludingPadding: true,
    finalUnrefOnlyReuse: true, deferredCloseUntilLiveReferencesGone: true, metadataAndTimingByteExact: true,
    codecSettingsChanged: false, heapLimitsRaised: false, sourceOrOutputBufferingChanged: false },
  actualAvBufferCreateFailureDoesNotConsumeDataConfirmedFromExecutedSource: true,
  nativeBuildExecuted: false, nativeLifecycleSmokeExecuted: false, browserLaunches: 0, conversions: 0,
  originalVideoRead: false, fullOriginalAcceptance: false, memoryAcceptance: false, speedGainProven: false, publicAcceptance: false,
  nextAction: "Compile against pinned actual libavutil and fixed32MiB decoder, execute lifetime/failure smoke, then qualify changed browser before any new full attempt" };
const output = `evidence/${stamp}-mpeg2-packet-cache-source.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, archive: proof.archive, status: proof.status, sourceCount: files.length, nativeLifecycleSmokeExecuted: false }));
