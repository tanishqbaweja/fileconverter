import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { h264VfrBuildRef, h264VfrWrapperSha256, makeMkvH264VfrCandidate } from "../media/ffmpeg/mkv-h264-vfr-candidate.mjs";
import { checkMkvEditListArchive } from "../scripts/lib/mkv-edit-list-build-artifact.mjs";

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
