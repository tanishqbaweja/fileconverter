// Diagnose a source-pinned build patch only; never a media conversion path.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const runtime = await createOwnedRuntimeScratch("mpeg2-mov-patch-check-");
try {
  const muxResponse = await fetch("https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavformat/mux.c",
    { signal: AbortSignal.timeout(30000) });
  assert.ok(muxResponse.ok);
  assert.ok(Number(muxResponse.headers.get("content-length") ?? 0) <= 512 * 1024);
  const muxData = new Uint8Array(await muxResponse.arrayBuffer());
  assert.ok(muxData.length <= 512 * 1024);
  assert.equal(createHash("sha256").update(muxData).digest("hex"),
    "57b64d7a1d6d81d7ac05d79085e5f9b282bf1bba773b4200a64aeede6599b55a");
  const mux = new TextDecoder().decode(muxData);
  assert.match(mux, /av_dict_set\(&s->metadata, "encoder", NULL, 0\)/);
  assert.match(mux, /av_dict_get\(s->metadata, "encoder-", e, AV_DICT_IGNORE_SUFFIX\)/);
  assert.match(mux, /fci->initialized = 1/);
  assert.match(mux, /if \(!already_initialized\)\s+if \(\(ret = avformat_init_output\(s, options\)\) < 0\)/);
  process.stdout.write("Pinned mux init strips source provenance once; explicit init prevents repeated removal.\n");
  const response = await fetch("https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavformat/movenc.c",
    { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok);
  assert.ok(Number(response.headers.get("content-length") ?? 0) <= 512 * 1024);
  const data = new Uint8Array(await response.arrayBuffer());
  assert.ok(data.length <= 512 * 1024, "Pinned build-source artifact size cap");
  assert.equal(createHash("sha256").update(data).digest("hex"),
    "d7aa80a99efecf757100dbd6d9d7adb84d263cbeed0603873206975405907068");
  await mkdir(path.join(runtime.directory, "libavformat"));
  await writeFile(path.join(runtime.directory, "libavformat/movenc.c"), data, { flag: "wx" });
  const directory = path.relative(root, runtime.directory).replaceAll(path.sep, "/");
  // Check/apply the exact sequence to this owned source artifact only, using
  // the same GNU implementation and zero-fuzz gate as the hosted build.
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  let metadataStage = null;
  for (const name of ["mov-fragmented-cover-metadata-only.patch", "mov-bounded-custom-metadata.patch",
    "mov-fragmented-aac-exact-priming.patch"]) {
    const relative = `media/ffmpeg/patches/${name}`;
    await exec("git", ["apply", "--check", "--directory", directory, relative],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000 });
    const patchPath = path.join(root, relative).replaceAll("\\", "/");
    const { stdout } = await exec(bash, ["--noprofile", "--norc", "-c",
      'patch --fuzz=0 --strip=1 --input "$1"', "patch-check", patchPath],
    { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 30000 });
    process.stdout.write(stdout);
    if (name === "mov-bounded-custom-metadata.patch")
      metadataStage = await readFile(path.join(runtime.directory, "libavformat/movenc.c"), "utf8");
  }
  const after = await readFile(path.join(runtime.directory, "libavformat/movenc.c"), "utf8");
  const restored = after.replace(
    "    // Private fragmented MP4: retain copied AAC priming at sample precision.\n" +
    "    // A rounded/positive first DTS alone does not encode the decoder trim.\n" +
    "    const int exact_aac_priming = mov->mode == MODE_MP4 &&\n" +
    "        (mov->flags & FF_MOV_FLAG_FRAGMENT) &&\n" +
    "        track->par->codec_id == AV_CODEC_ID_AAC &&\n" +
    "        track->par->initial_padding > 0 && track->par->sample_rate > 0;\n" +
    "    if (exact_aac_priming)\n" +
    "        start_ct = FFMAX(start_ct, av_rescale(track->par->initial_padding,\n" +
    "            track->timescale, track->par->sample_rate));\n\n", "")
    .replace("        start_ct = exact_aac_priming\n" +
      "            ? FFMAX(start_ct, -FFMIN(start_dts, 0))\n" +
      "            : -FFMIN(start_dts, 0);", "        start_ct  = -FFMIN(start_dts, 0);");
  assert.equal(restored, metadataStage, "Revert only AAC edit-list arithmetic; every other source byte unchanged");
  assert.equal(createHash("sha256").update(metadataStage).digest("hex"),
    "e2d80222a7e8f4c42257540ed9ea011c6a8be7ac447cbf4ed60dae758319f509");
  assert.equal(createHash("sha256").update(after).digest("hex"),
    "f93e901eef7867d56373d07afc32237e051f28cf64b2d9a0bca2474a36c0fcad");
  process.stdout.write(`Metadata-stage SHA ${createHash("sha256").update(metadataStage).digest("hex")}; AAC-patched SHA ${createHash("sha256").update(after).digest("hex")}.\n`);
  process.stdout.write("Pinned mov patch sequence passes git checks and GNU zero-fuzz application.\n");
} finally {
  await runtime.close();
  await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  process.stdout.write("Patch-check source artifact and owned scratch removed.\n");
}
