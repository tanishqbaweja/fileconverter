// Remove ONLY this independently verified redundant raw JSON. No media/profile/PID cleanup.
import assert from "node:assert/strict";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const auditPath = "evidence/2026-10-09T15-42-44-939Z-progress-compositing-golden-analysis.json", auditBytes = await read(auditPath), audit = JSON.parse(auditBytes);
assert.equal(audit.status, "independently-verified-five-goldens-with-follow-up-numeric-cleanup");
const proofBytes = await read(audit.proof.path); assert.equal(sha(proofBytes), audit.proof.sha256); const proof = JSON.parse(proofBytes), record = proof.report;
assert.equal(record.rawPath, "output/playwright/2026-10-09T15-43-18.198Z-mpeg2-split-pipeline-37739125738-direct-artwork.json");
const raw = await read(record.rawPath); assert.equal(sha(raw), record.rawSha256); assert.equal(raw.length, record.rawBytes);
const compressed = await read(record.archive.path); assert.equal(sha(compressed), record.archive.sha256); assert.equal(compressed.length, record.archive.bytes);
assert.deepEqual(gunzipSync(compressed, { maxOutputLength: 2097152 }), raw);
const absolute = path.resolve(root, record.rawPath); assert.ok(path.relative(path.join(root, "output/playwright"), absolute).startsWith("2026-10-09T15-43-18.198Z-"));
await unlink(absolute);
const output = "evidence/2026-10-09T15-42-44-939Z-progress-compositing-golden-compaction.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(),
  audit: { path: auditPath, sha256: sha(auditBytes) }, rawPath: record.rawPath, rawBytes: raw.length, rawSha256: sha(raw),
  compressedReport: record.archive, removedVerifiedRedundantRawOnly: true, bytesSaved: raw.length - compressed.length,
  originalControllerFailurePreserved: true, browserIdentityCleanupCertified: false, mediaOrProfilesRemoved: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, removed: record.rawPath, bytesSaved: raw.length - compressed.length, losslessArchiveRetained: true }));
