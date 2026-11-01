// One-shot lossless archival of redundant raw sampler detail, never media data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, ".."), evidence = path.join(root, "evidence");
const rebuilt = process.argv[2] === "--rebuilt-controls";
const allocation = process.argv[2] === "--allocation-controls";
const single = process.argv[2] === "--single-core-control";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && (rebuilt || allocation || single)));
const names = single ? ["comparison-single-core-preflight-recovery"] : allocation ? ["fallback-realms", "comparison-default-core"] : rebuilt ? ["rebuilt-native", "rebuilt-cpu-fallback"] :
  ["first-smoke", "functional-diagnostic", "native-color-diagnostic", "explicit-color-fixture", "frame-color-fixture", "encoder-preference-fallback"];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const output = path.join(evidence, "2026-11-01-webcodecs-vp9-" + (single ? "single-core-control-archive" : allocation ? "allocation-control-archives" : rebuilt ? "rebuilt-control-archives" : "diagnostic-archives") + ".json");
await assert.rejects(access(output), { code: "ENOENT" });
const prepared = [];
// Preflight every terminal before mutating any owned receipt.
for (const name of names) {
  const file = `2026-11-01-webcodecs-vp9-${name}.json`, original = await readFile(path.join(evidence, file));
  assert.ok(original.length > 0 && original.length <= 4194304);
  const report = JSON.parse(original); assert.match(report.status, /^(?:passed-one-small-private-browser|failed-private-vp9-browser)/);
  assert.ok(report.finishedAt && report.ownedRuntimeRemoved); assert.equal(report.rawArchive, undefined);
  const archive = file.replace(/\.json$/, ".raw.json.gz"); await assert.rejects(access(path.join(evidence, archive)), { code: "ENOENT" });
  const compressed = gzipSync(original, { level: 9 }); assert.deepEqual(gunzipSync(compressed), original);
  prepared.push({ file, archive, original, report, compressed });
}
const results = [];
for (const { file, archive, original, report, compressed } of prepared) {
  await writeFile(path.join(evidence, archive), compressed, { flag: "wx" });
  assert.deepEqual(gunzipSync(await readFile(path.join(evidence, archive))), original);
  const compact = { ...report,
    rawArchive: { file: "evidence/" + archive, bytes: compressed.length, sha256: sha(compressed),
      decodedBytes: original.length, decodedSha256: sha(original), exactRoundtripVerifiedBeforeReplacement: true },
    blankSamples: report.blankSamples.map(({ processes, ...sample }) => ({ ...sample, processCount: processes?.length ?? null })),
    nativeMemory: report.nativeMemory ? { ...report.nativeMemory, graphBuckets: undefined,
      graphDetail: "Preserved byte-exactly in rawArchive, not omitted from the calculation" } : null };
  const compactBytes = Buffer.from(JSON.stringify(compact, null, 2) + "\n");
  await writeFile(path.join(evidence, file), compactBytes);
  assert.equal(sha(gunzipSync(await readFile(path.join(evidence, archive)))), sha(original));
  results.push({ file: "evidence/" + file, archive: compact.rawArchive, compactBytes: compactBytes.length, compactSha256: sha(compactBytes) });
}
const report = { scope: "Lossless sampler receipt storage reduction; original failed/passed results and thresholds unchanged", reports: results,
  originalBytes: prepared.reduce((sum, row) => sum + row.original.length, 0),
  retainedBytes: results.reduce((sum, row) => sum + row.compactBytes + row.archive.bytes, 0),
  allRoundtripsVerified: true, convertedFilesRead: false, privateNativeToolRemoved: false, publicAcceptance: false };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, originalBytes: report.originalBytes, retainedBytes: report.retainedBytes, allRoundtripsVerified: true }));
