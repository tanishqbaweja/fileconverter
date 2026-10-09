// Native fixture qualification only, no browser conversion or published mutation.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), proofPath = "evidence/aiff-unicode-fixture-control-2026-10-10.json";
await assert.rejects(access(path.join(root, proofPath)), { code: "ENOENT" });
const runtime = await createOwnedRuntimeScratch("aiff-unicode-fixture-control-");
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), records = [];
const tags = { title: "Titre café — 音楽", artist: "Émile / कलाकार", album: "Album naïf", genre: "Essai", date: "2026", track: "3/9", comment: "αβγ & <texte>" };
const call = async (args, probe = false) => (await promisify(execFile)(probe ? "C:/ffmpeg/bin/ffprobe.exe" : "C:/ffmpeg/bin/ffmpeg.exe", args,
  { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout;
try {
  const cover = path.join(runtime.directory, "cover.png");
  await call(["-v", "error", "-i", path.join(root, "fixtures/media/audio-source-artwork.m4a"), "-map", "0:v:0", "-c:v", "copy", cover]);
  for (const [id, extra, author] of [["mdta-artist", ["-movflags", "use_metadata_tags"], false], ["mdta-author", ["-movflags", "use_metadata_tags"], true], ["standard-artist", [], false]]) {
    const metadata = { ...tags, ...(author ? { author: "Auteur indépendant Ω" } : {}) }, file = path.join(runtime.directory, id + ".m4a");
    await call(["-v", "error", "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=2", "-i", cover,
      "-map", "0:a:0", "-map", "1:v:0", "-c:a", "alac", "-c:v", "copy", "-disposition:v:0", "attached_pic",
      "-map_metadata", "-1", ...Object.entries(metadata).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
      "-fflags", "+bitexact", "-flags:a", "+bitexact", ...extra, file]);
    const probe = JSON.parse(await call(["-v", "error", "-show_streams", "-show_format", "-of", "json", file], true));
    const bytes = await readFile(file), pictures = probe.streams.filter(stream => stream.disposition?.attached_pic === 1);
    for (const [key, value] of Object.entries(metadata)) assert.equal(probe.format.tags[key], value);
    records.push({ id, sourceBytes: bytes.length, sourceSha256: sha(bytes), metadata, probe, attachedPictures: pictures.length });
  }
  assert.equal(records[0].attachedPictures, 0); assert.equal(records[1].attachedPictures, 0); assert.equal(records[2].attachedPictures, 1);
  const failed = JSON.parse(await readFile(path.join(root, "evidence/2026-10-09T22-34-37-518Z-aiff-id3-browser.json")));
  assert.equal(records[0].sourceSha256, failed.cases[1].sourceSha256, "Reproduce exact failed fixture, not an assumed native cause");
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
await writeFile(path.join(root, proofPath), JSON.stringify({ recordedAt: new Date().toISOString(),
  status: "actual-exact-failed-unicode-input-had-no-attached-artwork", records, ownedRuntimeRemoved: true,
  nativeToolsOnlyFixtureGenerationAndValidation: true, browserConversionsPerformed: 0,
  sourceSha256: sha(await readFile(new URL(import.meta.url))), publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, records: records.map(row => ({ id: row.id, pictures: row.attachedPictures })) }));
