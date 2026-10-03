import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const report = JSON.parse(await readFile(path.join(root, "output/playwright/h264-candidate.json"), "utf8"));
const candidate = path.join(root, "work/h264-candidate-output");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const file of ["within-h264.mjs", "within-h264.wasm"]) {
  assert.equal(sha256(await readFile(path.join(candidate, file))), report.manifest.artifacts[file]);
}
const sources = ["media/ffmpeg/h264-candidate.c", "media/ffmpeg/build-h264-candidate.sh",
  "media/ffmpeg/patches/matroska-bounded-no-cues.patch", "tests/browser/h264-candidate.spec.ts"];
const currentSources = Object.fromEntries(await Promise.all(sources.map(async (file) =>
  [file, sha256(await readFile(path.join(root, file)))])));
assert.equal(currentSources["media/ffmpeg/h264-candidate.c"], report.manifest.candidateKernelSha256);
assert.equal(currentSources["media/ffmpeg/build-h264-candidate.sh"], report.manifest.buildRecipeSha256);
assert.equal(currentSources["media/ffmpeg/patches/matroska-bounded-no-cues.patch"], report.manifest.matroskaNoCuesPatchSha256);
const conversions = report.rows.filter((row) => ["passed", "failed"].includes(row.status) && row.container);
const evidence = {
  recordedAt: new Date().toISOString(), requirement: "M-04", status: "private-h264-mux-timing-validation-not-public-certification",
  scope: "Small genuine production-browser encode and independent fidelity/timeline validation. Not stress, speed A/B, complete-process memory, legal review or public support certification.",
  hostedBuild: { runId: 37151713630, commit: "bf36505da196d0047a7afe2b21da234592f12e24" },
  asBuiltManifest: report.manifest, currentSources,
  browser: { name: "Chrome", version: "154.0.8037.93", headed: false, productionBuild: true,
    productionSecurityHeaders: true, adapters: "Private generated-dist module replacement only; original production File/worker/AVIO/backpressure/writer remain unchanged" },
  conversionValidation: { passed: conversions.filter((row) => row.status === "passed").length,
    failed: conversions.filter((row) => row.status === "failed").length },
  rows: report.rows,
  primaryIncrementalPrivateMiB: null,
  memoryCertification: "not-evaluated: diagnostic samples and non-stabilized blank baseline; no omitted processes or unavailable-as-zero substitution",
  publicProfilesChanged: false, publicEnginesChanged: false, protectedTestMkvUsed: false,
  requiredRemainingGates: ["stress/scaling/repeatability", "complete-process private memory <=250 MiB", "quality/bitrate/frame-rate/resolution options",
    "complex-stream/metadata/VFR fidelity", "direct successful output", "cancellation and recovery", "speed A/B", "reproducibility", "legal review", "registry/UI publication"],
  cleanup: { status: "pending-final-disposable-cleanup", generatedFixturesAndOutputsRemovedByFinally: true },
};
const output = path.join(root, "evidence/h264-timing-validation-2026-10-04.json");
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\n`);
