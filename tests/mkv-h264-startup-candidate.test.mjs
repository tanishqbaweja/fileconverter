import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { makeH264StartupCandidate, h264StartupBuildRef, h264StartupWrapperSha256,
  h264StartupHeaderSha256, h264StartupPrefixSha256 } from "../media/ffmpeg/mkv-h264-startup-candidate.mjs";
import { checkMkvEditListArchive } from "../scripts/lib/mkv-edit-list-build-artifact.mjs";

const read = name => readFile(new URL(`../media/ffmpeg/${name}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("Startup arithmetic and prefix source are byte-pinned, bounded and refuse unrelated native preimages", async () => {
  const h = await read("h264-startup-dts.h"), p = await read("h264-startup-prefix.inc");
  assert.equal(sha(h), h264StartupHeaderSha256); assert.equal(sha(p), h264StartupPrefixSha256);
  assert.match(h264StartupWrapperSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => makeH264StartupCandidate(Buffer.from("unverified source"), h, p), /Exact previously tested probe core/);
  const header = h.toString(), prefix = p.toString();
  assert.match(header, /delay > WITHIN_H264_STARTUP_MAX_DELAY/);
  assert.match(header, /count != 2 \* delay \+ 1/);
  assert.match(header, /anchor != sorted\[0\]/);
  assert.match(header, /anchor < INT64_MIN \+ 1 \+ \(int64_t\)span/);
  assert.match(prefix, /\+\+inspected_packets > 4096/);
  assert.match(prefix, /next->size > 2097152 - payload_bytes/);
  assert.match(prefix, /side_data\[side\]\.size/);
  assert.match(prefix, /within_is_cancelled\(\)/);
  assert.match(prefix, /av_rescale_q\(2 \* AV_TIME_BASE/);
  assert.match(prefix, /for \(int i = 0; i < filled; i\+\+\) window\[i\]->dts = planned\[i\]/);
  assert.doesNotMatch(header + prefix, /avg_frame_rate|r_frame_rate|->pts\s*=|synthesize_video_dts\[/);
});

test("Startup candidate requires its own completed authenticated branch and cannot masquerade as the probe parent", () => {
  const runId = "1234", head = "a".repeat(40);
  const run = { id: 1234, workflow_id: 345162646, head_sha: head, head_branch: h264StartupBuildRef,
    event: "workflow_dispatch", status: "completed", conclusion: "success" };
  const artifact = { name: "unpublished-mkv-edit-list-1234", expired: false, size_in_bytes: 828001,
    workflow_run: { id: 1234, head_sha: head, head_branch: h264StartupBuildRef }, digest: "sha256:" + "b".repeat(64) };
  checkMkvEditListArchive({ run, artifact }, runId, head, true, true, true, true);
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, true, true, true));
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, true, true, false, true));
  assert.throws(() => checkMkvEditListArchive({ run: { ...run, status: "in_progress" }, artifact }, runId, head, true, true, true, true));
});

test("Isolated startup build keeps published files, probe/heap limits and helper smoke independent of media conversion", async () => {
  const builder = (await read("build-mkv-edit-list-candidate.mjs")).toString();
  assert.match(builder, /makeH264StartupCandidate\(Buffer.from\(derived.generated\)/);
  assert.match(builder, /assert.ok\(!startup \|\| probeDecoder\)/);
  assert.match(builder, /initialPages: 384, maximumPages: 1024, shared: true/);
  assert.match(builder, /Published artifacts must stay byte-exact/);
  const workflow = (await read("mkv-edit-list-nondocker.yml")).toString();
  assert.ok(workflow.includes(`refs/heads/${h264StartupBuildRef}`));
  assert.match(workflow, /WITHIN_MKV_H264_STARTUP:/);
  assert.match(workflow, /node scripts\/test-h264-startup-smoke.mjs/);
  const runner = (await readFile(new URL("../scripts/test-h264-startup-smoke.mjs", import.meta.url))).toString();
  assert.match(runner, /windowsHide: true/); assert.match(runner, /finally \{ await runtime.close\(\)/);
  assert.doesNotMatch(runner, /ffmpeg\.exe|ffprobe\.exe|test\.mkv|\.mp4|libavformat/);
});
