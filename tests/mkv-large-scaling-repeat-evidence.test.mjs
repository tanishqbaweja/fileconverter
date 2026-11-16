import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { renderScalingRepeatReport, deriveScalingRepeatWindow } from "../scripts/lib/mkv-large-scaling-repeat-report.mjs";
import { largeScalingReference, readLargeScalingReference } from "../scripts/lib/mkv-large-scaling-reference.mjs";
const file = "evidence/2026-11-16T00-22-35-030Z-mkv-hevc-header-core-scale-5gb-repeats.json";
const read = name => readFile(new URL(`../${name}`, import.meta.url));
const sha = b => createHash("sha256").update(b).digest("hex");

test("actual real5.35GB repeats FAIL during second job at321.46MiB; first full byte identity passes, unclassified234MiB child stays included", async () => {
  const bytes = await read(file); assert.equal(sha(bytes), "0dd0aa257a95ca34970e8b55f4a915cec9444e0ede3f21a88412f195af429638");
  const r = JSON.parse(bytes), [a] = r.arms, [c, second] = a.cases;
  assert.equal(r.status, "failed-not-acceptance"); assert.equal(r.arms.length, 1); assert.equal(a.cases.length, 2);
  const ref = readLargeScalingReference(await read(largeScalingReference.file), r.candidateBuild);
  assert.deepEqual(r.largeScalingReference, ref); assert.equal(r.fixture.bytes, ref.sourceBytes); assert.equal(r.fixture.sha256, ref.sourceSha256);
  assert.equal(c.state, "complete"); assert.equal(c.metrics.outputBytes, ref.outputBytes); assert.equal(c.validation.outputSha256, ref.outputSha256);
  assert.equal(c.validation.fullDecode, false); assert.equal(c.validation.fullDecodedContentInheritedThroughWholeOutputIdentity, true);
  assert.ok(c.validation.independentValidation.noValidationReplay && c.outputRemoved);
  assert.equal(c.metrics.elapsedMs, 48766.625); assert.equal(c.memory.incrementalPrivateMiB, 195.859375); assert.equal(c.cleanupAboveIdleMiB, 3.17578125);
  assert.equal(second.state, undefined); assert.equal(second.outputRemoved, undefined);
  assert.equal(a.memory.incrementalPrivateMiB, 321.4609375); assert.equal(a.memory.validSamples, 1234); assert.equal(a.memory.unavailableSamples, 1);
  const child = a.memory.peak.processes.find(p => p.pid === 27200);
  assert.equal(child.privateBytes, 245436416); assert.equal(child.createdAt, "2026-11-16T00:26:35.4327709Z");
  assert.equal(a.observer.birthTypeCapture.queries, 16); assert.equal(a.observer.birthTypeCapture.maximumQueries, 16);
  const unqueried = a.observer.birthTypeCapture.records.find(p => p.creationFileTime === child.creationFileTime && p.pid === child.pid);
  assert.equal(unqueried.attempts, 0); assert.equal(unqueried.status, "not-yet-queried"); assert.equal(unqueried.utilitySubtype, null);
  assert.equal(a.preCleanupJob.state, "running"); assert.ok(a.preCleanupJob.metrics.outputBytes > 5e9);
  assert.equal(a.jobCleanup.terminalState, "complete"); assert.equal(a.jobCleanup.cancellationRequested, false); // race: converter finished during failure cleanup
  assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(a.browserCleanup.observedPids.length, 53);
  assert.deepEqual(r.originalBefore, r.originalAfter); assert.equal(r.originalAfter.bytes, 2958573265);
  assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(a.nativeJournalMode, "every-100ms-native-row-in-finite-repeat-archive-no-thinning");
  assert.deepEqual(a.forbiddenRequests, []); assert.equal(r.publicAcceptance, false); assert.equal(r.nativeConversionUsed, false);
});

test("failed-repeat native journal independently rederives both windows and reproducible truthful partial CSV/HTML; no failed sample becomes zero", async () => {
  const r = JSON.parse(await read(file)), [a] = r.arms, packed = await read(a.archive.file);
  assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
  const samples = JSON.parse(raw), [first, second] = a.cases;
  assert.deepEqual(deriveScalingRepeatWindow(samples, first.conversionWindow, a.blank.privateBytes), first.memory);
  const failure = deriveScalingRepeatWindow(samples, { ...second.conversionWindow, end: a.memory.end }, a.blank.privateBytes);
  assert.equal(failure.incrementalPrivateMiB, 321.4609375); assert.equal(failure.validSamples, 788); assert.equal(failure.unavailableSamples, 0);
  assert.equal(first.memory.validSamples, 446); assert.equal(first.memory.unavailableSamples, 1);
  const rendered = renderScalingRepeatReport(r, [samples]);
  assert.equal(rendered.csv, (await read(file.replace(/\.json$/, ".csv"))).toString());
  assert.equal(rendered.html, (await read(file.replace(/\.json$/, ".html"))).toString());
  assert.match(rendered.html, /321\.461/); assert.match(rendered.html, /failed-not-acceptance/);
  assert.match(rendered.html, /NOT a fresh native decode/); assert.match(rendered.csv, /321\.4609375,unavailable,788,0/);
  assert.doesNotMatch(rendered.html, /<script|https?:\/\//);
});
