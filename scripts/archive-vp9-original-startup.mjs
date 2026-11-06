// One-shot lossless archive of selected terminal original-startup diagnostics.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";
const selected = ["3", "4", "5","6"].includes(process.argv[2]) ? process.argv[2] : null;
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && selected));
const root = path.resolve(import.meta.dirname, ".."), prefix = "evidence/2026-11-06-vp9-original-cpu-startup", output = path.join(root, prefix + (selected ? "-attempt" + selected + "-archive.json" : "-archives.json"));
const sha = value => createHash("sha256").update(value).digest("hex"); await assert.rejects(access(output), { code: "ENOENT" });
const prepared = [];
for (const suffix of selected ? ["-attempt" + selected] : ["", "-attempt2"]) {
  const file = prefix + suffix + ".json", bytes = await readFile(path.join(root, file)); assert.ok(bytes.length <= 8388608);
  const report = JSON.parse(bytes); assert.equal(report.status, "failed-private-vp9-browser-smoke");
  assert.equal(report.ownedRuntimeRemoved, true); assert.ok(report.finishedAt); assert.equal(report.rawArchive, undefined);
  const archive = prefix + suffix + ".raw.json.gz"; await assert.rejects(access(path.join(root, archive)), { code: "ENOENT" });
  const packed = gzipSync(bytes, { level: 9 }); assert.deepEqual(gunzipSync(packed, { maxOutputLength: 8388608 }), bytes);
  prepared.push({ file, bytes, report, archive, packed });
}
const rows = [];
for (const { file, bytes, report, archive, packed } of prepared) {
  await writeFile(path.join(root, archive), packed, { flag: "wx" });
  const compact = { ...report, rawArchive: { file: archive, bytes: packed.length, sha256: sha(packed), decodedBytes: bytes.length,
    decodedSha256: sha(bytes), exactRoundtripVerifiedBeforeReplacement: true },
    blankSamples: report.blankSamples.map(({ processes, ...sample }) => ({ ...sample, processCount: processes?.length ?? null })),
    nativeMemory: report.nativeMemory ? { ...report.nativeMemory, graphBuckets: undefined,
      graphDetail: "Preserved byte-exactly in rawArchive; failed/peak/missing-sample verdicts unchanged" } : null };
  const compactBytes = Buffer.from(JSON.stringify(compact, null, 2) + "\n"); await writeFile(path.join(root, file), compactBytes);
  assert.equal(sha(gunzipSync(await readFile(path.join(root, archive)), { maxOutputLength: 8388608 })), sha(bytes));
  rows.push({ file, originalBytes: bytes.length, compactBytes: compactBytes.length, compactSha256: sha(compactBytes), archive: compact.rawArchive });
}
const report = { scope: "Failed original startup attempts, exact raw archive not media", reports: rows,
  originalBytes: rows.reduce((sum, row) => sum + row.originalBytes, 0), retainedBytes: rows.reduce((sum, row) => sum + row.compactBytes + row.archive.bytes, 0),
  allRoundtripsVerified: true, convertedFilesReadOrRetained: false, publicAcceptance: false };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, originalBytes: report.originalBytes, retainedBytes: report.retainedBytes, allRoundtripsVerified: true }));
