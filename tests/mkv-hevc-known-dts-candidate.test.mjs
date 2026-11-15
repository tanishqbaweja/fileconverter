import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { makeHevcKnownDtsCandidate, makeHevcKnownDtsParser, makeHevcKnownDtsPrefix,
  hevcKnownDtsBuildRef, hevcKnownDtsWrapperSha256, hevcKnownDtsParserSha256, hevcKnownDtsPrefixSha256 } from "../media/ffmpeg/mkv-hevc-known-dts-candidate.mjs";
import { checkMkvEditListArchive } from "../scripts/lib/mkv-edit-list-build-artifact.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("HEVC clocks require exact authenticated parent sources and a bounded verified prefix; no guessed preimage", async () => {
  assert.throws(() => makeHevcKnownDtsCandidate(Buffer.from("unverified wrapper")), /Exact accepted H.264 startup wrapper/);
  assert.throws(() => makeHevcKnownDtsParser(Buffer.from("unverified parser")), /Exact FFmpeg/);
  const prefix = makeHevcKnownDtsPrefix(Buffer.from(await read("media/ffmpeg/h264-startup-prefix.inc")));
  assert.equal(prefix.sha256, hevcKnownDtsPrefixSha256);
  assert.equal(createHash("sha256").update(prefix.generated).digest("hex"), hevcKnownDtsPrefixSha256);
  assert.match(prefix.generated, /par->codec_id == AV_CODEC_ID_H264 \|\| par->codec_id == AV_CODEC_ID_HEVC/);
  assert.match(prefix.generated, /\+\+inspected_packets > 4096/); assert.match(prefix.generated, /2097152 - payload_bytes/);
  assert.match(prefix.generated, /side_data\[side\]\.size/); assert.match(prefix.generated, /within_is_cancelled\(\)/);
  assert.doesNotMatch(prefix.generated, /avg_frame_rate|r_frame_rate|->pts\s*=|synthesize_video_dts\[/);
});

test("HEVC parser patch exports validated SPS metadata without enabling a full HEVC decoder or larger Wasm", async () => {
  const source = await read("media/ffmpeg/mkv-hevc-known-dts-candidate.mjs");
  assert.match(source, /sps->temporal_layer\[sps->max_sub_layers - 1\]\.num_reorder_pics/);
  assert.match(source, /sps->max_sub_layers > HEVC_MAX_SUB_LAYERS/); assert.match(source, /avctx->has_b_frames > 16/);
  assert.match(source, /hevcNominalDtsSynthesis: false/); assert.match(source, /knownPacketClocksRewritten: false/);
  assert.match(source, /hevcDecoderAdded: false/); assert.match(source, /assert.equal\(reversed, original\)/);
  assert.doesNotMatch(source, /PENDING/);
  for (const hash of [hevcKnownDtsWrapperSha256, hevcKnownDtsParserSha256, hevcKnownDtsPrefixSha256]) assert.match(hash, /^[a-f0-9]{64}$/);
  const builder = await read("media/ffmpeg/build-mkv-edit-list-candidate.mjs");
  assert.match(builder, /assert.ok\(!hevcKnownDts \|\| startup\)/);
  assert.match(builder, /makeHevcKnownDtsParser\(await readBounded\(parserDirectory, "parser.c", 32768\)\)/);
  assert.match(builder, /"hevc-parser.c": 32768/); assert.match(builder, /initialPages: 384, maximumPages: 1024, shared: true/);
});

test("new HEVC native identity cannot masquerade as the accepted H264 startup branch", () => {
  const runId = "1234", head = "a".repeat(40);
  const run = { id: 1234, workflow_id: 345162646, head_sha: head, head_branch: hevcKnownDtsBuildRef,
    event: "workflow_dispatch", status: "completed", conclusion: "success" };
  const artifact = { name: "unpublished-mkv-edit-list-1234", expired: false, size_in_bytes: 900000,
    workflow_run: { id: 1234, head_sha: head, head_branch: hevcKnownDtsBuildRef }, digest: "sha256:" + "b".repeat(64) };
  checkMkvEditListArchive({ run, artifact }, runId, head, true, true, true, true, true);
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, true, true, true, true));
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, true, true, true, false, true));
  assert.throws(() => checkMkvEditListArchive({ run: { ...run, status: "in_progress" }, artifact }, runId, head, true, true, true, true, true));
});

test("isolated workflow and loader pin parser/wrapper/probe config while preserving old artifact contracts", async () => {
  const workflow = await read("media/ffmpeg/mkv-edit-list-nondocker.yml");
  assert.ok(workflow.includes(`refs/heads/${hevcKnownDtsBuildRef}`));
  assert.match(workflow, /WITHIN_MKV_HEVC_KNOWN_DTS:/); assert.match(workflow, /mkv-hevc-known-dts-candidate.test.mjs/);
  const loader = await read("scripts/lib/mkv-edit-list-build-artifact.mjs");
  assert.match(loader, /hevcKnownDts \? hevcKnownDtsPrefixSha256 : h264StartupPrefixSha256/);
  assert.match(loader, /sha256\(content\["hevc-parser.c"\]\), hevcKnownDtsParserSha256/);
  assert.match(loader, /assertH264ProbeDecoderConfig\(content\["config-components.h"\]\)/);
  assert.match(loader, /proof.source.hevcTimingPolicyUnchanged, !hevcKnownDts/);
});

test("new browser mode keeps exact failed input, full decoded content and old core guards separate", async () => {
  const harness = await read("scripts/qualify-mkv-direct-reuse.mjs");
  assert.match(harness, /--hevc-known-dts-loop-source-control/);
  assert.match(harness, /startupCore && !hevcKnownDts\) assertMkvStartupCore/);
  assert.match(harness, /loadMkvEditListBuildArtifact\(process.argv\[3\], process.argv\[4\], toolRuntime, exactAacCandidate, h264Vfr, probeDecoder, startupCore, hevcKnownDts\)/);
  assert.match(harness, /assert.equal\(report.fixture.sha256, prior.fixture.sha256\)/);
  assert.match(harness, /compareMkvGapAwareVideoPackets : compareMkvVideoPackets/);
  assert.match(harness, /assert.equal\(v.outputDecodedHashes, v.sourceDecodedHashes/);
  assert.match(harness, /sourceReorderDepth: baseline.probe.streams\[0\].has_b_frames/);
  assert.match(harness, /v.aac.initialSkipSamples, 1024/);
});
