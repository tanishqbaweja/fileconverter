import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), sha = value => createHash("sha256").update(value).digest("hex");
const reportPath = "output/playwright/2026-10-06T21-32-43.445Z-mpeg2-split-pipeline-37479749443-direct-artwork.json";
const raw = await readFile(path.join(root, reportPath)), report = JSON.parse(raw);
assert.equal(report.candidateName, "mpeg2-split-pipeline-37479749443");
const conversions = report.rows.filter(row => !row.kind && row.status === "passed"); assert.equal(conversions.length, 3);
for (const row of conversions) {
  const hevc = row.sourceCodec === "hevc";
  assert.equal(row.outputCodec, "mpeg2video"); assert.equal(row.outputBytes, hevc ? 652521 : 321692);
  assert.equal(row.frames, hevc ? "96" : "48"); assert.equal(row.ssim, hevc ? 0.985963 : 0.992146);
  assert.equal(row.outputSha256, hevc ? "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32" : "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94");
  assert.equal(row.metrics.peakPendingOperations, 1); assert.equal(row.metrics.peakWasmMemoryBytes, 50331648);
  assert.ok(row.metrics.maxReadChunkBytes <= 65536 && row.metrics.maxWriteChunkBytes <= 524288 && row.metrics.peakQueuedBytes <= 524288);
}
const frameChecks = report.rows.filter(row => row.kind === "independent-frame-diagnostic"); assert.equal(frameChecks.length, 3);
assert.ok(frameChecks.every(row => row.nativeFullDecodePassed));
const audioChecks = report.rows.filter(row => row.kind === "independent-decoded-audio"); assert.equal(audioChecks.length, 3);
for (const row of audioChecks) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
const artworkChecks = report.rows.filter(row => row.kind === "attached-picture-preservation"); assert.equal(artworkChecks.length, 3);
assert.ok(artworkChecks.every(row => row.status === "passed"));
const timelines = report.rows.filter(row => row.kind === "independent-presentation-timeline-passed"); assert.equal(timelines.length, 3);
const recovery = report.rows.filter(row => ["direct-write-failure", "cancel-after-direct-output"].includes(row.kind)); assert.equal(recovery.length, 2);
for (const row of recovery) { assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []); }
const inventories = report.rows.filter(row => "cleanupRemovedEntries" in row); assert.equal(inventories.length, 5);
for (const row of inventories) assert.deepEqual(row.cleanupRemovedEntries, []);
const restored = {};
for (const name of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  const published = sha(await readFile(path.join(root, "public/engines/remux", name)));
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux", name))), published); restored[name] = published;
}
for (const name of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm", "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", name)), { code: "ENOENT" });
const sourcePins = {};
for (const file of ["scripts/freeze-ui-matrix-golden-regression.mjs", "scripts/validate-mpeg2-split-direct.mjs", "tests/browser/mpeg2-split-direct-candidate.spec.ts", "app/converter/ConverterApp.tsx"])
  sourcePins[file] = sha(await readFile(path.join(root, file)));
const proof = { recordedAt: new Date().toISOString(), status: "passed-5-of-5-private-regression", scope: report.scope,
  rawReport: { path: reportPath, bytes: raw.length, sha256: sha(raw) }, candidateName: report.candidateName,
  conversions: conversions.map(({ sourceCodec, destination, sourceBytes, outputBytes, outputCodec, frames, audioTracks, ssim, outputSha256, metrics }) => ({ sourceCodec, destination, sourceBytes, outputBytes, outputCodec, frames, audioTracks, ssim, outputSha256, metrics })),
  audioChecks, artworkChecks: artworkChecks.map(({ status, compressedArtworkHash, actualVideoEncoderTag }) => ({ status, compressedArtworkHash, actualVideoEncoderTag })),
  timelines, nativeFullDecodePassed: true, recovery: recovery.map(({ kind, status, terminalState, partialBytes }) => ({ kind, status, terminalState, partialBytes })),
  emptyCleanupInventories: inventories.length, restoredAssetHashes: restored, privateAdditionsAbsent: true,
  sourcePinsScope: "Current files verified at freeze; legacy raw browser report does not contain executed App source pins. Candidate App identity also has independently pinned UI benchmark evidence.", sourcePins,
  completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false, publicAcceptance: false,
  limitations: ["Short fixtures and non-stabilized whole-process diagnostic snapshots cannot certify250MiB or full-source/scaling/repeat gates.", "Private selector uses public remux adapter label; fresh MPEG2 encoding is not publicly advertised."] };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 32768);
await writeFile(path.join(root, "evidence/ui-matrix-golden-regression-2026-10-07.json"), json, { flag: "wx" });
console.log("Three genuine browser conversions retain exact goldens; both recovery cases pass, six generated assets restored/nine private additions absent");
