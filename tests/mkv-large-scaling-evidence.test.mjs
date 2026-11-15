import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { renderLargeScalingReport } from "../scripts/lib/mkv-large-scaling-report.mjs";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
const file = "evidence/2026-11-15T09-42-55-791Z-mkv-hevc-header-core-scale-5gb.json";
const read = name => readFile(new URL(`../${name}`, import.meta.url));
const sha = b => createHash("sha256").update(b).digest("hex");

test("real 5.35GB browser remux completes all packet/clock/codec checks; interrupted full decoding remains INCOMPLETE, not accepted", async () => {
  const bytes = await read(file); assert.equal(sha(bytes), "5898cb81796508782f0b22512e582273ed29c7c29e1cc8c40378fdbb1eee230d");
  const r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases, v = c.validation;
  assert.equal(r.status, "failed-not-acceptance"); assert.equal(c.state, "complete");
  assert.equal(r.fixture.bytes, 5347972392); assert.equal(r.fixture.loops, 900);
  assert.equal(r.fixture.sha256, "5583bb8ed097334b08952765ef915c3e8062dd1290c561d4d62e58571389b9a7");
  assert.equal(c.metrics.outputBytes, 5350648699); assert.equal(c.metrics.elapsedMs, 49490.47500002384);
  assert.equal(v.outputSha256, "bc0d3bac6d8a18b9589b74bdb1bc7c035e1c7b4ee25d40c260360e1b5a38a835");
  assert.equal(v.video.packets, 259200); assert.equal(v.video.comparableDts, 259198);
  assert.equal(v.video.maximumPtsDeltaUs, 0); assert.equal(v.video.maximumDtsDeltaUs, 0); assert.equal(v.video.maximumIntervalErrorUs, 0);
  assert.equal(v.video.sourceEndUs, 10827868000); assert.equal(v.video.outputEndUs, 10827868000);
  assert.ok(v.video.packetBytesIdentical && v.aac.packetBytesIdentical); assert.equal(v.aac.packets, 507600);
  assert.equal(v.aac.initialSkipSamples, 1024); assert.deepEqual(v.codecConfiguration.source, v.codecConfiguration.output);
  assert.equal(v.incompleteDecode.role, "source"); assert.equal(v.incompleteDecode.completeDecodeClaimed, false);
  assert.equal(v.incompleteDecode.lastProgress.decodedFrames, 32707);
  assert.equal(v.incompleteDecode.lastProgress.finalProgressObserved, false);
  assert.equal(v.sourceCompleteDecode, undefined); assert.equal(v.outputCompleteDecode, undefined);
  assert.equal(v.completeDecodedVideoAndPcmEqual, undefined); assert.equal(v.candidateGate, undefined);
  const packed = await read(a.archive.file); assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
  const samples = JSON.parse(raw), memory = summarizeProtectedWindow(samples, c.conversionWindow, a.blank.privateBytes);
  assert.equal(memory.incrementalPrivateMiB, 198.69921875); assert.equal(memory.validSamples, 455); assert.equal(memory.unavailableSamples, 0);
  assert.equal(a.memory.cleanupAboveIdleMiB, null); // validation interruption is NOT a cleanup/stability pass
  assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(a.browserCleanup.observedPids.length, 53);
  assert.equal(a.jobCleanup.cancellationRequested, false); assert.equal(a.jobCleanup.terminalState, "complete");
  assert.deepEqual(r.originalBefore, r.originalAfter); assert.equal(r.originalAfter.bytes, 2958573265);
  assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(a.forbiddenRequests, []); assert.equal(r.nativeConversionUsed, false); assert.equal(r.publicAcceptance, false);
  const rendered = renderLargeScalingReport(r, samples);
  assert.equal(rendered.csv, (await read(file.replace(/\.json$/, ".csv"))).toString());
  assert.equal(rendered.html, (await read(file.replace(/\.json$/, ".html"))).toString());
  assert.match(rendered.html, /198\.699/); assert.match(rendered.html, /failed-not-acceptance/);
  assert.doesNotMatch(rendered.html, /<script|https?:\/\//);
});

test("preemptive stop targets exactly the owned source validator birth, not browser conversion, unrelated apps or a process tree", async () => {
  const prefix = "evidence/2026-11-15T09-50-29-730Z-owned-scaling-validator-stop";
  const plan = JSON.parse(await read(prefix + "-plan.json")), terminal = JSON.parse(await read(prefix + ".json"));
  assert.equal(terminal.outcome, "stopped-exact-owned-validator");
  for (const key of Object.keys(plan)) assert.deepEqual(terminal[key], plan[key]);
  assert.equal(terminal.main.pid, 8940); assert.equal(terminal.child.pid, 45312);
  assert.equal(terminal.child.parentPid, terminal.main.pid); assert.equal(terminal.processTreeKilled, false);
  assert.match(terminal.reason, /Projected two full content decodes exceed/);
  assert.equal(terminal.source, "work/mkv-direct-reuse-fixture-NSzKHT/within-test-scaled-hevc.mkv");
  assert.ok(Date.parse(terminal.child.createdAt) < Date.parse(terminal.completedAt));
});
