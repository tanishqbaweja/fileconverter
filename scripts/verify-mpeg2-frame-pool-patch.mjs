// Source-only verification of a private allocation candidate, not conversion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const runtime = await createOwnedRuntimeScratch("mpeg2-frame-patch-check-");
try {
  const response = await fetch("https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/get_buffer.c",
    { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok);
  assert.ok(Number(response.headers.get("content-length") ?? 0) <= 32768);
  const data = new Uint8Array(await response.arrayBuffer());
  assert.ok(data.length <= 32768);
  assert.equal(createHash("sha256").update(data).digest("hex"),
    "38efe5e7fc627437306290919c8de3e2de5817d611b29d1f98e7ee6c12a8fb19");
  const before = new TextDecoder().decode(data);
  await mkdir(path.join(runtime.directory, "libavcodec"));
  const target = path.join(runtime.directory, "libavcodec/get_buffer.c");
  await writeFile(target, data, { flag: "wx" });
  const relativePatch = "media/ffmpeg/patches/mpeg2-encoder-uncached-frame-buffers.patch";
  const directory = path.relative(root, runtime.directory).replaceAll(path.sep, "/");
  await exec("git", ["apply", "--check", "--directory", directory, relativePatch],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000 });
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  const { stdout } = await exec(bash, ["--noprofile", "--norc", "-c",
    'patch --fuzz=0 --strip=1 --input "$1"', "patch-check", path.join(root, relativePatch).replaceAll("\\", "/")],
  { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 30000 });
  process.stdout.write(stdout);
  const after = await readFile(target, "utf8");
  // Recover every original byte by reverting only three audited substitutions.
  const restored = after.replace("    size_t buffer_size[4];\n", "")
    .replace("                pool->buffer_size[i] = size[i] + 16 + STRIDE_ALIGN - 1;\n" +
      "                pool->pools[i] = av_buffer_pool_init(pool->buffer_size[i],",
    "                pool->pools[i] = av_buffer_pool_init(size[i] + 16 + STRIDE_ALIGN - 1,")
    .replace("        // Private MPEG2 core: free inactive encoder planes on last unref.\n" +
      "        // Preserve upstream layout, padding, zeroing and all live references.\n" +
      "        // Decoder pools and codec algorithms remain unchanged.\n" +
      "        pic->buf[i] = av_codec_is_encoder(s->codec)\n" +
      "            ? (CONFIG_MEMORY_POISONING ? av_buffer_alloc(pool->buffer_size[i])\n" +
      "                                       : av_buffer_allocz(pool->buffer_size[i]))\n" +
      "            : av_buffer_pool_get(pool->pools[i]);",
    "        pic->buf[i] = av_buffer_pool_get(pool->pools[i]);");
  assert.equal(restored, before);
  process.stdout.write(`Private encoder-only cache candidate checked; patched source SHA256 ${createHash("sha256").update(after).digest("hex")}. No compiled fit/fidelity/speed claim.\n`);
} finally {
  await runtime.close();
  await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  process.stdout.write("Frame-patch source artifact and owned scratch removed.\n");
}
