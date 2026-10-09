// Freeze the executed post-terminal analyzers, including the failed static cap
// attempt, before a later lint-only rename. Never rewrite existing receipts.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root));
const sourcePreimages = {};
async function retain(file, expected) {
  const bytes = await read(file); assert.equal(sha(bytes), expected, file);
  sourcePreimages[file] = { encoding: "base64", sha256: sha(bytes), data: bytes.toString("base64") };
}
const terminal = JSON.parse(await read("evidence/2026-10-09T16-55-27-062Z-progress-compositing-original-full-completion-analysis.json"));
const callsite = JSON.parse(await read("evidence/progress-full-aligned-callsite-2026-10-10.json"));
const flow = JSON.parse(await read("evidence/progress-full-aligned-normalization-verified-2026-10-10.json"));
const capacity = JSON.parse(await read("evidence/progress-full-aligned-capacity-2026-10-10.json"));
for (const [file, hash] of Object.entries({ ...terminal.analysisSourcePins, ...callsite.sourcePins, ...capacity.sourcePins,
  "scripts/audit-progress-full-aligned-normalization.mjs": flow.sourceSha256 })) await retain(file, hash);
const failed = JSON.parse(await read("evidence/progress-full-aligned-normalization-2026-10-10.json"));
const current = await read("scripts/audit-progress-full-aligned-normalization.mjs");
const failedSource = current.toString().replace(
  "  // Slice preserves bounded constant-data sections as well as names/types;\n" +
  "  // WAT renders those data bytes textually. Same 64MiB static-tool ceiling as\n" +
  "  // the established allocator audit, NOT a converter memory/acceptance change.\n" +
  "  assert.ok(Buffer.byteLength(text) <= 64 * 1048576);",
  "  assert.ok(Buffer.byteLength(text) <= 1048576);").replace(
  'const output = "evidence/progress-full-aligned-normalization-verified-2026-10-10.json";',
  'const output = "evidence/progress-full-aligned-normalization-2026-10-10.json";');
assert.equal(sha(failedSource), failed.sourceSha256);
sourcePreimages["failed-normalization-first-attempt"] = { encoding: "base64", sha256: sha(failedSource), data: Buffer.from(failedSource).toString("base64") };
const raw = Buffer.from(JSON.stringify({ sourcePreimages })), compressed = gzipSync(raw, { level: 9 });
const output = "outputs/reports/2026-10-10-full-terminal-analysis-executed-sources.json.gz";
await writeFile(new URL(output, root), compressed, { flag: "wx" });
assert.deepEqual(gunzipSync(await read(output)), raw);
const report = { recordedAt: new Date().toISOString(), sourceArchive: { path: output, bytes: compressed.length, sha256: sha(compressed),
  restoredBytes: raw.length, restoredSha256: sha(raw), preimages: Object.keys(sourcePreimages).length },
  failedAttemptRetained: true, sourceSha256: sha(await readFile(new URL(import.meta.url))),
  conversionsPerformed: 0, noBrowserOrBuild: true, existingReceiptsUnmodified: true };
await writeFile(new URL("evidence/progress-full-terminal-analysis-source-archive-2026-10-10.json", root), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(report));
