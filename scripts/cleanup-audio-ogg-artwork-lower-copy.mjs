// Exact owned experimental tool cache only. Source/reports/build artifacts can
// reproduce it; the predeclared browser experiment did not justify a speed win.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { auditAudioMetadataArtifact } from "./lib/audio-metadata-artifact.mjs";
const root = path.resolve(import.meta.dirname, ".."), directory = path.join(root, "work/audio-ogg-artwork-lower-copy-40161703799");
const receiptFile = path.join(root, "evidence/audio-ogg-artwork-lower-copy-cache-cleanup-2026-10-25-v1.json");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.argv.length, 2);
const plan = JSON.parse(await readFile(path.join(root, "evidence/audio-artwork-serializer-bracket-2026-10-25-v1.json")));
assert.equal(plan.status, "complete-no-consistent-browser-speedup"); assert.equal(plan.selectedEngine, "baseline");
const comparison = JSON.parse(await readFile(path.join(root, plan.comparison)));
assert.equal(comparison.conclusion, "no-consistent-end-to-end-engine-speedup-demonstrated-on-this-fixture");
assert.equal(comparison.validatedOutputs, 28);
assert.equal(path.dirname(directory), path.join(root, "work")); assert.equal(await realpath(directory), directory);
const before = await lstat(directory, { bigint: true }); assert.ok(before.isDirectory() && !before.isSymbolicLink());
const audited = await auditAudioMetadataArtifact(directory);
assert.equal(audited.manifestSha256, "6457c3499800db5d8275d08ead789637546c68e8d75fc4ccf21b893eeba57609");
assert.equal(audited.core.allowedSourceEdits, 14);
const manifest = JSON.parse(await readFile(path.join(directory, "build-manifest.json")));
const expectedNames = ["build-manifest.json", ...Object.keys(manifest.artifacts)].sort();
const actualNames = (await readdir(directory)).sort(); assert.deepEqual(actualNames, expectedNames);
let total = 0;
for (const name of expectedNames) {
  const file = path.join(directory, name), info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.equal(await realpath(file), file); total += info.size;
  assert.equal(sha(await readFile(file)), name === "build-manifest.json" ? audited.manifestSha256 : manifest.artifacts[name]);
}
assert.equal(total, 10449553);
const receipt = { recordedAt: new Date().toISOString(), status: "validated-removal-intent-not-yet-removed",
  directory: path.relative(root, directory).replaceAll(path.sep, "/"), bytes: total, manifestSha256: audited.manifestSha256,
  files: expectedNames, identity: { dev: String(before.dev), ino: String(before.ino), birthtimeNs: String(before.birthtimeNs) },
  reason: "closed-nonwinning-browser-speed-experiment; baseline-retained", sourceAndReportsRetained: true,
  recovery: { buildRun: 40161703799, buildCommit: "e361f463ca1af9d2238f2466ddbbb817fb8c7142", rebuildRecipe: "media/ffmpeg/build-audio-ogg-artwork-lower-copy-candidate.mjs" },
  publicAssetsTouched: false, protectedOriginalTouched: false };
await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
const current = await lstat(directory, { bigint: true });
assert.equal(before.dev, current.dev); assert.equal(before.ino, current.ino); assert.equal(before.birthtimeNs, current.birthtimeNs);
assert.ok(current.isDirectory() && !current.isSymbolicLink()); assert.equal(await realpath(directory), directory);
assert.deepEqual((await readdir(directory)).sort(), expectedNames);
await rm(directory, { recursive: true }); await assert.rejects(lstat(directory), { code: "ENOENT" });
receipt.status = "removed-exact-owned-nonwinning-cache"; receipt.removedAt = new Date().toISOString();
await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ receipt: receiptFile, status: receipt.status, bytes: total, recovery: receipt.recovery }));
