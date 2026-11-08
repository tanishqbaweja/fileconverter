// Reconstruct exactly the source recipe for the shipped specialist, without
// building or converting media. Fetch only bounded, pinned upstream C source.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { directWrapperSha256, makeMkvEditListTimelineCandidate } from "../media/ffmpeg/mkv-edit-list-timeline-candidate.mjs";

const root = path.resolve(import.meta.dirname, ".."), repo = "media/ffmpeg";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(path.join(root, file));
const execute = promisify(execFile);

// Match strip_current_general_core_only_profiles in reproduce-nondocker.sh.
function stripCurrentGeneralCoreOnly(source) {
  const keep = [];
  let depth = 0, keepingElse = false, stripped = 0;
  for (const line of source.split("\n")) {
    if (/^\s*#ifdef\s+(WITHIN_OGV_COPY|WITHIN_THEORA_ENCODE)\s*$/.test(line)) {
      assert.equal(depth, 0); depth = 1; keepingElse = false; stripped++; continue;
    }
    if (depth) {
      if (/^\s*#if(n?def)?(\s|$)/.test(line)) { depth++; if (keepingElse) keep.push(line); continue; }
      if (/^\s*#else(\s|$)/.test(line) && depth === 1) { keepingElse = true; continue; }
      if (/^\s*#endif(\s|$)/.test(line)) { if (--depth === 0) { keepingElse = false; continue; } }
      if (keepingElse) keep.push(line);
    } else keep.push(line);
  }
  assert.equal(depth, 0); assert.ok(stripped > 0);
  return keep.join("\n");
}

async function upstream(name, expectedSha256) {
  const url = `https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavformat/${name}`;
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok && response.body);
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length; assert.ok(bytes <= 512 * 1024, "Upstream source size limit"); chunks.push(chunk);
  }
  const source = Buffer.concat(chunks, bytes); assert.equal(digest(source), expectedSha256, name);
  return { url, bytes, sha256: expectedSha256, source: source.toString("utf8") };
}

assert.equal(process.argv.length, 2);
const manifest = JSON.parse(await read("public/engines/remux/build-manifest.json"));
const shippedSource = await read(`${repo}/within_remux.c`), originalSha256 = digest(shippedSource);
assert.equal(originalSha256, manifest.currentWrapperSourceSha256);
const recipe = await read(`${repo}/reproduce-nondocker.sh`);
const patches = ["mp4-webm-opus-priming-source.patch", "matroska-artwork-source.patch", "audio-options-source.patch",
  "direct-source-79e4db.patch", "direct-published-source.patch", "direct-mp4-only-source.patch"];
const expected = ["9eb4cbea6099787cd66be883003152d813751548902b0094ff1c04ee7ffca93a",
  "4fbd30dcbb199a338d7f36394543d811118227d754ad599ef42a2ace17f3c9b5",
  "cef5eb274e26b01554728231bece72723e45ccb4a46ac8c2933795e7d7d99134",
  "b8125f1277ba1e40541adc6c13540694c62cefe7c830631bf3b4eeceeb32597b",
  "b0b20712a1ad47a923de3cab7ced24c25cdeef46f70743ded439e88c892f2eaa", directWrapperSha256];
let source, cleaned = false;
const stages = [], scratch = await createOwnedRuntimeScratch("mkv-direct-source-audit-");
try {
  await writeFile(path.join(scratch.directory, "within_remux.c"), stripCurrentGeneralCoreOnly(shippedSource.toString("utf8")), { flag: "wx" });
  for (const [index, name] of patches.entries()) {
    const file = `${repo}/patches/${name}`, bytes = await read(file);
    assert.ok(bytes.length <= 512 * 1024);
    const direction = index < 4 ? "reverse" : "forward";
    const command = process.env.WITHIN_PATCH_EXECUTABLE ?? "patch";
    const { stdout } = await execute(command, ["--batch", "--no-backup-if-mismatch", ...(direction === "reverse" ? ["--reverse"] : []),
      "--input", path.join(root, file), "within_remux.c"], { cwd: scratch.directory, env: scratch.env, windowsHide: true, timeout: 15000, maxBuffer: 32768 });
    assert.doesNotMatch(stdout, /FAILED|malformed|Skipping|previously applied/i);
    source = await readFile(path.join(scratch.directory, "within_remux.c"));
    const sha256 = digest(source);
    assert.equal(sha256, expected[index]);
    stages.push({ patch: file, patchSha256: digest(bytes), direction, wrapperSha256: sha256 });
  }
} finally { await scratch.close(); cleaned = true; }

const current = source.toString("utf8"), marker = "int within_remux(int profile) {", offset = current.indexOf(marker);
assert.ok(offset > 0 && current.indexOf(marker, offset + marker.length) < 0);
const entry = current.slice(offset);
assert.match(entry, /\(void\)profile;\s+profile = 1;/);
assert.match(entry, /if \(profile != 1 && inspect_stream_info\) \{\s+result = avformat_find_stream_info/);
assert.match(entry, /AV_CODEC_ID_H264 \|\|\s+input_stream->codecpar->codec_id == AV_CODEC_ID_HEVC\)\) \{\s+synthesize_video_dts\[index\] = 1;/);
assert.match(entry, /reorder_delay < 1 &&\s+input_stream->codecpar->codec_id == AV_CODEC_ID_HEVC\) \{\s+reorder_delay = 2;/);
assert.match(entry, /packet_counts\[input_index\] - reorder_delay, frame_duration,\s+input_stream->time_base/);
assert.equal(entry.split("frag_keyframe+empty_moov+default_base_moof").length, 2);
assert.doesNotMatch(entry, /avoid_negative_ts|delay_moov|use_editlist/);
const candidate = makeMkvEditListTimelineCandidate(source);
assert.throws(() => makeMkvEditListTimelineCandidate(Buffer.concat([source, Buffer.from("\n")])), /Exact published/);
assert.notEqual(candidate.proof.candidateWrapperSha256, candidate.proof.baseWrapperSha256);
const [mov, mux] = await Promise.all([
  upstream("movenc.c", "d7aa80a99efecf757100dbd6d9d7adb84d263cbeed0603873206975405907068"),
  upstream("mux.c", "57b64d7a1d6d81d7ac05d79085e5f9b282bf1bba773b4200a64aeede6599b55a"),
]);
assert.match(mov.source, /mov->flags & FF_MOV_FLAG_FRAGMENT &&\s+!\(mov->flags & FF_MOV_FLAG_DELAY_MOOV\)[\s\S]{0,550}mov->use_editlist = 0;/);
assert.match(mov.source, /!mov->use_editlist && s->avoid_negative_ts == AVFMT_AVOID_NEG_TS_AUTO &&\s+!\(mov->flags & FF_MOV_FLAG_NEGATIVE_CTS_OFFSETS\)\)\s+s->avoid_negative_ts = AVFMT_AVOID_NEG_TS_MAKE_ZERO;/);
assert.match(mov.source, /!trk->entry && trk->start_dts == AV_NOPTS_VALUE && !mov->use_editlist &&\s+s->avoid_negative_ts == AVFMT_AVOID_NEG_TS_MAKE_ZERO[\s\S]{0,500}trk->cluster\[trk->entry\]\.dts = trk->start_dts = 0;/);
assert.match(mov.source, /\{ "use_editlist", "use edit list",/);
assert.match(mux.source, /int64_t ts = use_pts \? pkt->pts : pkt->dts;/);
assert.match(mux.source, /sti2->mux_ts_offset = av_rescale_q_rnd\(-ts, tb,/);
assert.match(mux.source, /pkt->dts \+= offset;\s+if \(pkt->pts != AV_NOPTS_VALUE\)\s+pkt->pts \+= offset;/);
const core = "public/engines/remux/within-direct.wasm", binarySha256 = digest(await read(core));
assert.equal(binarySha256, "306d44ccae312668190f6e43c6e51867981e75868c6c45a7267f1b24e3ce30d0");
const sources = [mov, mux].map(({ url, bytes, sha256 }) => ({ url, bytes, sha256 }));
console.log(JSON.stringify({ scope: "Source reconstruction and upstream cause, no media conversion or new native build",
  revision: "n8.1.2", originalSha256, recipeSha256: digest(recipe), stages, finalWrapperSha256: digest(source), binarySha256, sources,
  directPolicy: { nativeProfile: 1, flags: ["frag_keyframe", "empty_moov", "default_base_moof"],
    fallbackHevcReorderFrames: 2, predictedFirstDtsTicksAt24FpsAnd1kHz: -83, predictedCommonShiftUs: 83000,
    earlyMovNoEditMayMoveFirstSampleToZero: true }, candidate: candidate.proof, ownedScratchRemoved: cleaned }));
