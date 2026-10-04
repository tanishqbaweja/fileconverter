import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const work = path.join(root, "work");
const exec = promisify(execFile);
const source = (name) => readFile(path.join(root, "media/ffmpeg", name), "utf8");

test("private MPEG2 generator uses unchanged bounded AVIO and refuses existing/public targets", async () => {
  await mkdir(work, { recursive: true });
  const temporary = await mkdtemp(path.join(work, "mpeg2-source-unit-"));
  try {
    const file = path.join(temporary, "within_mpeg2.c");
    const generator = path.join(root, "media/ffmpeg/make-mpeg2-candidate.mjs");
    await exec(process.execPath, [generator, file], { windowsHide: true });
    const generated = await readFile(file, "utf8");
    assert.ok(generated.endsWith(await source("mpeg2-candidate.c")));
    assert.match(generated, /avcodec_find_encoder_by_name\("mpeg2video"\)/);
    assert.match(generated, /avio_alloc_context/);
    assert.match(generated, /within_output_truncate/);
    assert.match(generated, /within_output_flush/);
    assert.match(generated, /mpeg2_chapters\(out, in\)/);
    assert.match(generated, /coded_side_data/);
    assert.match(generated, /max_index_size = 32 \* 1024/);
    assert.match(generated, /bounded_no_cues/);
    const original = await source("within_remux.c");
    const headerReader = original.slice(original.indexOf("static uint16_t artwork_read_be16("),
      original.indexOf("static int bounded_audio_artwork_stream(const AVStream *stream) {"));
    assert.ok(generated.includes(headerReader), "reuse audited header reader byte-for-byte");
    assert.match(generated, /audio_artwork_dimensions\(source, &width, &height\)/);
    assert.match(generated, /destination->codecpar->width = width/);
    assert.match(generated, /destination->codecpar->height = height/);
    assert.match(generated, /refusing silent exclusion/);
    assert.match(generated, /"encoder", "Within FFmpeg MPEG-2"/);
    assert.equal((generated.match(/EMSCRIPTEN_KEEPALIVE/g) ?? []).length, 1);
    assert.equal(createHash("sha256").update(await source("within_remux.c")).digest("hex"),
      "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
    await assert.rejects(exec(process.execPath, [generator, file], { windowsHide: true }), /EEXIST/);
    await assert.rejects(exec(process.execPath, [generator, path.join(root, "public/within_mpeg2.c")],
      { windowsHide: true }), /Usage/);
  } finally {
    assert.ok(temporary.startsWith(`${work}${path.sep}`));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("MPEG2 candidate keeps timing, dimensions and format restrictions explicit", async () => {
  const kernel = await source("mpeg2-candidate.c");
  assert.match(kernel, /time_base = av_inv_q\(p.encoder->framerate\)/);
  assert.match(kernel, /strict_std_compliance = FF_COMPLIANCE_NORMAL/);
  assert.match(kernel, /rate_accumulator \+= p->rate_step/);
  assert.match(kernel, /rate_accumulator -= p->rate_threshold/);
  assert.match(kernel, /pts = p->encoded_count\+\+/);
  assert.match(kernel, /first_source_pts, p->source->time_base/);
  assert.match(kernel, /variable timing is not silently flattened/);
  assert.match(kernel, /full-range video is refused/);
  assert.match(kernel, /frame->width != p->source_width/);
  assert.match(kernel, /bit depth or chroma/);
  assert.match(kernel, /p.encoder->sample_aspect_ratio = av_mul_q/);
  assert.match(kernel, /destination->r_frame_rate = \(int\)i == video \? p.encoder->framerate/);
  assert.doesNotMatch(kernel, /fps_cap|allow_skip_frames|constrained_baseline|libopenh264/);
});

test("MPEG2 specialist recipe is pinned, fixed 32MiB, no external encoder or Docker, cleanup on failure", async () => {
  const recipe = await source("build-mpeg2-candidate.sh");
  assert.match(recipe, /ffmpeg-8\.1\.2\.tar\.xz/);
  assert.match(recipe, /464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c/);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=33554432" "-sMAXIMUM_MEMORY=33554432"/);
  assert.match(recipe, /--enable-encoder=mpeg2video/);
  assert.match(recipe, /--enable-decoder=h264,hevc,mpeg4,mpeg2video,theora,vp8,vp9/);
  assert.match(recipe, /--disable-network/);
  assert.match(recipe, /-sFILESYSTEM=0/);
  assert.match(recipe, /export TMPDIR="\$\{BUILD_ROOT\}\/tmp"/);
  assert.match(recipe, /export EM_CACHE="\$\{BUILD_ROOT\}\/emscripten-cache"/);
  assert.match(recipe, /trap cleanup EXIT/);
  assert.match(recipe, /"\$\{status\}" != 0/);
  assert.match(recipe, /available_kib >= 8388608/);
  assert.doesNotMatch(recipe, /libopenh264|--enable-gpl|--enable-nonfree|docker (run|build)|-ffast-math|-Ofast/);
  const workflow = await readFile(path.join(root, ".github/workflows/reproduce-ffmpeg-nondocker.yml"), "utf8");
  assert.match(workflow, /WITHIN_KEEP_MPEG2_CANDIDATE=1 bash media\/ffmpeg\/build-mpeg2-candidate.sh/);
  assert.match(workflow, /private-mpeg2-source-/);
  assert.match(workflow, /if: always\(\)/);
});

test("MPEG2 restoration child finishes before runtime deletion and the validator copy is bounded", async () => {
  const runner = await readFile(path.join(root, "scripts/validate-mpeg2-small.mjs"), "utf8");
  assert.match(runner, /createOwnedRuntimeScratch\("mpeg2-runtime-"\)/);
  assert.match(runner, /finally \{ if \(runtime\) await runtime.close\(\); \}/);
  assert.match(runner, /assert.rejects\(access\(runtime.directory\), \{ code: "ENOENT" \}\)/);
  assert.doesNotMatch(runner, /async \(\) => \{ if \(runtime\) await runtime.close/);
  const browser = await readFile(path.join(root, "tests/browser/mpeg2-candidate.spec.ts"), "utf8");
  assert.match(browser, /file.slice\(position, position \+ 65536\)/);
  assert.match(browser, /position \+= 65536/);
  assert.doesNotMatch(browser, /file.arrayBuffer\(\)/);
  assert.match(browser, /toBe\("mpeg2video"\)/);
  assert.match(browser, /toBeGreaterThanOrEqual\(0.98\)/);
  assert.match(browser, /short fixtures and non-stabilized baseline do not certify/);
});

test("private MP4 artwork does not trade away arbitrary text metadata", async () => {
  const kernel = await source("mpeg2-candidate.c");
  const recipe = await source("build-mpeg2-candidate.sh");
  const patch = await source("patches/mov-bounded-custom-metadata.patch");
  assert.doesNotMatch(kernel, /\+use_metadata_tags/);
  assert.match(kernel, /metadata_entries > 4096/);
  assert.match(kernel, /bytes > 2097152 - metadata_bytes/);
  assert.match(recipe, /d7aa80a99efecf757100dbd6d9d7adb84d263cbeed0603873206975405907068/);
  assert.match(recipe, /mov-bounded-custom-metadata.patch/);
  assert.match(patch, /ffio_wfourcc\(pb, "----"\)/);
  assert.match(patch, /ffio_wfourcc\(pb, "mean"\)/);
  assert.match(patch, /ffio_wfourcc\(pb, "name"\)/);
  assert.match(patch, /ffio_wfourcc\(pb, "data"\)/);
  assert.match(patch, /avio_wb32\(pb, 1\); \/\/ UTF-8 data type/);
  assert.match(patch, /av_dict_iterate\(s->metadata, entry\)/);
  const browser = await readFile(path.join(root, "tests/browser/mpeg2-artwork-candidate.spec.ts"), "utf8");
  assert.match(browser, /afterTags.website\).toBe\(beforeTags.website\)/);
  assert.match(browser, /afterTags\["custom_音楽"\]\).toBe\(beforeTags\["custom_音楽"\]\)/);
  assert.match(browser, /independent-pre-assertion-probes/);
});
