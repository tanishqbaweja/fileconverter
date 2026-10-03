import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const candidate = path.join(root, "work/h264-candidate-output");
const report = JSON.parse(await readFile(path.join(root, "output/playwright/h264-candidate.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(candidate, "build-manifest.json"), "utf8"));
const failure = report.rows.findLast((row) => row.state?.error?.startsWith("Candidate ccall:"));
if (!failure) throw new Error("Expected actual symbol-stack browser failure, not a source-only or alias result.");
const diagnostic = report.rows.findLast((row) => row.samples);
const hash = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
for (const file of ["within-h264.mjs", "within-h264.wasm"]) {
  if (await hash(path.join(candidate, file)) !== manifest.artifacts[file]) throw new Error("Candidate artifact mismatch.");
}
const files = ["media/ffmpeg/h264-candidate.c", "media/ffmpeg/make-h264-candidate.mjs", "media/ffmpeg/build-h264-candidate.sh",
  "media/ffmpeg/h264-candidate-manifest.mjs", "scripts/stage-h264-candidate.mjs", "tests/browser/h264-candidate.spec.ts"];
const evidence = {
  recordedAt: new Date().toISOString(), requirement: "M-04", status: "partial-private-candidate-runtime-failed-no-public-profile",
  scope: "Real source-pinned Wasm build and production-worker browser feasibility; not conversion acceptance, speedup, quality, memory or unsupported certification",
  buildAttempts: [
    { runId: 37127085458, commit: "be295ead8d245f5368c831b609fcaa895c7f4c69", result: "failed",
      phase: "FFmpeg configure after successful OpenH264 static compilation", reason: "emconfigure replaces PKG_CONFIG_LIBDIR/PATH; EM_PKG_CONFIG_PATH was missing",
      cleanup: "hosted cleanup step passed", retainedArtifacts: 0 },
    { runId: 37127410903, commit: "807038b6cf430531e77bd402da8cbf7b34fd57ed", result: "passed",
      phase: "genuine OpenH264/FFmpeg Wasm compile/link", buildStepStartedAt: "2026-10-03T13:48:44Z", buildStepCompletedAt: "2026-10-03T13:53:43Z",
      cleanup: "hosted cleanup step passed", artifactId: 11274559088 },
  ],
  asBuiltManifest: manifest,
  artifactBytes: Object.fromEntries(await Promise.all(["within-h264.mjs", "within-h264.wasm"].map(async (file) => [file, (await stat(path.join(candidate, file))).size]))),
  currentSources: Object.fromEntries(await Promise.all(files.map(async (file) => [file, await hash(path.join(root, file))]))),
  browser: { name: "Chrome", version: "154.0.8037.93", headed: false, productionBuild: true, productionSecurityHeaders: true,
    adapter: "Disposable dist module substitution; original production worker, File, AVIO, writer, backpressure and cancellation remain unchanged. No public selector/route claim.",
    rejectedAdapter: "Context routing alone did not cover planner-selected MPEG4 specialist; mixed/wrong assets were detected by the 64 MiB memory check and discarded.",
    attempts: [
      { scope: "initial context-route adapter", tests: 3, passed: 1, failed: 2, acceptedH264Conversions: 0,
        note: "Passed write-failure case used the existing engine, so it is not new H264 evidence." },
      { scope: "staged candidate MP4/MKV/recovery", tests: 3, passed: 0, failed: 3, acceptedH264Conversions: 0,
        note: "Both conversions trapped; write-failure/recovery timed out. Nothing certified. Diagnostic heap queries are now deadline-bounded with at most one outstanding query per realm." },
      { scope: "initial focused stack diagnostic", tests: 1, passed: 0, failed: 1, acceptedH264Conversions: 0,
        note: "The adapter did not capture a synchronous ccall throw; corrected to async try/await/catch before the next diagnostic attempt." },
      { scope: "focused stack diagnostic", tests: 1, passed: 0, failed: 1, acceptedH264Conversions: 0,
        note: "Native stack captured after 2385 partial output bytes; fixture output and OPFS removed." },
    ],
    latestFailure: { kind: failure.container, state: failure.state.jobState, selectedAdapterProfile: failure.state.selectedProfileId,
      error: failure.state.error, metrics: failure.state.metrics, warnings: failure.state.warnings,
      workerCountCaveat: "Adapter-route worker count reflects the existing specialist policy, not a certified H264 count; candidate pool is zero and process-tree samples are retained independently." },
  },
  diagnosticMemory: {
    primaryIncrementalPrivateMiB: null, acceptance: "not-evaluated: failed short conversion and non-stabilized baseline",
    excludesFailedSamplesFromCalculations: true, samples: diagnostic?.samples ?? [],
    noPrivateMemoryZeroSubstitution: true,
  },
  copyrightAndPatentSources: ["https://www.openh264.org/faq.html", "https://www.ffmpeg.org/legal.html"],
  diagnosisSources: ["https://github.com/emscripten-core/emscripten/blob/6.0.4/tools/building.py",
    "https://emscripten.org/docs/porting/guidelines/function_pointer_issues.html"],
  nextAction: "Build same candidate with profiling function names and symbol map; identify the typed native call site before considering a targeted fix. Do not use the Emscripten cast emulator as a presumed speed-preserving fix.",
  requiredUnpassedGates: manifest.requiredUnpassedGates,
  publicProfilesChanged: false, publicEnginesChanged: false, protectedTestMkvUsed: false,
  cleanup: { status: "pending-final-local-and-remote-cleanup", generatedFixturesRemovedByAfterAll: true,
    validationOutputsRemovedByFinally: true, defaultTempArtifactZip: "GitHub CLI used a transient default-temp ZIP; it was observed and verified removed. Subsequent downloads must set TEMP/TMP to repository-local work.",
    sourceInspectionDirectoryRemoved: true },
};
const output = path.join(root, "evidence/h264-encoder-feasibility-2026-10-03.json");
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${output}\n`);
