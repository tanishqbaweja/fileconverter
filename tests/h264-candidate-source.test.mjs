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
const generator = path.join(root, "media/ffmpeg/make-h264-candidate.mjs");

test("private H264 kernel derives audited bounded AVIO without mutating existing engines", async () => {
  await mkdir(work, { recursive: true });
  const temporary = await mkdtemp(path.join(work, "h264-source-unit-"));
  try {
    const file = path.join(temporary, "within_h264.c");
    await exec(process.execPath, [generator, file], { windowsHide: true });
    const generated = await readFile(file, "utf8");
    const kernel = await readFile(path.join(root, "media/ffmpeg/h264-candidate.c"), "utf8");
    assert.ok(generated.endsWith(kernel));
    assert.match(generated, /avcodec_find_encoder_by_name\("libopenh264"\)/);
    assert.match(generated, /frame->best_effort_timestamp/);
    assert.match(generated, /avcodec_parameters_copy/);
    assert.match(generated, /h264_chapters\(out, in\)/);
    assert.match(generated, /coded_side_data/);
    assert.match(generated, /allow_skip_frames", "0"/);
    assert.match(generated, /output_io->error < 0/);
    assert.equal((generated.match(/EMSCRIPTEN_KEEPALIVE/g) ?? []).length, 1);
    assert.equal(createHash("sha256").update(await readFile(path.join(root, "media/ffmpeg/within_remux.c"))).digest("hex"),
      "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
    await assert.rejects(exec(process.execPath, [generator, file], { windowsHide: true }), /EEXIST/);
    await assert.rejects(exec(process.execPath, [generator, path.join(root, "public/within_h264.c")], { windowsHide: true }), /Usage/);
  } finally {
    assert.ok(temporary.startsWith(`${work}${path.sep}`));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("candidate recipe pins sources, fixed memory, no Docker, local caches and finally cleanup", async () => {
  const recipe = await readFile(path.join(root, "media/ffmpeg/build-h264-candidate.sh"), "utf8");
  assert.match(recipe, /652bdb7719f30b52b08e506645a7322ff1b2cc6f/);
  assert.match(recipe, /7a060916a9fcb63ba51d83a4f2388660c0b58797be547c4fa5c52e8d65660a85/);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864/);
  assert.match(recipe, /-sFILESYSTEM=0/);
  assert.match(recipe, /export TMPDIR="\$\{BUILD_ROOT\}\/tmp"/);
  assert.match(recipe, /export EM_CACHE="\$\{BUILD_ROOT\}\/emscripten-cache"/);
  assert.match(recipe, /export EM_PKG_CONFIG_PATH="\$\{PREFIX\}\/lib\/pkgconfig"/);
  assert.match(recipe, /trap cleanup EXIT/);
  assert.match(recipe, /available_kib >= 8388608/);
  assert.doesNotMatch(recipe, /docker (run|build)|--enable-gpl|--enable-nonfree/);
  const workflow = await readFile(path.join(root, ".github/workflows/reproduce-ffmpeg-nondocker.yml"), "utf8");
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f/);
});
