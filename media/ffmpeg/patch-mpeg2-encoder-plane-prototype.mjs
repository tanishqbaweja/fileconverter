// Named existing private libavutil build source only; no original/public writes.
import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyPlaneFactoryPrototype } from "./mpeg2-encoder-plane-prototype-source.mjs";
const root = await realpath(path.resolve(import.meta.dirname, "../.."));
assert.equal(process.argv.length, 3); const file = await realpath(process.argv[2]);
const relative = path.relative(path.join(root, "work"), file);
assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
assert.ok(file.endsWith(path.join("libavutil", "buffer.c")));
const source = await readFile(file, "utf8"), changed = applyPlaneFactoryPrototype(source);
await writeFile(file, changed);
console.log("Added private pool factory declaration; strict compiler checks and policy unchanged.");
