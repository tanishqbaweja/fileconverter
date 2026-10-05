import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";

const read = (f) => readFile(new URL(`../${f}`, import.meta.url), "utf8");
test("Private smaller AVIO reserves leave codec/kernel, public source and callback logic pinned", async () => {
  const kernel = await read("media/ffmpeg/mpeg2-candidate.c");
  assert.equal(createHash("sha256").update(kernel).digest("hex"), "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0");
  const original = await read("media/ffmpeg/within_remux.c");
  assert.equal(createHash("sha256").update(original).digest("hex"), "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
  assert.match(original, /requested < WITHIN_AVIO_BUFFER_SIZE/);
  assert.match(original, /remaining < WITHIN_AVIO_OUTPUT_BUFFER_SIZE/);
  assert.match(kernel, /input_buffer = av_malloc\(WITHIN_AVIO_BUFFER_SIZE\)/);
  assert.match(kernel, /output_buffer = av_malloc\(WITHIN_AVIO_OUTPUT_BUFFER_SIZE\)/);
  const generator = await read("media/ffmpeg/make-mpeg2-candidate.mjs");
  assert.match(generator, /originalBridge.split\(originalReserve\).length !== 2/);
  assert.match(generator, /bridge.replace\(candidateReserve, originalReserve\) !== originalBridge/);
  assert.match(generator, /#define WITHIN_AVIO_BUFFER_SIZE \(64 \* 1024\)/);
  const manifest = await read("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /avioInputBufferBytes: 65536, avioOutputBufferBytes: 65536/);
  assert.match(manifest, /Actual generated private AVIO reserves differ from 64KiB each/);
  assert.match(manifest, /generatedWrapper.includes\("#define WITHIN_AVIO_BUFFER_SIZE \(256 \* 1024\)"\)/);
  assert.equal(2 * 256 * 1024 - 2 * 64 * 1024, 393216);
  assert.match(manifest, /actual fit and crossing performance unproven/);
});
test("One private reserve substitution reverses to every original bridge byte in actual generated C", async () => {
  const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
  const runtime = await createOwnedRuntimeScratch("mpeg2-avio-source-unit-");
  try {
    const output = path.join(runtime.directory, "within_mpeg2.c");
    await exec(process.execPath, [path.join(root, "media/ffmpeg/make-mpeg2-candidate.mjs"), output],
      { cwd: root, env: { ...runtime.env, WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC: "0" }, windowsHide: true });
    const generated = await readFile(output, "utf8"), original = await read("media/ffmpeg/within_remux.c");
    const bridge = original.slice(0, original.indexOf("static int supported_audio_artwork_codec(enum AVCodecID codec_id);"))
      .replace("#include <libswresample/swresample.h>\n", "");
    const oldDefinition = "#define WITHIN_AVIO_BUFFER_SIZE (256 * 1024)", newDefinition = "#define WITHIN_AVIO_BUFFER_SIZE (64 * 1024)";
    const expected = bridge.replace(oldDefinition, newDefinition);
    assert.equal(generated.split(newDefinition).length, 2); assert.equal(generated.split(oldDefinition).length, 1);
    assert.equal(generated.slice(0, expected.length).replace(newDefinition, oldDefinition), bridge);
    assert.ok(generated.endsWith(await read("media/ffmpeg/mpeg2-candidate.c")));
    await assert.rejects(exec(process.execPath, [path.join(root, "media/ffmpeg/make-mpeg2-candidate.mjs"), output],
      { cwd: root, env: runtime.env, windowsHide: true }), /EEXIST/);
  } finally { await runtime.close(); }
});
