import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { h264VfrBuildRef, h264VfrWrapperSha256, makeMkvH264VfrCandidate } from "../media/ffmpeg/mkv-h264-vfr-candidate.mjs";
import { checkMkvEditListArchive } from "../scripts/lib/mkv-edit-list-build-artifact.mjs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
import { makeH264ProbeDecoderWrapper, makeH264ProbeDecoderLibraries, makeH264ProbeDecoderManifest,
  h264ProbeLibrarySha256, h264ProbeManifestSha256, assertH264ProbeDecoderConfig,
  h264ProbeDecoderBuildRef } from "../media/ffmpeg/mkv-h264-probe-decoder-candidate.mjs";

test("H.264 VFR source derivation rejects an unverified parent and pins only reviewed timing changes", async () => {
  assert.throws(() => makeMkvH264VfrCandidate(Buffer.from("changed source")), /Exact independently tested AAC parent/);
  assert.equal(h264VfrWrapperSha256, "02e6dcbac2160882132cd19606b0820a3f6aa0718cc800abf9caa5c741f2ce8a");
  const source = await readFile(new URL("../media/ffmpeg/mkv-h264-vfr-candidate.mjs", import.meta.url), "utf8");
  assert.match(source, /inspectionBytes: 2097152, inspectionMicroseconds: 2000000/);
  assert.match(source, /missingH264DtsRejected: true, hevcTimingPolicyUnchanged: true/);
  assert.match(source, /packet->dts <= last_dts\[input_index\]/);
  assert.match(source, /assert.equal\(reversed, original\)/);
  assert.match(source, /extraPacketBuffering: true/); // Bounded FFmpeg probe queue is disclosed.
});

test("H.264 VFR artifacts cannot be substituted for the earlier exact-AAC engine", () => {
  const runId = "1234", head = "a".repeat(40);
  const run = { id: 1234, workflow_id: 345162646, head_sha: head, head_branch: h264VfrBuildRef,
    event: "workflow_dispatch", status: "completed", conclusion: "success" };
  const artifact = { name: "unpublished-mkv-edit-list-1234", expired: false, size_in_bytes: 123,
    workflow_run: { id: 1234, head_sha: head, head_branch: h264VfrBuildRef }, digest: "sha256:" + "b".repeat(64) };
  checkMkvEditListArchive({ run, artifact }, runId, head, true, true);
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, true));
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, false, true));
});

test("Isolated H.264 build keeps the pinned SDK, exact-AAC library patch, limits and release untouched", async () => {
  const workflow = await readFile(new URL("../media/ffmpeg/mkv-edit-list-nondocker.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes(`refs/heads/${h264VfrBuildRef}`));
  assert.match(workflow, /WITHIN_MKV_H264_VFR:/);
  assert.match(workflow, /emsdk" install 6\.0\.4/);
  assert.match(workflow, /git diff --exit-code HEAD -- public\/engines/);
  assert.match(workflow, /if: always\(\)/);
  assert.doesNotMatch(workflow, /\bdocker (build|run)\b|test\.mkv|\bdeploy\b/);
  const builder = await readFile(new URL("../media/ffmpeg/build-mkv-edit-list-candidate.mjs", import.meta.url), "utf8");
  assert.match(builder, /makeMkvH264VfrCandidate\(parent.generated\)/);
  assert.match(builder, /initialPages: 384, maximumPages: 1024, shared: true/);
  assert.match(builder, /exactAacMovSha256/);
});

test("Compiled parser-only correction refuses missing H264 DTS; diagnostic is not another acceptance run", async () => {
  const read = file => readFile(new URL(`../${file}`, import.meta.url));
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const evidence = [
    ["evidence/2026-11-14T10-09-16-982Z-mkv-exact-aac-complex.json", "ce6fdce595bbafda1f0eefcba929d4ce681530b8932a9b10201d3c00bb60176d", 40],
    ["evidence/2026-11-14T10-11-11-359Z-mkv-exact-aac-complex.json", "ac0182352c7ff20d4a0c64193b962ea130dbd7b976aaeb551a075b39e2c1616c", 38],
  ];
  for (const [file, digest, pids] of evidence) {
    const bytes = await read(file); assert.equal(sha(bytes), digest);
    const report = JSON.parse(bytes), [arm] = report.arms, [row] = arm.cases;
    assert.equal(report.status, "failed-not-acceptance"); assert.equal(arm.cases.length, 1);
    assert.equal(row.state, "error"); assert.equal(row.metrics.outputBytes, 0);
    assert.equal(row.metrics.peakPendingOperations, 0); assert.equal(row.metrics.peakQueuedBytes, 0);
    assert.equal(row.metrics.peakWasmMemoryBytes, 24 * 1048576);
    assert.ok(row.selection.productionInputElementUsed && row.selection.fileMetadataUnchanged);
    assert.equal(report.candidateBuild.head, "93c0d4d8455947745e92f4acedfe42d27aea5368");
    assert.equal(report.candidateBuild.runId, "43583077059");
    assert.equal(report.candidateBuild.build.artifacts["within-direct.wasm"].sha256,
      "01ffd9446fdc3503aafb2f8c657bb9a955e36d3243ffc7a12d7765a50d677de7");
    assert.equal(report.candidateBuild.build.source.candidateWrapperSha256, h264VfrWrapperSha256);
    assert.equal(report.candidateBuild.build.source.extraPacketBuffering, true);
    assert.equal(arm.memory.cleanupAboveIdleMiB, null);
    assert.deepEqual(report.originalBefore, report.originalAfter);
    assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && report.fixtureRuntimeRemoved && report.toolDownloadRemoved);
    assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
    assert.equal(arm.browserCleanup.observedPids.length, pids);
    const packed = await read(arm.archive.file); assert.equal(sha(packed), arm.archive.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: 2 * 1024 ** 2 }); assert.equal(sha(raw), arm.archive.decodedSha256);
    assert.equal(report.publicAcceptance, false); assert.equal(report.productionFilesReplaced, false);
    if (report.diagnosticOnly) {
      assert.equal(row.diagnosticTerminalCaptured, true);
      assert.ok(row.error.length <= 2048);
      assert.match(row.error, /H\.264 stream copy cannot preserve unverified or non-monotonic decode timestamps/);
      assert.match(arm.failures[0], /Diagnostic-only engine refusal, not acceptance/);
    } else assert.equal(row.error, undefined, "The first harness lacked the terminal engine diagnostic");
  }
  const libraries = (await read("media/ffmpeg/build-libraries.sh")).toString();
  const copyOnly = libraries.slice(0, libraries.indexOf("\nelse\n"));
  assert.match(copyOnly, /DECODER_CONFIGURE_FLAGS=\(\)/);
  assert.doesNotMatch(copyOnly, /--enable-decoder=/);
  const driver = (await read("scripts/qualify-mkv-direct-reuse.mjs")).toString();
  assert.match(driver, /row.error = typeof state.error === "string" \? state.error.slice\(0, 2048\) : null/);
});

test("Next probe-decoder library derivation adds only H264 decoding to the copy-only configuration", async () => {
  const bytes = await readFile(new URL("../media/ffmpeg/build-libraries.sh", import.meta.url));
  const result = makeH264ProbeDecoderLibraries(bytes);
  assert.equal(result.proof.generatedSha256, h264ProbeLibrarySha256);
  assert.deepEqual(result.proof.enabledDecoders, ["h264"]);
  assert.equal(result.generated.replace("  DECODER_CONFIGURE_FLAGS=(--enable-decoder=h264)\n", ""), bytes.toString());
  assert.equal(result.proof.encodersAdded, false);
  assert.throws(() => makeH264ProbeDecoderLibraries(Buffer.concat([bytes, Buffer.from("\n")])));
  assert.throws(() => makeH264ProbeDecoderWrapper(Buffer.from("unverified wrapper")));
});

test("Next probe manifest changes only the decoder declaration, not unrelated engines or memory bounds", async () => {
  const bytes = await readFile(new URL("../public/engines/remux/build-manifest.json", import.meta.url));
  const generated = makeH264ProbeDecoderManifest(bytes);
  assert.equal(createHash("sha256").update(generated).digest("hex"), h264ProbeManifestSha256);
  const before = JSON.parse(bytes), after = JSON.parse(generated), direct = after.modules.find(m => m.name === "within-direct");
  assert.deepEqual(direct.enabledDecoders, ["h264"]); assert.equal(direct.probeDecoderThreads, 1);
  assert.equal(direct.maximumWasmMemoryBytes, 67108864);
  delete direct.enabledDecoders; delete direct.probeDecoderThreads;
  assert.deepEqual(after, before);
  assert.throws(() => makeH264ProbeDecoderManifest(Buffer.from("{}")));
});

test("Probe core must attest the actual compiled H264-only decoder and zero encoders", () => {
  const config = Buffer.from("#define CONFIG_H264_DECODER 1\n#define CONFIG_HEVC_DECODER 0\n#define CONFIG_H264_ENCODER 0\n");
  assert.deepEqual(assertH264ProbeDecoderConfig(config).enabledDecoders, ["h264"]);
  assert.throws(() => assertH264ProbeDecoderConfig(Buffer.from("")));
  assert.throws(() => assertH264ProbeDecoderConfig(Buffer.from(config.toString().replace("CONFIG_HEVC_DECODER 0", "CONFIG_HEVC_DECODER 1"))));
  assert.throws(() => assertH264ProbeDecoderConfig(Buffer.from(config.toString().replace("CONFIG_H264_DECODER 1", "CONFIG_H264_DECODER 0"))));
  assert.throws(() => assertH264ProbeDecoderConfig(Buffer.from(config.toString().replace("CONFIG_H264_ENCODER 0", "CONFIG_H264_ENCODER 1"))));
});

test("Probe decoder has its own authenticated branch; the larger tool cap does not relax old envelopes", () => {
  const runId = "1234", head = "a".repeat(40);
  const run = { id: 1234, workflow_id: 345162646, head_sha: head, head_branch: h264ProbeDecoderBuildRef,
    event: "workflow_dispatch", status: "completed", conclusion: "success" };
  const artifact = { name: "unpublished-mkv-edit-list-1234", expired: false, size_in_bytes: 3 * 1024 * 1024,
    workflow_run: { id: 1234, head_sha: head, head_branch: h264ProbeDecoderBuildRef }, digest: "sha256:" + "b".repeat(64) };
  checkMkvEditListArchive({ run, artifact }, runId, head, true, true, true);
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, true, true));
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, false, false, true));
  assert.throws(() => checkMkvEditListArchive({ run, artifact: { ...artifact, size_in_bytes: 8388609 } }, runId, head, true, true, true));
});

test("Probe build preserves executable permissions and retains real configuration before build scratch cleanup", async () => {
  const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const builder = await read("media/ffmpeg/build-mkv-edit-list-candidate.mjs");
  assert.match(builder, /writeFile\(replacement, library.generated, \{ flag: "wx", mode \}\)/);
  assert.match(builder, /assertH264ProbeDecoderConfig\(config\)/);
  assert.match(builder, /"config-components.h"/);
  assert.match(builder, /makeH264ProbeDecoderManifest\(artifacts\["build-manifest.json"\]\)/);
  const loader = await read("scripts/lib/mkv-edit-list-build-artifact.mjs");
  assert.match(loader, /assertH264ProbeDecoderConfig\(content\["config-components.h"\]\)/);
  assert.match(loader, /probeDecoderThreads, 1/);
  assert.match(loader, /readWasmMemoryLimits\(wasm\), readWasmMemoryLimits\(baseline\)/);
  const workflow = await read("media/ffmpeg/mkv-edit-list-nondocker.yml");
  assert.ok(workflow.includes(`refs/heads/${h264ProbeDecoderBuildRef}`));
  assert.match(workflow, /WITHIN_MKV_H264_PROBE_DECODER:/);
});

test("Actual probe-decoder browser run restores VFR, both AAC tracks and deterministic fault recovery", async () => {
  const read = file => readFile(new URL(`../${file}`, import.meta.url));
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const stem = "evidence/2026-11-14T10-33-21-625Z-mkv-exact-aac-complex";
  const bytes = await read(stem + ".json");
  assert.equal(sha(bytes), "70120713e776e87bd33799ed1c55cef795cb5e6509e68a9e13841a3f09c5e170");
  const report = JSON.parse(bytes), [arm] = report.arms;
  assert.equal(report.status, "passed-complex-exact-aac-direct-reuse-not-public-acceptance");
  assert.equal(report.h264ProbeDecoderCandidate, true);
  assert.equal(report.candidateBuild.head, "3000ccdc32b6ffaec770500f850327a7c46479db");
  assert.equal(report.candidateBuild.runId, "43585154631");
  assert.equal(report.candidateBuild.build.artifacts["within-direct.wasm"].sha256,
    "3d08c462c2075da150386de99b1408cfc72e0d2f21436c40153b95a6ff3148fc");
  assert.equal(report.candidateBuild.build.artifacts["build-manifest.json"].sha256, h264ProbeManifestSha256);
  assert.equal(report.candidateBuild.build.artifacts["build-libraries.sh"].sha256, h264ProbeLibrarySha256);
  const configPacked = await read(stem + "-compiled-config.h.gz");
  assert.equal(sha(configPacked), "7f337f2010a3b04df2f8a0523faa907a12b710f1d5b06b3f2feda82683127b62");
  const config = gunzipSync(configPacked, { maxOutputLength: 512 * 1024 });
  assert.equal(config.length, 75831);
  assert.deepEqual(assertH264ProbeDecoderConfig(config), { enabledDecoders: ["h264"],
    configSha256: report.candidateBuild.build.source.library.configSha256 });
  assert.deepEqual(arm.cases.map(row => row.state), ["complete", "cancelled", "error", "complete"]);
  const successful = [arm.cases[0], arm.cases[3]];
  assert.deepEqual(successful.map(row => row.metrics.elapsedMs), [528.3450000286102, 525.8999999761581]);
  for (const row of successful) {
    assert.ok(row.validation.candidateGate.passed && row.validation.fullDecode && row.outputRemoved);
    assert.equal(row.metrics.outputBytes, 782689);
    assert.equal(row.validation.outputSha256, "cb62dd3f503c942cffd8ffc2547c29a68e6010a3338f45da24d76f9da395847b");
    assert.equal(row.validation.outputProbe.streams[0].duration, "3.999000");
    assert.equal(row.validation.sourceDecodedHashes, row.validation.outputDecodedHashes);
    assert.equal(row.validation.sourceDecodedHashes.split(/\r?\n/).length, 3);
    const packets = row.validation.packets;
    assert.deepEqual(packets.packetCounts, [72, 189, 189]); assert.equal(packets.packetBytesIdentical, true);
    assert.deepEqual(packets.clocks.map(clock => clock.maximumPtsErrorUs), [0, 333, 333]);
    assert.deepEqual(packets.clocks.map(clock => clock.maximumComparableDtsErrorUs), [0, 333, 333]);
    assert.deepEqual(packets.aac.map(track => track.initialSkipSamples), [1024, 1024]);
    assert.deepEqual(packets.sourceCadenceMs, [41, 42, 83, 84]);
    assert.deepEqual(row.validation.serializedTimeline.tracks.map(track => track.edits[0].mediaTimeTicks), ["0", "1024", "1024"]);
    assert.ok(row.validation.structure.streamTitlesPreserved && row.validation.structure.titleAndCommentPreserved);
    assert.deepEqual(row.validation.structure.audioLanguages, ["eng", "spa"]);
    assert.equal(row.validation.structure.rotationDegrees, 90);
    assert.ok(row.validation.structure.subtitleDisclosed && row.validation.structure.attachmentDisclosed && row.validation.structure.chapterDisclosed);
    assert.equal(row.binding.convertedCopyCreated, false);
    assert.equal(row.metrics.peakWasmMemoryBytes, 24 * 1048576);
    assert.ok(row.metrics.maxReadChunkBytes <= 262144 && row.metrics.maxWriteChunkBytes <= 1048576);
    assert.ok(row.metrics.peakQueuedBytes <= 1048576); assert.equal(row.metrics.peakPendingOperations, 1);
    assert.equal(row.metrics.peakScratchBytes ?? 0, 0);
  }
  assert.deepEqual(arm.cases[1].cancellationBefore, { jobState: "running", outputBytes: 0, wasmResponseHeld: true });
  assert.match(arm.cases[2].error, /destination rejected a bounded write/);
  assert.ok(arm.cases.every(row => row.outputRemoved));
  const packed = await read(arm.archive.file); assert.equal(sha(packed), arm.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 2 * 1024 ** 2 }); assert.equal(sha(raw), arm.archive.decodedSha256);
  const memory = summarizeProtectedWindow(JSON.parse(raw), arm.memory, arm.blank.privateBytes);
  assert.equal(memory.incrementalPrivateMiB, 206.15234375);
  assert.equal(memory.validSamples, 142); assert.equal(memory.unavailableSamples, 0);
  assert.equal((arm.cleanupStable.privateBytes - arm.loaded.privateBytes) / 1048576, 62.75390625);
  assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && report.fixtureRuntimeRemoved && report.toolDownloadRemoved);
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(arm.browserCleanup.observedPids.length, 43);
  assert.deepEqual(arm.forbiddenRequests, []); assert.deepEqual(arm.failures, []); assert.deepEqual(report.failures, []);
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.equal(report.publicAcceptance, false); assert.equal(report.productionFilesReplaced, false);
  assert.equal(report.headed, false); assert.equal(report.nativeConversionUsed, false);
});
