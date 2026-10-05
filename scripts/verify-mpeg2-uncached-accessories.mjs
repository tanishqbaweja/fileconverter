// Source audit only; the actual compiled lifecycle smoke is a separate gate.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pins = {
  "libavutil/refstruct.c": "d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f",
  "libavutil/refstruct.h": "8e7be80109d14fce52e3de7a30932efea283abe963ccdd755787e219a4699b19",
  "libavcodec/mpegvideo.c": "80e1e8455035bd95de6fd051d54a4814db5c791811757cfaaaba16f422595ca4",
};
const patchName = "media/ffmpeg/patches/mpeg2-encoder-uncached-accessories.patch";
const readerPatch = "media/ffmpeg/patches/refstruct-readonly-pool-diagnostic.patch";
const runtime = await createOwnedRuntimeScratch("mpeg2-accessory-source-check-");
try {
  const sources = Object.fromEntries(await Promise.all(Object.entries(pins).map(async ([file, hash]) => {
    const response = await fetch(`https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/${file}`,
      { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok); assert.ok(Number(response.headers.get("content-length") ?? 0) <= 262144);
    const bytes = new Uint8Array(await response.arrayBuffer()); assert.ok(bytes.length <= 262144);
    assert.equal(sha(bytes), hash, file);
    return [file, new TextDecoder().decode(bytes)];
  })));
  const header = sources["libavutil/refstruct.h"];
  const upstreamFlags = [...header.matchAll(/^#define AV_REFSTRUCT(?:_POOL)?_FLAG_\w+\s+\(1 << (\d+)\)/gm)];
  assert.ok(upstreamFlags.length >= 4); assert.ok(upstreamFlags.every((x) => Number(x[1]) !== 30));
  await Promise.all(["libavutil", "libavcodec"].map((dir) => mkdir(path.join(runtime.directory, dir))));
  for (const [file, text] of Object.entries(sources))
    await writeFile(path.join(runtime.directory, file), text, { flag: "wx" });
  const directory = path.relative(root, runtime.directory).replaceAll(path.sep, "/");
  await exec("git", ["apply", "--check", "--directory", directory, patchName],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000 });
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  const apply = async (name, reverse = false) => exec(bash, ["--noprofile", "--norc", "-c",
    `patch --fuzz=0 --strip=1 ${reverse ? "--reverse " : ""}--input "$1"`, "accessory-patch-check",
    path.join(root, name).replaceAll("\\", "/")],
  { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 30000 });
  const { stdout } = await apply(patchName);
  const files = ["libavutil/refstruct.c", "libavcodec/mpegvideo.c"];
  const patched = Object.fromEntries(await Promise.all(files.map(async (file) =>
    [file, await readFile(path.join(runtime.directory, file), "utf8")])));
  const ref = patched[files[0]], mpeg = patched[files[1]];
  assert.match(ref, /if \(!pool->uninited && !\(pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED\)\)/);
  assert.equal(ref.replace("/* Private pinned-build bit; used only by single-thread MPEG2 encoders. */\n#define WITHIN_MPEG2_POOL_UNCACHED (1u << 30)\n\n", "")
    .replace("if (!pool->uninited && !(pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED))", "if (!pool->uninited)"), sources[files[0]]);
  assert.match(mpeg, /s->encoding && s->codec_id == AV_CODEC_ID_MPEG2VIDEO && \\\n\s*s->avctx->thread_count == 1/);
  assert.equal(mpeg.replace("/* Private pinned-build bit; default/decoder/other encoder pools unchanged. */\n#define WITHIN_MPEG2_POOL_UNCACHED (1u << 30)\n", "")
    .replace(/av_refstruct_pool_alloc\(\(size\), \(flags\) \| \\\n\s*\(s->encoding && s->codec_id == AV_CODEC_ID_MPEG2VIDEO && \\\n\s*s->avctx->thread_count == 1 \? \\\n\s*WITHIN_MPEG2_POOL_UNCACHED : 0\)\)/, "av_refstruct_pool_alloc((size), (flags))"), sources[files[1]]);
  await apply(readerPatch);
  const diagnosticSha256 = sha(await readFile(path.join(runtime.directory, files[0])));
  await apply(readerPatch, true); await apply(patchName, true);
  for (const file of files) assert.equal(await readFile(path.join(runtime.directory, file), "utf8"), sources[file]);
  process.stdout.write(`${stdout}\n${JSON.stringify({ sourcePins: pins,
    patchSha256: sha(await readFile(path.join(root, patchName))),
    patchedSources: Object.fromEntries(files.map((file) => [file, sha(patched[file])])),
    diagnosticRefstructSha256: diagnosticSha256, reversalByteIdentical: true,
    scope: "source only, not compiled lifecycle, fit or performance acceptance" }, null, 2)}\n`);
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  process.stdout.write("Owned accessory source-check scratch removed.\n");
}
