import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { combinedTreePeak, createNativeMemoryHistory } from "../scripts/lib/native-memory-history.mjs";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const e = JSON.parse(await read("evidence/h264-uninstrumented-direct-handle-native-100ms-2026-10-04.json"));
const r = e.report.data, run = r.runs[0], h = r.nativeMemory;

test("parallel 100-ms long gate retains every acquired native total and uses the greater native/CIM peak against the unchanged early baseline", () => {
  assert.equal(e.privateGatePassed, false); assert.equal(e.publicAcceptance, false);
  assert.equal(r.status, "failed"); assert.equal(r.nativeMemoryEnabled, true); assert.equal(r.nativeError, null);
  assert.equal(h.timeline.length, 2719); assert.equal(h.identities.length, 21);
  assert.equal(r.runs.length, 1); assert.equal(r.requestedRunCount, 3);
  const rootPid = h.identities.find((p) => p.type === "browser").pid;
  const history = createNativeMemoryHistory(rootPid);
  for (const transition of h.transitions) history.setPhase(transition.phase, transition.at);
  for (let first = 0; first < h.timeline.length; first += 256) {
    history.consume({ overflow: false, observerCpuMs: 0, samples: h.timeline.slice(first, first + 256).map((s) => ({
      sequence: s[0], timestamp: s[1], completedAt: s[1], nativeElapsedMs: s[5], sampleError: s[6],
      privateBytes: s[3], rssBytes: s[4], processes: s[7]?.map(([i, privateBytes, rssBytes]) => ({ ...h.identities[i], privateBytes, rssBytes })) ?? null,
    })) });
  }
  assert.deepEqual(history.report().timeline, h.timeline);
  assert.equal(h.timeline.filter((s) => s[3] == null).length, 3);
  const native = history.peaks(["pre-conversion-1", "conversion-1"]);
  assert.deepEqual(native, run.nativePeaks);
  assert.equal(native.validSamples, 2104); assert.equal(native.unavailableSamples, 2);
  const cim = r.samples.filter((s) => ["pre-conversion-1", "conversion-1"].includes(s.phase) && s.privateBytes != null);
  for (const s of cim) assert.equal(s.privateBytes, s.processes.reduce((sum, p) => sum + p.privateBytes, 0));
  const cimPeak = Math.max(...cim.map((s) => s.privateBytes));
  assert.equal(cimPeak, run.cimPeakPrivateBytes); assert.equal(cimPeak, 701640704);
  const combined = combinedTreePeak(cimPeak, native.peak.privateBytes, r.blankBaseline.privateBytes);
  assert.equal(combined.peakPrivateBytes, run.peakPrivateBytes); assert.equal(run.peakPrivateBytes, 719294464);
  assert.equal(combined.incrementalPrivateMiB, run.incrementalPrivateMiB); assert.equal(run.incrementalPrivateMiB, 434.55078125);
  assert.equal(r.primaryLimitMiB, 250); assert.equal(run.cleanup, null);
  const utility = r.utilityActivity.utilities.find((p) => p.utilitySubtype === "on_device_model.mojom.OnDeviceModelService");
  const atPeak = native.peak.processes.find((p) => p.pid === utility.pid);
  assert.equal(Date.parse(atPeak.createdAt), Date.parse(utility.createdAt));
  assert.equal(atPeak.type, "unknown"); assert.equal(atPeak.privateBytes, 279400448);
  assert.equal(native.peak.privateBytes, native.peak.processes.reduce((sum, p) => sum + p.privateBytes, 0));
});

test("the unchanged private candidate produces genuine exact-fidelity long H264 but is not promoted, with executed hashes and finally cleanup", async () => {
  assert.equal(sha(`${JSON.stringify(r, null, 2)}\n`), e.report.sha256);
  assert.equal(r.source.bytes, 1050296904); assert.equal(r.fixtureDurationSeconds, 600);
  assert.equal(r.asBuiltManifest.allocatorDiagnostic, false); assert.equal(r.cpuEnabled, false);
  assert.deepEqual(r.allocatorSamples, []); assert.equal(r.destinationMode, "direct-handle");
  assert.equal(run.state.jobState, "complete"); assert.equal(run.state.opfsName, null);
  const v = run.independentValidation;
  assert.equal(v.outputBytes, 194031981);
  assert.equal(v.outputSha256, "08b2da23c7c0deba576511af5c5fa77f36aac441607e00a1d03be10817478f7f");
  assert.equal(v.outputProbe.streams[0].codec_name, "h264");
  assert.deepEqual([v.outputProbe.streams[0].width, v.outputProbe.streams[0].height], [1280, 720]);
  assert.equal(v.outputFrameTimes.length, 18000); assert.equal(v.maximumFrameTimeErrorSeconds, 0);
  assert.equal(v.ordinalSsim, 0.987764); assert.equal(v.fullDecodePassed, true);
  assert.deepEqual(v.audioPacketHashes, r.source.audioPacketHashes);
  assert.equal(run.state.metrics.peakWasmMemoryBytes, 33554432);
  assert.equal(run.state.metrics.peakQueuedBytes, 166439); assert.equal(run.state.metrics.peakPendingOperations, 1);
  assert.deepEqual(r.forbiddenRequests, []);
  for (const [p, expected] of Object.entries(e.currentSources)) assert.equal(sha(await read(p)), expected, p);
  assert.equal(sha(await read(e.priorInstrumentedResult.path)), e.priorInstrumentedResult.sha256);
  assert.equal(r.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true); assert.equal(r.cleanup.generatedDistRestored, true);
  assert.equal(e.cleanup.convertedMediaBytesInWork, 0); assert.equal(e.cleanup.ownedBenchmarkChromeProcesses, 0);
  assert.equal(e.cleanup.hostedArtifactsRemaining, 0); assert.equal(e.cleanup.staticToolBytes, 67119065);
});
