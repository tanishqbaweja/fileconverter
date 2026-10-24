// Code generation only inside the explicitly owned private native build tree.
import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { AUDIO_COMMENT_FFMPEG_ARCHIVE_SHA256, makeAudioRepeatedCommentCandidate } from "./audio-repeated-comment-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/ffmpeg-nondocker-build"), output = path.join(root, "work/ffmpeg-nondocker-output");
assert.equal(process.argv.length, 2); assert.equal(await realpath(build), build); assert.equal(await realpath(output), output);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(sha(await readFile(path.join(root, "media/ffmpeg/reproduce-nondocker.sh"))), "6323620da9f7046d440aac362cd3211f21e4e19a679cd3c4b2f09182cb457f5e");
const file = path.join(build, "ffmpeg/libavformat/oggparsevorbis.c"); assert.equal(await realpath(file), file);
const source = await readFile(file, "utf8"), candidate = makeAudioRepeatedCommentCandidate(source, { sourceArchiveSha256: AUDIO_COMMENT_FFMPEG_ARCHIVE_SHA256 });
await writeFile(path.join(output, "oggparsevorbis.parent.c"), source, { flag: "wx" });
await writeFile(path.join(output, "oggparsevorbis.repeated.c"), candidate.generated, { flag: "wx" });
const { generated, edits, ...receipt } = candidate;
await writeFile(path.join(output, "audio-repeated-comment-source.json"), JSON.stringify({ ...receipt, sourceEdits: edits.length }) + "\n", { flag: "wx" });
await writeFile(file, generated);
console.log(JSON.stringify({ ...receipt, sourceEdits: edits.length }));
