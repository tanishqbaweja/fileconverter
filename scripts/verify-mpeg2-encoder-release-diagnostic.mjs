// Pinned source audit and zero-fuzz reversible addition; never converts media.
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
  "libavcodec/mpegvideo_enc.c": "17eddac164020668201e0b6d25140cf1328db6ba953559587240d8c73199289f",
  "libavcodec/mpegpicture.c": "209b4d7dfe1b5f0f5442180ece190e4190cf126b7e4dd196713b293fd1ed25a2",
  "libavcodec/mpegvideo.c": "80e1e8455035bd95de6fd051d54a4814db5c791811757cfaaaba16f422595ca4",
  "libavutil/refstruct.c": "d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f",
};
const runtime = await createOwnedRuntimeScratch("mpeg2-encoder-release-source-check-");
try {
  const sources = Object.fromEntries(await Promise.all(Object.entries(pins).map(async ([file, hash]) => {
    const response = await fetch(`https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/${file}`,
      { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok); assert.ok(Number(response.headers.get("content-length") ?? 0) <= 262144);
    const bytes = new Uint8Array(await response.arrayBuffer()); assert.ok(bytes.length <= 262144);
    assert.equal(sha(bytes), hash, file);
    return [file, new TextDecoder().decode(bytes)];
  })));
  const picture = sources["libavcodec/mpegpicture.c"];
  assert.match(picture, /static void mpv_pic_reset[\s\S]*?av_frame_unref\(pic->f\)/);
  for (const name of ["mbskip_table", "qscale_table_base", "mb_type_base", "motion_val_base\\[i\\]", "ref_index\\[i\\]"])
    assert.match(picture, new RegExp(`av_refstruct_unref\\(&pic->${name}\\)`));
  const refstruct = sources["libavutil/refstruct.c"];
  assert.match(refstruct, /ref->free_cb\(ref->opaque, obj\);\s*ref->free\(ref\)/);
  assert.match(refstruct, /ref->opaque.nc = pool->available_entries;\s*pool->available_entries = ref/);
  const before = sources["libavcodec/mpegvideo_enc.c"];
  const relativePatch = "media/ffmpeg/patches/mpeg2-encoder-pool-release-diagnostic.patch";
  const patch = await readFile(path.join(root, relativePatch), "utf8");
  await mkdir(path.join(runtime.directory, "libavcodec"));
  const target = path.join(runtime.directory, "libavcodec/mpegvideo_enc.c");
  await writeFile(target, before, { flag: "wx" });
  const directory = path.relative(root, runtime.directory).replaceAll(path.sep, "/");
  await exec("git", ["apply", "--check", "--directory", directory, relativePatch],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000 });
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  const { stdout } = await exec(bash, ["--noprofile", "--norc", "-c",
    'patch --fuzz=0 --strip=1 --input "$1"', "release-patch-check", path.join(root, relativePatch).replaceAll("\\", "/")],
  { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 30000 });
  const after = await readFile(target, "utf8");
  const additions = [], lines = patch.split("\n");
  let block = [];
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) block.push(line.slice(1));
    else if (block.length) { additions.push(block.join("\n") + "\n"); block = []; }
  }
  assert.equal(block.length, 0); assert.equal(additions.length, 2);
  assert.equal(lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length, 0);
  let recovered = after;
  for (const added of additions) { assert.equal(recovered.split(added).length, 2); recovered = recovered.replace(added, ""); }
  assert.equal(recovered, before, "Removing only declaration and scalar call recovers every upstream byte");
  assert.match(after, /ff_mpv_unref_picture\(&s->c.cur_pic\);\s*if \(avctx->codec_id == AV_CODEC_ID_MPEG2VIDEO && avctx->thread_count == 1\)\s*within_mpeg2_encoder_pool_release_diagnostic/);
  process.stdout.write(`${stdout}\n${JSON.stringify({ sourcePins: pins, patchSha256: sha(patch), patchedEncoderSha256: sha(after),
    additionOnly: true, reversalByteIdentical: true, scope: "Source check, not compiled or measured conversion" }, null, 2)}\n`);
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  process.stdout.write("Owned source-check scratch removed.\n");
}
