// Read-only bounded result inspection. Never print full sample or packet arrays.
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const terminal = JSON.parse(await readFile("evidence/2026-10-18T02-18-29-564Z-jspi-full-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path), { maxOutputLength: 33554432 }));
const compact = value => JSON.stringify(value, null, 2).slice(0, 2000);
console.log(JSON.stringify({ status: report.status, failure: report.failure, sourceBytes: report.source.bytes,
  blank: report.blankBaseline, loaded: report.loadedIdle,
  runs: report.runs.map(run => ({ number: run.number, keys: Object.keys(run), state: run.state,
    peakPrivateBytes: run.peakPrivateBytes, incrementalPrivateMiB: run.incrementalPrivateMiB,
    independentSsimDiagnostic: run.independentSsimDiagnostic, independentValidation: run.independentValidation,
    independentPreAssertionProbe: run.independentPreAssertionProbe?.streams.map(({ codec_name, codec_type, width, height, nb_read_frames }) => ({ codec_name, codec_type, width, height, nb_read_frames })),
    recovery: run.recovery, lifecycle: run.jspiLifecycle })),
  phases: report.nativeMemory.phases.map(row => ({ phase: row.phase, valid: row.validSamples, unavailable: row.unavailableSamples, peak: row.peak.slice(0, 6) })),
  sourcePins: Object.keys(report.sourceHashes).length, bitrate: report.bitrateAuditSamples, stacks: report.nativeStackSamples,
  ownership: report.splitFinalSamples, lifecycle: report.jspiLifecycleFinalSamples,
  logs: report.logs.slice(-12).map(compact), checkpoint: report.nativeMemory.durableCheckpoint,
  memoryCapture: { evaluated: report.nativeFailureCapture.evaluatedConversionSamples, firstFailure: report.nativeFailureCapture.firstFailure },
  cleanup: Object.fromEntries(Object.entries(report.cleanup).filter(([, value]) => typeof value === "boolean")) }, null, 2));
