// Compact this exact completed diagnostic report, never media or a workspace sweep.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, lstat, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;
const input = "outputs/reports/2026-10-07T19-17-29-857Z-private-mpeg2-staged-abort-original-native-100ms.json";
const rawPath = path.join(root, input), gzipPath = rawPath + ".gz";
const output = path.join(root, "evidence/mpeg2-staged-abort-terminal-compaction-2026-10-08.json");
const proof = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-staged-abort-original-2026-10-08.json")));
assert.equal(proof.rawReport.path, input); assert.equal(proof.rawStatus, "failed");
assert.equal(proof.completeOriginalConversions, 0); assert.equal(proof.publicAcceptance, false);
assert.equal(await realpath(path.dirname(rawPath)), path.join(root, "outputs/reports"));
assert.equal(await realpath(rawPath), rawPath);
const identity = await lstat(rawPath, { bigint: true });
assert.ok(identity.isFile() && !identity.isSymbolicLink());
assert.equal(Number(identity.size), proof.rawReport.bytes); assert.ok(identity.size <= BigInt(32 * MiB));
await assert.rejects(access(gzipPath), { code: "ENOENT" });
await assert.rejects(access(output), { code: "ENOENT" });
const runtime = await createOwnedRuntimeScratch("staged-abort-report-compact-");
const temporary = path.join(runtime.directory, "report.json.gz");
let archiveBytes, archiveSha256, removed = false;
try {
  const rawHash = createHash("sha256"); let inputBytes = 0;
  const inspect = new Transform({ transform(chunk, encoding, done) {
    inputBytes += chunk.length;
    if (inputBytes > 32 * MiB) return done(new Error("Raw diagnostic exceeds its bound"));
    rawHash.update(chunk); done(null, chunk);
  } });
  await pipeline(createReadStream(rawPath, { highWaterMark: 65536 }), inspect,
    createGzip({ level: 9, chunkSize: 65536 }), createWriteStream(temporary, { flags: "wx", highWaterMark: 65536 }));
  assert.equal(inputBytes, proof.rawReport.bytes); assert.equal(rawHash.digest("hex"), proof.rawReport.sha256);
  archiveBytes = (await stat(temporary)).size; assert.ok(archiveBytes > 0 && archiveBytes <= 4 * MiB);
  const archiveHash = createHash("sha256"), reconstructedHash = createHash("sha256"); let reconstructedBytes = 0;
  await pipeline(createReadStream(temporary, { highWaterMark: 65536 }),
    new Transform({ transform(chunk, encoding, done) { archiveHash.update(chunk); done(null, chunk); } }),
    createGunzip({ chunkSize: 65536 }), new Writable({ highWaterMark: 65536, write(chunk, encoding, done) {
      reconstructedBytes += chunk.length;
      if (reconstructedBytes > 32 * MiB) return done(new Error("Reconstructed report exceeds its bound"));
      reconstructedHash.update(chunk); done();
    } }));
  archiveSha256 = archiveHash.digest("hex");
  assert.equal(reconstructedBytes, proof.rawReport.bytes);
  assert.equal(reconstructedHash.digest("hex"), proof.rawReport.sha256);
  const current = await lstat(rawPath, { bigint: true });
  assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino); assert.equal(current.size, identity.size);
  assert.ok(current.isFile() && !current.isSymbolicLink()); assert.equal(await realpath(rawPath), rawPath);
  await rename(temporary, gzipPath);
  assert.equal((await stat(gzipPath)).size, archiveBytes);
  await unlink(rawPath); await assert.rejects(access(rawPath), { code: "ENOENT" }); removed = true;
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" });
const sourcePath = "scripts/compact-mpeg2-staged-abort-terminal-report.mjs";
const report = { recordedAt: new Date().toISOString(), status: "verified-lossless-diagnostic-compaction",
  scope: "ONE terminal JSON diagnostic report, not converted media; no converter or protected-source access",
  raw: proof.rawReport, archive: { path: input + ".gz", bytes: archiveBytes, sha256: archiveSha256 },
  reconstructedRawSizeAndSha256Verified: true, rawIdentityRevalidatedBeforeRemoval: true,
  uncompressedRawRemoved: removed, removedBytes: proof.rawReport.bytes,
  ownedScratchRemoved: true, protectedSourceRead: false, browserConversionsPerformed: 0,
  rawFailurePreserved: true, publicAcceptance: false,
  sourcePins: { [sourcePath]: createHash("sha256").update(await readFile(path.join(root, sourcePath))).digest("hex") },
  bounds: { streamChunkBytes: 65536, maximumRawBytes: 32 * MiB, maximumArchiveBytes: 4 * MiB },
  recovery: "The verified gzip archive reconstructs the exact raw JSON and its recorded SHA-256. Do not confuse removal of a redundant raw report with loss of failure evidence." };
const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 8192);
await writeFile(output, json, { flag: "wx" }); console.log(JSON.stringify(report));
