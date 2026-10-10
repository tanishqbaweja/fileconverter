// Preserve actual failed source BEFORE replacing the unneeded whole-output collector.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
const sha = value => createHash("sha256").update(value).digest("hex");
const proofPath = "evidence/2026-10-10T09-36-00-902Z-single-idle-encoder-stack-static.json";
const proofBytes = await readFile(proofPath), proof = JSON.parse(proofBytes);
assert.equal(proof.status, "failed-static-audit"); assert.match(proof.failure, /STDIO_MAXBUFFER/);
const sourcePath = "scripts/audit-single-idle-encoder-stack.mjs", source = await readFile(sourcePath);
assert.equal(sha(source), proof.sourcePins[sourcePath]);
const gzip = gzipSync(source, { level: 9 }); assert.deepEqual(gunzipSync(gzip), source);
const archivePath = "outputs/reports/2026-10-10T09-36-00-902Z-single-idle-encoder-static-failed-source.mjs.gz";
await writeFile(archivePath, gzip, { flag: "wx" });
const output = "evidence/single-idle-encoder-stack-first-failure-2026-10-10.json";
await writeFile(output, JSON.stringify({ recordedAt: new Date().toISOString(), proof: { path: proofPath, sha256: sha(proofBytes) },
  failureRemainsFailed: true, exactExecutedAudit: { path: archivePath, bytes: gzip.length, sha256: sha(gzip), restoredBytes: source.length,
    restoredSha256: sha(source) }, ownSourceSha256: sha(await readFile(new URL(import.meta.url))),
  next: "Replace whole stdout buffering with bounded selected-function streaming, keeping8MiB retained total and exact original binary unchanged. No conversion replay." }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, preservedActualSource: true, failureRemainsFailed: true }));
