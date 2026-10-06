import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const file = "output/playwright/2026-10-06T15-33-23-298Z-renderer-attribution-prerequisite.json";
const raw = await readFile(path.join(root, file)), report = JSON.parse(raw);
assert.equal(report.status, "completed-diagnostic"); assert.equal(report.result.status, "completed-diagnostic");
assert.equal(report.converterLoaded, false); assert.equal(report.originalRead, false);
assert.equal(report.conversionsPerformed, 0); assert.equal(report.identicalOriginalFlags, true);
assert.equal(report.result.trace.overflow, false); assert.equal(report.result.trace.dataLossOccurred, false);
assert.equal(report.result.trace.serializedBytes, 3173906); assert.equal(report.result.trace.events, 746);
assert.equal(report.result.dumps.length, 3); assert.equal(report.result.allocatorSummary.length, 3);
assert.equal(report.result.realmRows.length, 19);
for (const value of Object.values(report.cleanup)) assert.equal(value, true);
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
for (const [source, digest] of Object.entries(report.sourcePins))
  assert.equal(sha(await readFile(path.join(root, source))), digest, source);
const proof = { ...report, report: { path: file, bytes: raw.length, sha256: sha(raw) },
  completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false,
  traceProcessOwnership: "Blank prerequisite has no OS process join; trace names alone do not prove attribution to the tested site",
  sourcePins: { ...report.sourcePins, "scripts/freeze-renderer-attribution-prerequisite.mjs": sha(await readFile(new URL(import.meta.url))) } };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 64 * 1024);
await writeFile(path.join(root, "evidence/renderer-attribution-prerequisite-2026-10-06.json"), json, { flag: "wx" });
console.log("Frozen blank-only attribution prerequisite; no conversion acceptance");
