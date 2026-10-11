// Archive the two actual failed-worker reports without rerunning conversion.
import assert from "node:assert/strict";
import { access, lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const proofPath = "evidence/2026-10-11T07-46-32-435Z-encoder-plane-recovery-diagnostic.json";
const proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
assert.equal(proof.status, "failed-or-incomplete"); assert.ok(proof.failure.includes("2 !== 1"));
assert.deepEqual(proof.protectedPre, proof.protectedPost); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
assert.equal(proof.cleanup.ownedWrapperAbsent, true); assert.equal(proof.cleanup.helpers.runtimeAbsent, true);
const archive = proof.generatedArchive, compressed = await read(archive.path);
assert.equal(sha(compressed), archive.sha256); assert.equal(compressed.length, archive.bytes);
const restored = gunzipSync(compressed, { maxOutputLength: 8388608 });
assert.equal(restored.length, archive.restoredBytes); assert.equal(sha(restored), archive.restoredSha256);
const source = JSON.parse(restored); assert.deepEqual(source.sourcePins, proof.sourcePins);
for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(source.sources[file]), hash);
assert.ok(source.generated.spec.includes("expect(page.workers()[0]).toBe(originalWorker)"));
const reports = [];
for (const [index, file] of [
  "output/playwright/2026-10-11T07-46-37.704Z-mpeg2-encoder-planes-38044000567-direct-artwork.json",
  "output/playwright/2026-10-11T07-47-04.707Z-mpeg2-encoder-planes-38044000567-direct-artwork.json",
].entries()) {
  const absolute = path.join(root, file), info = await lstat(absolute);
  assert.equal(await realpath(absolute), absolute); assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.ok(info.size < 2097152); const raw = await read(file), value = JSON.parse(raw);
  const row = value.rows.find(row => row.kind === (index === 0 ? "direct-write-failure" : "cancel-after-direct-output"));
  assert.equal(row.status, "passed"); assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
  assert.ok(row.partialBytes.every(size => size === 0)); assert.equal(value.rows.some(row => row.kind === "validated-same-page-recovery"), false);
  const zipped = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(zipped), raw);
  const target = `outputs/reports/2026-10-11T07-46-32-435Z-encoder-plane-recovery-failed-worker-report-${index}.json.gz`;
  await writeFile(path.join(root, target), zipped, { flag: "wx" }); assert.deepEqual(await read(target), zipped);
  const final = await lstat(absolute);
  for (const key of ["dev", "ino", "size", "mtimeMs", "ctimeMs"]) assert.equal(final[key], info[key]);
  await rm(absolute); await assert.rejects(access(absolute), { code: "ENOENT" });
  reports.push({ originalPath: file, originalBytes: raw.length, originalSha256: sha(raw), path: target,
    bytes: zipped.length, sha256: sha(zipped), recoveredAdverseKind: row.kind, samePageRecoveryNotProven: true,
    duplicateRawRemovedAfterLosslessVerification: true });
}
const target = "evidence/2026-10-11T07-46-32-435Z-encoder-plane-recovery-failed-worker-collection.json";
await writeFile(path.join(root, target), JSON.stringify({ proofPath, proofSha256: sha(proofBytes), reports,
  reason: "Test incorrectly required retained worker; production deliberately terminates/replaces it after terminal jobs",
  fullOriginalAcceptance: false, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath: target, reportsArchived: reports.length, redundantRawRemoved: reports.length }));
