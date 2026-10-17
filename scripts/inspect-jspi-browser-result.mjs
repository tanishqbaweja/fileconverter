// Compact read-only result inspection; full evidence remains source/hash bound.
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path), { maxOutputLength: 33554432 }));
const control = report.progressProbe.successfulSaveControl;
if (process.argv[2] === "--tail") { console.log(JSON.stringify(control.rows.slice(-3))); process.exit(0); }
console.log(JSON.stringify({ terminalStatus: terminal.status, reportStatus: report.status, sourceCount: Object.keys(terminal.sourcePins).length,
  reportRecord: { path: terminal.report.path, bytes: terminal.report.bytes }, completed: control.successfulFixtureValidations,
  rowKinds: Object.fromEntries([...new Set(control.rows.map(row => row.kind ?? "validation"))].map(kind => [kind, control.rows.filter(row => (row.kind ?? "validation") === kind).length])),
  outputs: control.rows.filter(row => row.container === "mp4" && row.status === "passed" && row.sourceCodec === "hevc").map(row => ({ codec: row.outputCodec, frames: row.frames, bytes: row.outputBytes, sha256: row.outputSha256, ssim: row.ssim, elapsedMs: row.metrics.elapsedMs })),
  recoveries: control.rows.filter(row => row.kind === "validated-same-page-recovery"),
  journal: control.validatedControlCheckpoints.map(row => ({ count: row.completedValidatedControls, bytes: row.bytes })),
  lifecycleCount: control.jspiLifecycle.samples.length,
  blank: report.blankBaseline, loaded: report.loadedIdle, phases: report.nativeMemory.phases.map(row => ({ phase: row.phase,
    valid: row.validSamples, unavailable: row.unavailableSamples, peak: row.peak.slice(0, 6) })),
  samples: report.samples.length, unavailable: report.samples.filter(row => row.privateBytes == null).length,
  memoryCapture: { evaluated: report.nativeFailureCapture.evaluatedConversionSamples, unavailable: report.nativeFailureCapture.unavailableSamples, firstFailure: report.nativeFailureCapture.firstFailure },
  cleanup: Object.fromEntries(Object.entries(report.cleanup).filter(([, value]) => typeof value === "boolean")),
  events: report.progressProbe.handoffWorkerEventSummary }, null, 2));
