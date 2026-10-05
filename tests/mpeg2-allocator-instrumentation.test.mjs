import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { instrumentMpeg2Allocator } from "../scripts/lib/mpeg2-allocator-instrumentation.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("MPEG2 instrumentation requires exact audited kernel and delegates buffers without changing codec settings", async () => {
  const kernel = await read("media/ffmpeg/mpeg2-candidate.c");
  const header = await read("media/ffmpeg/mpeg2-allocator-diagnostic.h");
  const output = instrumentMpeg2Allocator(kernel, header);
  assert.match(output, /__real_avcodec_default_get_buffer2\(context, frame, flags\)/);
  assert.match(output, /sequence >= 96/);
  assert.match(output, /size_t buckets\[32\]/);
  assert.match(output, /mpeg2_allocator_snapshot\(7, p.encoder, NULL\)/);
  assert.match(output, /mpeg2_allocator_snapshot\(15, p->encoder, frame\)/);
  assert.doesNotMatch(header, /av_malloc|av_calloc|malloc\(|emmalloc_trim|resize_heap|ALLOW_MEMORY_GROWTH/);
  const stripped = output.slice(header.length + 1).split("\n")
    .filter((line) => !line.trim().startsWith("mpeg2_allocator_snapshot(")).join("\n");
  assert.equal(stripped, kernel, "remove only inserted snapshot calls to recover exact kernel");
  assert.throws(() => instrumentMpeg2Allocator(kernel + "\n", header));
});

test("MPEG2 generator diagnostic is opt-in, bounded and refuses unknown mode or existing output", async () => {
  const directory = await mkdtemp(path.join(root, "work/mpeg2-allocator-source-unit-"));
  const exec = promisify(execFile);
  try {
    const output = path.join(directory, "within_mpeg2.c");
    await exec(process.execPath, ["media/ffmpeg/make-mpeg2-candidate.mjs", output], {
      cwd: root, env: { ...process.env, WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC: "1" }, windowsHide: true });
    assert.match(await readFile(output, "utf8"), /__wrap_avcodec_default_get_buffer2/);
    await assert.rejects(exec(process.execPath, ["media/ffmpeg/make-mpeg2-candidate.mjs", output], {
      cwd: root, env: { ...process.env, WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC: "1" }, windowsHide: true }), /EEXIST/);
    await assert.rejects(exec(process.execPath, ["media/ffmpeg/make-mpeg2-candidate.mjs", output], {
      cwd: root, env: { ...process.env, WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC: "bad" }, windowsHide: true }), /must be 0 or 1/);
    const recipe = await read("media/ffmpeg/build-mpeg2-candidate.sh");
    assert.match(recipe, /--wrap=avcodec_default_get_buffer2/);
    assert.match(recipe, /WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC:-0/);
    assert.match(recipe, /mpeg2-allocator-instrumentation.mjs/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
