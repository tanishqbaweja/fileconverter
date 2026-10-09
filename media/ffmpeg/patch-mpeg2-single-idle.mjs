import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySingleIdleRefstruct } from "./mpeg2-single-idle-source.mjs";
const root = path.resolve(import.meta.dirname, "../.."), target = path.resolve(process.argv[2] ?? "");
assert.equal(process.argv.length, 3);
assert.equal(target, path.join(root, "work/mpeg2-split-pipeline-build/ffmpeg/libavutil/refstruct.c"));
assert.equal(await realpath(target), target);
const info = await lstat(target); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 32768);
const original = await readFile(target, "utf8");
// Exact executed 37739125738 late-slot source, not an arbitrary caller pin.
const expected = "c2a288ddbd4c814ab3d63cc14798a7de76690bc0fc11775fc7c62dd8247f72f6";
const changed = applySingleIdleRefstruct(original, expected);
await writeFile(target, changed);
console.log(`${createHash("sha256").update(changed).digest("hex")}  single-idle-final-unref-policy`);
