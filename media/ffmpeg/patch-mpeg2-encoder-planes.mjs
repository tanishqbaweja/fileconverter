// Explicitly named private build source paths only; original project files forbidden.
import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySingleIdlePlaneBuffer, applySingleIdlePlaneGetBuffer } from "./mpeg2-encoder-plane-source.mjs";
const root = await realpath(path.resolve(import.meta.dirname, "../.."));
const args = process.argv.slice(2); assert.equal(args.length, 2);
const files = await Promise.all(args.map(file => realpath(file)));
for (const file of files) {
  const relative = path.relative(path.join(root, "work"), file);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
assert.ok(files[0].endsWith(path.join("libavutil", "buffer.c")));
assert.ok(files[1].endsWith(path.join("libavcodec", "get_buffer.c")));
const sources = await Promise.all(files.map(file => readFile(file, "utf8")));
const changed = [applySingleIdlePlaneBuffer(sources[0]), applySingleIdlePlaneGetBuffer(sources[1])];
// Both hashes/reversals checked before either source is mutated.
await writeFile(files[0], changed[0]); await writeFile(files[1], changed[1]);
console.log("Private encoder plane pool patched; compiled lifecycle/browser acceptance still required.");
