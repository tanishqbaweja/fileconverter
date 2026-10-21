import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeVpxPreservingSource, makeVpxPreservingLibraries } from "./vpx-preserving-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/ffmpeg-nondocker-build");
assert.equal(await realpath(build), build);
const libraries = process.argv[2] === "--libraries";
assert.equal(process.argv.length, libraries ? 4 : 3);
const file = path.resolve(process.argv[libraries ? 3 : 2]);
assert.equal(file, path.join(build, libraries ? "build-libraries.vpx.sh" : "within_remux.c"));
const source = libraries
  ? makeVpxPreservingLibraries(await readFile(path.join(build, "build-libraries.sh"), "utf8"))
  : makeVpxPreservingSource(await readFile(file, "utf8"));
await writeFile(file, source.generated);
console.log(JSON.stringify({ compiledSourceSha256: source.generatedSha256, edits: source.edits.length, publicAcceptance: false }));
