import assert from "node:assert/strict";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { makeAudioTextMetadataCandidate, AUDIO_METADATA_PARENT_SHA256 } from "./audio-text-metadata-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/ffmpeg-nondocker-build");
assert.equal(process.argv.length, 4);
const source = path.resolve(process.argv[2]), target = path.resolve(process.argv[3]);
assert.equal(source, path.join(build, "within_remux.c")); assert.equal(target, path.join(build, "within_remux.metadata.c"));
assert.equal(await realpath(build), build);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
// The pinned reproduction recipe derives this historical general-core parent
// from the authenticated current master. Never edit the repository's master.
assert.equal(sha(await readFile(path.join(build, "within_remux.current.c"))), AUDIO_METADATA_PARENT_SHA256);
assert.equal(sha(await readFile(path.join(root, "media/ffmpeg/reproduce-nondocker.sh"))), "6323620da9f7046d440aac362cd3211f21e4e19a679cd3c4b2f09182cb457f5e");
const parent = await readFile(source, "utf8"), helper = await readFile(new URL("./audio-text-metadata.h", import.meta.url), "utf8");
const candidate = makeAudioTextMetadataCandidate(parent, helper, { expectedParentSha256: sha(parent) });
await writeFile(target, candidate.generated, { flag: "wx" });
console.log(JSON.stringify({ scope: candidate.scope, parentSha256: candidate.parentSha256, generatedSha256: candidate.generatedSha256, publicAcceptance: false }));
