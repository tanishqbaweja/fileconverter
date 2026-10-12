// Remove only redundant owned metadata after exact lossless archive validation.
import assert from "node:assert/strict";
import { access, lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), proofPath = process.argv[2]; assert.equal(process.argv.length, 3);
assert.match(proofPath ?? "", /^evidence\/[A-Za-z0-9-]+-packet-cache-media\.json$/);
const ownPath = "scripts/retain-packet-cache-media-report.mjs", ownBytes = await readFile(path.join(root, ownPath));
const proofBytes = await readFile(path.join(root, proofPath)), proof = JSON.parse(proofBytes);
assert.equal(proof.failure, null); assert.equal(proof.analysis.genuineValidatedConversions, 3);
assert.deepEqual(proof.sourcePins, proof.postSourcePins); assert.equal(proof.cleanup.ownedWrapperAbsent, true);
const record = proof.report.archive; assert.ok(record.bytes <= 2097152 && record.restoredBytes <= 2097152);
assert.match(record.path, /^outputs\/reports\/[A-Za-z0-9-]+-packet-cache-media-golden-report\.json\.gz$/);
const compressed = await readFile(path.join(root, record.path)); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
const restored = gunzipSync(compressed, { maxOutputLength: 2097152 }); assert.equal(restored.length, record.restoredBytes); assert.equal(sha(restored), record.restoredSha256);
assert.equal(proof.report.bytes, restored.length); assert.equal(proof.report.sha256, sha(restored));
assert.match(proof.report.path, /^output\/playwright\/[A-Za-z0-9.-]+-packet-cache-media-[A-Za-z0-9]+-direct-artwork\.json$/);
const target = path.join(root, proof.report.path), identity = await lstat(target, { bigint: true });
assert.ok(identity.isFile() && !identity.isSymbolicLink()); assert.equal(await realpath(target), target);
assert.deepEqual(await readFile(target), restored); const report = JSON.parse(restored);
assert.equal(report.rows.filter(row => !row.kind && row.container && row.status === "passed").length, 3);
const output = proofPath.replace(/\.json$/, "-retention.json"); await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const current = await lstat(target, { bigint: true }); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino); assert.equal(current.size, identity.size);
assert.equal(sha(await readFile(target)), proof.report.sha256); await unlink(target); await assert.rejects(access(target), { code: "ENOENT" });
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), proof: { path: proofPath, sha256: sha(proofBytes) },
  ownSource: { path: ownPath, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") },
  retainedArchive: record, rawReport: { path: proof.report.path, bytes: proof.report.bytes, sha256: proof.report.sha256, removedAfterArchiveValidation: true },
  exactRawBytesRecoverableFromArchive: true, removedFiles: 1, convertedMediaDeleted: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, removedFiles: 1, retainedBytes: compressed.length, exactRawBytesRecoverableFromArchive: true }));
