import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeAudioOggArtworkCandidate } from "./audio-ogg-artwork-candidate.mjs";
import { makeAudioOggArtworkLowerCopyCore } from "./audio-ogg-artwork-lower-copy-core.mjs";
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/ffmpeg-nondocker-build");
assert.equal(process.argv.length, 2); assert.equal(await realpath(build), build);
const read = file => readFile(path.join(root, "media/ffmpeg", file), "utf8");
const parent = await readFile(path.join(build, "within_remux.parent.c"), "utf8");
const inputs = [parent, await read("audio-text-metadata.h"), await read("audio-muxer-metadata-order.h"), await read("audio-ogg-artwork.h"),
  { expectedParentSha256: "ff8926c995010617bcc76701f0ea75feb5a2c99dadb136d8b8d1c8703e5d6dcd" }];
const before = makeAudioOggArtworkCandidate(...inputs), after = makeAudioOggArtworkLowerCopyCore(...inputs);
const target = path.join(build, "within_remux.metadata.c"); assert.equal(await realpath(target), target);
assert.equal(await readFile(target, "utf8"), before.generated); await writeFile(target, after.generated);
console.log(JSON.stringify({ scope: after.scope, generatedSha256: after.generatedSha256, allowedSourceEdits: 14, publicAcceptance: false }));
