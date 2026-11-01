// Mutates only the fresh, hash-pinned FFmpeg checkout owned by this build.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/webcodecs-vp9-build");
assert.equal(await realpath(build), build);
const ffmpeg = path.join(build, "ffmpeg-8.1.2"); assert.equal(await realpath(ffmpeg), ffmpeg);
assert.ok(!(await lstat(ffmpeg)).isSymbolicLink());
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(sha(await readFile(path.join(root, "media/ffmpeg/within_remux.c"))), "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068",
  "Do not change the existing AVIO/demux/decode/mux wrapper for this candidate");
const edits = [
  ["libavcodec/Makefile", "OBJS-$(CONFIG_WRAPPED_AVFRAME_ENCODER)", "OBJS-$(CONFIG_WITHIN_WEBCODECS_VP9_ENCODER) += within_webcodecs_vp9.o\n"],
  ["libavcodec/allcodecs.c", "extern const FFCodec ff_wrapped_avframe_encoder;", "extern const FFCodec ff_within_webcodecs_vp9_encoder;\n"],
];
const results = [];
for (const [file, anchor, line] of edits) {
  const target = path.join(ffmpeg, file); assert.equal(await realpath(target), target);
  const before = await readFile(target, "utf8"); assert.equal(before.split(anchor).length, 2); assert.ok(!before.includes(line));
  const after = before.replace(anchor, line + anchor); assert.equal(after.replace(line, ""), before);
  await writeFile(target, after); results.push({ file, beforeSha256: sha(before), afterSha256: sha(after), addedLine: line.trim() });
}
await copyFile(path.join(root, "media/ffmpeg/within_webcodecs_vp9.c"), path.join(ffmpeg, "libavcodec/within_webcodecs_vp9.c"));
await writeFile(path.join(root, "work/webcodecs-vp9-output/registration.json"), JSON.stringify({
  sourceArchiveSha256: "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c", edits: results,
  codecAlgorithmsChanged: false, nativeWrapperChanged: false, publicAcceptance: false,
}, null, 2) + "\n", { flag: "wx" });
