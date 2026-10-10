// Remove one byte-verified redundant raw report; compact lossless evidence remains.
import assert from "node:assert/strict";
import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const proofFile = "evidence/2026-10-10T10-17-44-886Z-encoder-plane-browser-goldens.json";
const proofBytes = await read(proofFile), proof = JSON.parse(proofBytes);
assert.equal(proof.failure, null); assert.equal(proof.status, "five-headless-goldens-byte-exact-and-recovery-passed");
const row = proof.report, file = path.resolve(root, row.path);
assert.equal(path.dirname(file), path.join(root, "output/playwright"));
assert.ok(path.basename(file).endsWith("-mpeg2-encoder-planes-38044000567-direct-artwork.json"));
const identity = await lstat(file, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
assert.equal(await realpath(file), file);
const raw = await readFile(file); assert.equal(raw.length, row.bytes); assert.equal(sha(raw), row.sha256);
const gzip = await read(row.archive.path); assert.equal(gzip.length, row.archive.bytes); assert.equal(sha(gzip), row.archive.sha256);
const restored = gunzipSync(gzip, { maxOutputLength: 2097152 }); assert.deepEqual(restored, raw);
const current = await lstat(file, { bigint: true });
for (const field of ["dev", "ino", "size"]) assert.equal(current[field], identity[field]);
assert.equal(sha(await readFile(file)), row.sha256); await unlink(file);
const output = "evidence/mpeg2-encoder-plane-golden-compaction-2026-10-10.json";
await writeFile(path.join(root, output), JSON.stringify({ observedAt: new Date().toISOString(), proof: { path: proofFile, sha256: sha(proofBytes) },
  rawRemoved: { path: row.path, bytes: row.bytes, sha256: row.sha256 }, retained: row.archive,
  exactByteRecoveryVerifiedBeforeRemoval: true, mediaRemovedHere: false, protectedOriginalTouched: false,
  sourceSha256: sha(await readFile(new URL(import.meta.url))) }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, rawBytesRemoved: row.bytes, losslessBytesRetained: row.archive.bytes }));
