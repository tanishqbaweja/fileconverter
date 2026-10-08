// Only the two terminal, independently verified rejected-candidate raw reports.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofPath = "evidence/2026-10-08T11-27-43-052Z-ui-hero-flex-layout.json";
const analysisPath = proofPath.replace(/\.json$/, "-analysis.json");
const proofBytes = await readFile(path.join(root, proofPath)), proof = JSON.parse(proofBytes);
const analysisBytes = await readFile(path.join(root, analysisPath)), analysis = JSON.parse(analysisBytes);
assert.equal(proof.status, "candidate-layout-rejected");
assert.equal(analysis.status, "verified-terminal-hero-layout-pair-not-public-acceptance");
assert.equal(analysis.candidateGeometryAccepted, false);
assert.equal(analysis.sourcePins[proofPath], sha(proofBytes));
for (const pins of [analysis.sourcePins, proof.sourcePins, ...proof.proofs.map(p => p.sourcePins)])
  for (const [file, hash] of Object.entries(pins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
assert.equal(analysis.cleanup.allObservedPidsAbsent, true);
assert.equal(analysis.cleanup.fourScratchDirectoriesAbsent, true);
assert.equal(analysis.cleanup.protectedFullPostHashMatches, true);
assert.deepEqual(proof.proofs.map(p => p.rawReport.path), [
  "output/playwright/2026-10-08T11-27-43-780Z-ui-hero-grid-layout.json",
  "output/playwright/2026-10-08T11-28-20-254Z-ui-hero-flex-layout.json",
]);
const output = path.join(root, proofPath.replace(/\.json$/, "-compaction.json"));
await assert.rejects(access(output), { code: "ENOENT" });
const reports = [];
for (const p of proof.proofs) {
  const target = path.join(root, p.rawReport.path), allowed = await realpath(path.join(root, "output", "playwright"));
  assert.equal(path.dirname(await realpath(target)), allowed);
  const before = await lstat(target); assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.ok(before.size > 0 && before.size <= 4 * 1048576);
  const bytes = await readFile(target); assert.equal(bytes.length, p.rawReport.bytes); assert.equal(sha(bytes), p.rawReport.sha256);
  const archive = gzipSync(bytes, { level: 9 }), archivePath = target + ".gz";
  await assert.rejects(access(archivePath), { code: "ENOENT" });
  await writeFile(archivePath, archive, { flag: "wx" });
  const stored = await readFile(archivePath), restored = gunzipSync(stored, { maxOutputLength: 4 * 1048576 });
  assert.equal(sha(stored), sha(archive)); assert.equal(restored.length, bytes.length); assert.equal(sha(restored), sha(bytes));
  const after = await lstat(target);
  for (const key of ["dev", "ino", "size", "mtimeMs", "ctimeMs"]) assert.equal(after[key], before[key], key);
  assert.equal(sha(await readFile(target)), sha(bytes));
  await unlink(target); await assert.rejects(access(target), { code: "ENOENT" });
  reports.push({ rawPath: p.rawReport.path, rawBytes: bytes.length, rawSha256: sha(bytes),
    archivePath: p.rawReport.path + ".gz", archiveBytes: stored.length, archiveSha256: sha(stored),
    reconstructionVerified: true, rawRemovedAfterVerification: true });
}
const result = { recordedAt: new Date().toISOString(), status: "verified-lossless-ui-hero-raw-report-compaction",
  sourcePins: { [proofPath]: sha(proofBytes), [analysisPath]: sha(analysisBytes),
    "scripts/compact-ui-hero-flex-reports.mjs": sha(await readFile(path.join(root, "scripts/compact-ui-hero-flex-reports.mjs"))) },
  reports, bytesSaved: reports.reduce((n, r) => n + r.rawBytes - r.archiveBytes, 0),
  originalMediaTouched: false, publishedFilesChanged: false, conversionAcceptance: false };
await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, reports, bytesSaved: result.bytesSaved }));
