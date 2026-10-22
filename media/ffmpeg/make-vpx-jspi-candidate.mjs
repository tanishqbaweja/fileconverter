// Called only inside the existing owned native build, never on user media.
import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeVpxJspiLink } from "./vpx-jspi-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/ffmpeg-nondocker-build");
assert.equal(process.argv.length, 3); assert.equal(await realpath(build), build);
const file = path.resolve(process.argv[2]); assert.equal(file, path.join(build, "build-remux.sh"));
const result = makeVpxJspiLink(await readFile(file, "utf8"));
await writeFile(file, result.generated);
console.log(JSON.stringify({ generatedLinkSha256: result.generatedSha256, edits: result.edits.length, publicAcceptance: false }));
