// Same exact proven transform, with a separate strict owned-path boundary.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyHevcAuxiliaryPolicy, reverseHevcAuxiliaryPolicy } from "./mpeg2-hevc-auxiliary-policy.mjs";
const root = path.resolve(import.meta.dirname, "../.."), target = path.resolve(process.argv[2] ?? "");
assert.equal(process.argv.length, 3);
assert.equal(target, path.join(root, "work/mpeg2-split-pipeline-build/ffmpeg/libavcodec/hevc/hevcdec.c"));
assert.equal(await realpath(target), target);
const info = await lstat(target); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 196608);
const before = await readFile(target, "utf8"), after = applyHevcAuxiliaryPolicy(before);
assert.equal(reverseHevcAuxiliaryPolicy(after), before);
await writeFile(target, after);
process.stdout.write(`${createHash("sha256").update(after).digest("hex")}  unchanged-policy-in-owned-split-slot\n`);
