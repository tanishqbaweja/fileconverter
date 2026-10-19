// No browser launch, user-media read, conversion or diagnostic flags.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { attributeJspiRetention } from "./lib/jspi-retention-attribution.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofPath = "evidence/2026-10-19-jspi-three-full-independent-analysis.json", proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
const terminalBytes = await read(proof.terminal.path); assert.equal(sha(terminalBytes), proof.terminal.sha256);
const terminal = JSON.parse(terminalBytes), zip = await read(terminal.report.path);
assert.equal(sha(zip), terminal.report.sha256); const raw = gunzipSync(zip, { maxOutputLength: 33554432 });
assert.equal(sha(raw), terminal.report.restoredSha256); const analysis = attributeJspiRetention(JSON.parse(raw));
const ownSources = {};
for (const file of ["scripts/analyze-jspi-retention.mjs", "scripts/lib/jspi-retention-attribution.mjs", "tests/jspi-retention-attribution.test.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const output = "evidence/2026-10-19-jspi-retention-attribution-v2.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), analysis, ownSources,
  previousIndependentAudit: { path: proofPath, sha256: sha(proofBytes) }, report: terminal.report,
  newBrowserOrConversions: 0, originalMediaRead: false, nextAction: "Do not call this a monotonic renderer leak. Native phase-last renderer memory fell after run3 while GPU/other memory rose. Earlier realm snapshots were evicted, allocation cause remains unknown. Investigate a codec-settings-preserving speed candidate without repeating an unchanged multi-hour conversion.",
  publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: analysis.status, lastTreeDeltaBytes: analysis.changes.at(-1).deltaBytes,
  lastRendererDeltaBytes: analysis.lastRendererDeltaBytes, zeroGrowthProven: false, allocationCause: null }));
