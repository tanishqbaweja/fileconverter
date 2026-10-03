import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";

const root = path.resolve(import.meta.dirname, "..");
const relative = process.argv[2];
assert.match(relative ?? "", /^outputs\/reports\/[^/]+-h264-dimension-guard\.json$/);
const bytes = await readFile(path.join(root, relative)), dimensionReport = JSON.parse(bytes);
const writtenRelative = process.argv[3];
assert.match(writtenRelative ?? "", /^outputs\/reports\/[^/]+-h264-dimension-guard\.json$/);
const writtenBytes = await readFile(path.join(root, writtenRelative)), writtenReport = JSON.parse(writtenBytes);
assert.equal(writtenReport.status, "passed-dimension-rejection");
assert.equal(writtenReport.prefixSeconds, 3); assert.equal(writtenReport.source.frames.length, 96);
assert.ok(writtenReport.state.metrics.outputBytes > 0);
assert.deepEqual(writtenReport.opfsSizesAfterJob, []);
assert.equal(dimensionReport.status, "passed-dimension-rejection");
assert.equal(dimensionReport.state.jobState, "error");
assert.match(dimensionReport.state.error, /source dimensions changed/);
assert.ok(dimensionReport.opfsSizesAfterJob.every((size) => size === 0));
assert.equal(dimensionReport.source.sha256, "76537275d7279b57f5e7ffa53d4f548d3684ed4156481d83c546d16420962b22");
const smallPath = "output/playwright/h264-candidate.json";
const smallBytes = await readFile(path.join(root, smallPath)), smallReport = JSON.parse(smallBytes);
assert.equal(smallReport.manifest.candidateKernelSha256, dimensionReport.asBuiltManifest.candidateKernelSha256);
const conversions = smallReport.rows.filter((row) => row.status === "passed" && row.container);
assert.equal(conversions.length, 2);
assert.ok(conversions.every((row) => row.frames === "48" && row.audioTracks === 2 && row.ssim >= 0.98));
assert.ok(smallReport.rows.some((row) => row.kind === "direct-write-failure" && row.status === "passed"));
const candidate = path.join(root, "work/h264-candidate-output");
const wasm = await readFile(path.join(candidate, "within-h264.wasm"));
assert.equal(createHash("sha256").update(wasm).digest("hex"), smallReport.manifest.artifacts["within-h264.wasm"]);
const limits = readWasmMemoryLimits(wasm);
assert.equal(limits.length, 1); assert.equal(limits[0].initialPages, 512); assert.equal(limits[0].maximumPages, 512);
const names = await readdir(path.join(root, "work"));
assert.ok(!names.some((name) => name.startsWith("h264-dimension-") && name !== "h264-dimension-baseline-37155139021"));
assert.ok(!names.some((name) => name.startsWith("h264-small-validation-") || name.startsWith("h264-candidate-download-")));
await assert.rejects(stat(path.join(root, "dist/client/engines/remux/_candidate_h264_base.mjs")), { code: "ENOENT" });
const evidence = { recordedAt: new Date().toISOString(), requirement: "M-04", status: "private-dimension-guard-fixed-and-browser-validated",
  historicalRegression: "evidence/h264-dimension-regression-2026-10-04.json", publicAcceptance: false,
  primaryIncrementalPrivateMiB: null, memoryScope: "Short non-stabilized diagnostic samples; not the complete-Chromium acceptance gate",
  hostedBuild: { runId: 37157670815, commit: "a1648ddfe48c0273d45e5cb4e395e7e837b79913", buildSeconds: 319,
    cleanupPassed: true, remoteArtifactsRemaining: 0, sourceBundleDownloaded: false },
  dimension: { rawReport: relative, rawReportSha256: createHash("sha256").update(bytes).digest("hex"), report: dimensionReport },
  failureAfterWrittenOutput: { rawReport: writtenRelative, rawReportSha256: createHash("sha256").update(writtenBytes).digest("hex"), report: writtenReport },
  ordinaryRegression: { rawReport: smallPath, rawReportSha256: createHash("sha256").update(smallBytes).digest("hex"), report: smallReport,
    testsPassed: 3, elapsedSuiteSeconds: 14.1 }, actualWasmMemoryLimits: limits,
  retainedStaticTools: ["work/h264-candidate-output", "work/h264-dimension-baseline-37155139021"],
  retentionReason: "New fixed private candidate and old exact static module for identical-settings speed/allocation A/B; no converted media retained. Recursive shell removal of the old module was blocked, so it was recoverably moved rather than bypassing that guard.",
  remaining: ["Complete-process <=250 MiB acceptance including cold-browser startup overlap", "scaling", "direct success/cancellation/recovery",
    "controls and complex fidelity", "speed A/B", "exact reproduction", "legal review", "public integration"],
};
await writeFile(path.join(root, "evidence/h264-dimension-fix-validation-2026-10-04.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
