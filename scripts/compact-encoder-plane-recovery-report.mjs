// Losslessly verified compact report; delete only the exact duplicate raw file.
import assert from "node:assert/strict";
import { access, lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectRecoveryDiagnostic } from "./lib/encoder-plane-recovery-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 3);
const proofPath = process.argv[2];
assert.match(proofPath, /^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-encoder-plane-recovery-diagnostic\.json$/);
const proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
assert.equal(proof.failure, null); assert.equal(proof.status, "two-headless-adverse-and-same-page-recovery-cases-not-full-acceptance");
assert.equal(proof.publicAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
const archive = proof.report.archive;
assert.match(archive.path, /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-]+Z-encoder-plane-recovery-golden-report\.json\.gz$/);
const compressed = await read(archive.path); assert.equal(compressed.length, archive.bytes); assert.equal(sha(compressed), archive.sha256);
const bytes = gunzipSync(compressed, { maxOutputLength: 2097152 });
assert.equal(bytes.length, archive.restoredBytes); assert.equal(sha(bytes), archive.restoredSha256);
assert.equal(bytes.length, proof.report.bytes); assert.equal(sha(bytes), proof.report.sha256);
const buildBytes = await read(proof.build.path); assert.equal(sha(buildBytes), proof.build.sha256);
assert.deepEqual(inspectRecoveryDiagnostic(JSON.parse(bytes), null, JSON.parse(buildBytes)), proof.analysis);
const file = proof.report.path;
assert.match(file, /^output\/playwright\/\d{4}-\d{2}-\d{2}T[\d:.-]+Z-mpeg2-encoder-planes-38044000567-direct-artwork\.json$/);
const absolute = path.join(root, file), info = await lstat(absolute);
assert.ok(info.isFile() && !info.isSymbolicLink()); assert.equal(await realpath(absolute), absolute);
assert.deepEqual(await read(file), bytes);
const final = await lstat(absolute); for (const key of ["dev", "ino", "size", "mtimeMs", "ctimeMs"]) assert.equal(final[key], info[key]);
await rm(absolute); await assert.rejects(access(absolute), { code: "ENOENT" });
const target = proofPath.replace("-diagnostic.json", "-report-compaction.json");
await writeFile(path.join(root, target), JSON.stringify({ proofPath, proofSha256: sha(proofBytes), rawPath: file,
  bytes: bytes.length, sha256: sha(bytes), recoverableFrom: archive.path, removedAfterLosslessVerification: true,
  fullOriginalAcceptance: false, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath: target, duplicateRawBytesRemoved: bytes.length, recoverableFrom: archive.path }));
