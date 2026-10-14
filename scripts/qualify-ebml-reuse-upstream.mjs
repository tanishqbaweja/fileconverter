// Verify the released archive, not just a mutable tag URL. Retain small source
// preimages; downloaded archive and all extraction scratch are finally removed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { createWriteStream } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeEbmlReuseSource } from "../media/ffmpeg/mpeg2-ebml-reuse-source.mjs";
import { EBML_REUSE_NATIVE_FILES } from "../media/ffmpeg/mpeg2-ebml-reuse-builder-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), sha = data => createHash("sha256").update(data).digest("hex");
const files = [...EBML_REUSE_NATIVE_FILES, "scripts/qualify-ebml-reuse-upstream.mjs"];
const sourcePins = {}, sourcePreimages = {};
for (const file of files) {
  const data = await readFile(path.join(root, file));
  sourcePins[file] = sha(data); sourcePreimages[file] = data.toString("base64");
}
const runtime = await createOwnedRuntimeScratch("ebml-upstream-source-");
let receipt;
try {
  const url = "https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz";
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) }); assert.equal(response.status, 200);
  const archive = path.join(runtime.directory, "ffmpeg.tar.xz"), digest = createHash("sha256");
  let archiveBytes = 0;
  await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, encoding, callback) {
    archiveBytes += chunk.length;
    if (archiveBytes > 16 * 1048576) return callback(new Error("Upstream source archive exceeds download budget"));
    digest.update(chunk); callback(null, chunk);
  } }), createWriteStream(archive, { flags: "wx" }));
  const archiveSha256 = digest.digest("hex");
  assert.equal(archiveSha256, "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c");
  const upstreamSources = {};
  for (const name of ["libavformat/matroskadec.c", "libavutil/buffer.c"]) {
    const result = spawnSync("tar.exe", ["-xOf", archive, "ffmpeg-8.1.2/" + name],
      { cwd: root, env: runtime.env, windowsHide: true, encoding: "utf8", maxBuffer: 524288, timeout: 30000 });
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
    upstreamSources[name] = { bytes: Buffer.byteLength(result.stdout), sha256: sha(result.stdout), source: result.stdout };
  }
  assert.equal(upstreamSources["libavutil/buffer.c"].sha256, "810049e1ac054af6870a5c58c02903f29a210732ecfe724b79ece8c8a18ad2ac");
  const recipe = makeEbmlReuseSource(upstreamSources["libavformat/matroskadec.c"].source);
  const postSourcePins = {};
  for (const file of files) postSourcePins[file] = sha(await readFile(path.join(root, file)));
  assert.deepEqual(postSourcePins, sourcePins);
  const raw = Buffer.from(JSON.stringify({ upstreamSources, sourcePreimages })), compressed = gzipSync(raw, { level: 9 });
  assert.deepEqual(gunzipSync(compressed), raw); assert.ok(compressed.length < 1048576);
  const sourceArchive = "outputs/reports/mpeg2-ebml-reuse-upstream-8.1.2.json.gz";
  await writeFile(path.join(root, sourceArchive), compressed, { flag: "wx" });
  assert.equal((await stat(path.join(root, sourceArchive))).size, compressed.length);
  assert.equal(sha(await readFile(path.join(root, sourceArchive))), sha(compressed));
  receipt = { recordedAt: new Date().toISOString(), scope: "released-upstream-source-transform-not-conversion",
    url, archiveBytes, archiveSha256, sourceArchive, compressedBytes: compressed.length, compressedSha256: sha(compressed),
    restoredBytes: raw.length, restoredSha256: sha(raw), sourcePins, postSourcePins,
    upstreamSources: Object.fromEntries(Object.entries(upstreamSources).map(([file, { bytes, sha256 }]) => [file, { bytes, sha256 }])),
    recipe, actualWasmBuildPerformed: false, browserConversions: 0, originalVideoRead: false,
    publicAcceptance: false, fullOriginalCompleted: false, speedGainProven: false };
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
receipt.ownedScratchAbsent = true;
const proof = "evidence/mpeg2-ebml-reuse-upstream-2026-10-14.json";
await writeFile(path.join(root, proof), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proof, archiveBytes: receipt.archiveBytes, generatedSha256: receipt.recipe.generatedSha256,
  retainedBytes: receipt.compressedBytes, ownedScratchAbsent: true }));
