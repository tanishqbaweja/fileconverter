// Source-supported next investigation, not a runtime ownership measurement.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const buildPath = "evidence/mpeg2-mvf-arena-build-38643550000.json", buildBytes = await read(buildPath), build = JSON.parse(buildBytes);
const terminalPath = "evidence/2026-10-14T22-43-44-516Z-mvf-arena-full-terminal-analysis.json", terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const cachePath = "media/ffmpeg/mpeg2-packet-largest-idle.h", cache = (await read(cachePath)).toString();
assert.equal(sha(cache), build.manifest.sources[cachePath]);
const bridge = build.manifest.packetCache.generatedMuxBridge, kernel = build.manifest.packetCache.generatedKernel;
for (const token of ["cache->live--;", "lease->capacity > cache->idle->capacity", "cache->idle = NULL;", "lease->data = av_malloc(required);", "cache->live++;", "within_packet_release, lease, 0"])
  assert.ok(cache.includes(token), token);
assert.ok(bridge.includes('#include "mpeg2-packet-largest-idle.h"'));
assert.ok(bridge.includes("within_packet_cache_get(&split_mux_packet_cache, bytes, AV_INPUT_BUFFER_PADDING_SIZE)"));
assert.ok(kernel.includes("result = av_interleaved_write_frame(p->output, p->encoded);"));
assert.ok(kernel.includes("out->max_interleave_delta = AV_TIME_BASE;"));
assert.ok(kernel.indexOf("avformat_free_context(out)") < kernel.indexOf("within_packet_cache_close"));
assert.equal(terminal.wrapperRequestedBytes, 212670); assert.equal(terminal.splitFinal.peakPacketBytes, 314024);
const output = "evidence/mvf-packet-ownership-source-audit-2026-10-15.json", own = "scripts/audit-mvf-packet-ownership-source.mjs", ownBytes = await read(own);
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), scope: "executed-source-ownership-audit-not-current-cache-state-or-fixed-conversion",
  build: { path: buildPath, sha256: sha(buildBytes) }, terminal: { path: terminalPath, sha256: sha(terminalBytes) },
  cache: { path: cachePath, sha256: sha(cache) }, generatedMuxBridgeSha256: sha(bridge), generatedKernelSha256: sha(kernel),
  sourcePolicy: { idleLeases: 1, releaseSelection: "largest-final-unreferenced", requiredBytes: "payload+64", maximumPayloadBytes: 1048576,
    allocatesActualRequiredBytes: true, muxCall: "av_interleaved_write_frame", maximumInterleaveDeltaUs: 1000000,
    closeAfterMuxContextFree: true, liveReferencesNeverForceFreed: true },
  runtimeKnown: { wrapperRequestedBytes: 212670, previousPeakEncodedPayloadBytes: 314024, failedWindowFrames: 34338 },
  runtimeUnknown: { idleCapacityAtFailure: null, liveLeaseCountAtFailure: null, muxQueueRetainedLeaseCount: null, rawArenaUseMeasured: false },
  designReferences: [{ url: "https://ffmpeg.org/doxygen/8.0/group__lavf__encoding.html", version: "8.0 documentation, not a substitute for pinned8.1.2 execution",
    notes: "Interleaved write may retain packet references; NULL flushes interleave queues. Do not mix av_write_frame and av_interleaved_write_frame in one context." }],
  nextRequiredEvidence: "Bounded current cache ownership measurement and/or actual pinned-libavformat interleaver release controls before selecting a change; retain complete fidelity/timestamp/mux/error/cleanup gates.",
  interleaveDrainImplemented: false, speedGainProven: false, noUnchangedRetry: true, publicAcceptance: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, currentCacheOccupancyProven: false, interleaveDrainImplemented: false }));
