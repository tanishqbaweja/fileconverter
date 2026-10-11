// Patch only the fresh isolated FFmpeg build's two regular source files.
import assert from "node:assert/strict";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { applyHevcSingleIdleGetBuffer, makeHevcSingleIdleBuffer, makeHevcPlaneSmoke } from "./mpeg2-hevc-plane-source.mjs";
assert.equal(process.platform, "linux"); assert.equal(process.argv.length, 4);
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/mpeg2-split-pipeline-build");
const files = [path.join(build, "ffmpeg/libavutil/buffer.c"), path.join(build, "ffmpeg/libavcodec/get_buffer.c")];
assert.deepEqual(process.argv.slice(2), files);
const original = [], identities = [];
for (const file of files) {
  assert.equal(await realpath(file), file); const identity = await lstat(file, { bigint: true });
  assert.ok(identity.isFile() && !identity.isSymbolicLink() && identity.size <= 32768n);
  identities.push(identity); original.push(await readFile(file, "utf8"));
}
const generated = [makeHevcSingleIdleBuffer(original[0]), applyHevcSingleIdleGetBuffer(original[1])];
try {
  for (let i = 0; i < files.length; i++) { await writeFile(files[i], generated[i]); assert.equal(sha(await readFile(files[i])), sha(generated[i])); }
} catch (error) {
  for (let i = 0; i < files.length; i++) {
    const current = await lstat(files[i], { bigint: true }); assert.equal(current.dev, identities[i].dev); assert.equal(current.ino, identities[i].ino);
    await writeFile(files[i], original[i]); assert.equal(sha(await readFile(files[i])), sha(original[i]));
  }
  throw error;
}
const smoke = makeHevcPlaneSmoke(await readFile(path.join(root, "media/ffmpeg/mpeg2-encoder-plane-smoke.c"), "utf8"));
await writeFile(path.join(build, "hevc-plane-smoke.c"), smoke.generated, { flag: "wx" });
console.log(JSON.stringify({ scope: "fresh-build-source-only", bufferSha256: sha(generated[0]), getBufferSha256: sha(generated[1]), smokeSha256: sha(smoke.generated) }));
