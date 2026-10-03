import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const report = JSON.parse(await readFile(path.join(root, "output/playwright/h264-candidate.json"), "utf8"));
const output = path.join(root, "evidence/h264-browser-followup-2026-10-04.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const wasm = await readFile(path.join(root, "work/h264-candidate-output/within-h264.wasm"));
assert.equal(sha256(wasm), report.manifest.artifacts["within-h264.wasm"]);
assert.equal(report.manifest.artifacts["within-h264.wasm"], "5bae68ec6c1e1f1c69effb635a0bc174ce21a4584132a4bc9ded19f5dff2de42");
let previous;
try { previous = JSON.parse(await readFile(output, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
if (previous) assert.equal(previous.asBuiltManifest.artifacts["within-h264.wasm"], report.manifest.artifacts["within-h264.wasm"]);
const start = previous?.recordedReportRows ?? 0;
assert.ok(report.rows.length > start, "No new browser evidence to record.");
const testSourceSha256 = sha256(await readFile(path.join(root, "tests/browser/h264-candidate.spec.ts")));
const evidence = {
  recordedAt: new Date().toISOString(), requirement: "M-04", status: "private-typed-fix-browser-followup-publication-unproved",
  hostedBuild: { runId: 37131418144, commit: "3dce604b80568f73e24bee5dd26d72cd13879448", result: "passed", cleanup: "passed" },
  asBuiltManifest: report.manifest, wasmBytes: wasm.length,
  recordedReportRows: report.rows.length,
  batches: [...previous?.batches ?? [], { recordedAt: report.recordedAt, testSourceSha256, rows: report.rows.slice(start) }],
  interpretation: "Typed ForceIntraFrame fix removes the native call trap. Browser completion is distinct from independent validation; failed quality, duration or timeline gates remain failures. Tiny fixtures are not speed A/B or complete-process memory acceptance.",
  primaryIncrementalPrivateMiB: null, memoryCertification: "not-evaluated: diagnostic samples and non-stabilized blank baseline",
  publicProfilesChanged: false, publicEnginesChanged: false, protectedTestMkvUsed: false,
  cleanup: previous?.cleanup ?? { status: "pending-final-disposable-cleanup", generatedFixturesAndOutputsRemovedByFinally: true },
};
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${output}\n`);
