import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const relative = process.argv[2];
assert.match(relative ?? "", /^outputs\/reports\/[^/]+-private-h264-720p-memory\.json$/);
const bytes = await readFile(path.join(root, relative)), report = JSON.parse(bytes);
assert.equal(report.asBuiltManifest.initialWasmMemoryBytes, 33554432);
assert.equal(report.asBuiltManifest.maximumWasmMemoryBytes, 33554432);
assert.equal(report.asBuiltManifest.allowMemoryGrowth, false);
assert.equal(report.asBuiltManifest.artifacts["within-h264.wasm"], "73ba180c4e49522081b0148143b13b09ee8a0e8e2eebcf1d7461691d5b7dfd37");
assert.equal(report.source.sha256, "938eb61229f60a434cc3fede71829e96c30a1d42a64a468d7efc2c7a43622839");
assert.equal(report.publicProfilesChanged, false);
assert.ok(!(await readdir(path.join(root, "work"))).some((name) => name.startsWith("h264-memory-") || name.startsWith("h264-download-") || name.startsWith("h264-candidate-download-")));
await assert.rejects(stat(path.join(root, "dist/client/engines/remux/_candidate_h264_base.mjs")), { code: "ENOENT" });
const evidence = { recordedAt: new Date().toISOString(), requirement: "M-04",
  status: `private-h264-32MiB-${report.status}`,
  hostedBuild: { runId: 37155139021, commit: "08a9d8f6777f865a1239af568ce4a3a764f0abd0", buildSeconds: 307,
    cleanupPassed: true, remoteRemainingArtifacts: 0, sourceBundleDownloaded: false },
  rawReport: relative, rawReportSha256: createHash("sha256").update(bytes).digest("hex"), report,
  publicAcceptance: false,
  remaining: ["multi-gigabyte scaling", "clean-session repeats", "direct successful destination", "cancellation/recovery",
    "controls and complex-stream fidelity", "speed A/B", "exact reproduction", "legal deployment review", "public integration"],
};
const output = path.join(root, "evidence/h264-private-memory-32-2026-10-04.json");
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\n`);
