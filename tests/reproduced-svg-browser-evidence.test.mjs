import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
test("actual reproduced SVG functional pass stays a 264 MiB memory failure with exact generated provenance and owned cleanup", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-28-reproduced-svg-browser-terminal.json"));
  const wrapperBytes = await read(proof.wrapperReport); assert.equal(wrapperBytes.length, proof.wrapperReportBytes); assert.equal(sha(wrapperBytes), proof.wrapperReportSha256);
  const wrapper = JSON.parse(wrapperBytes), raw = await read(proof.browserReceipt.path);
  assert.equal(raw.length, proof.browserReceipt.bytes); assert.equal(sha(raw), proof.browserReceipt.sha256);
  const row = JSON.parse(raw); assert.equal(row.status, "failed-private-svg-browser-qualification");
  assert.equal(row.candidatePin.wasmSha256, "4068ccdc36f10df407150752bcae5af699dd1190700c5ebb78e578ea9aafab9d");
  assert.deepEqual([row.stats.expected, row.stats.unexpected, row.stats.skipped, row.stats.flaky], [10, 0, 0, 0]);
  assert.equal(row.memory.incrementalPrivateMiB, 264.29296875); assert.equal(row.memory.limitMiB, 250);
  assert.equal((row.memory.peak.privateBytes - row.blankBaseline.privateBytes) / 1048576, row.memory.incrementalPrivateMiB);
  assert.equal(row.memory.unavailableSamples, 0); assert.equal(row.baselineAdjusted, false);
  assert.equal(row.browserServicesDisabledByDriver, false); assert.equal(row.domSnapshotRecording, true); assert.equal(row.networkHarRecording, true);
  for (const [name, source] of Object.entries(wrapper.generatedSourceArchives)) {
    const bytes = gunzipSync(Buffer.from(source.gzipBase64, "base64"), { maxOutputLength: 262144 });
    assert.equal(bytes.length, source.bytes); assert.equal(sha(bytes), source.sha256);
    assert.equal(wrapper.generation[name + "Sha256"], source.sha256);
  }
  assert.equal(row.generatedQualification.driverSha256, wrapper.generation.driverSha256);
  assert.equal(row.generatedQualification.suiteSha256, wrapper.generation.suiteSha256);
  const archive = JSON.parse(await read(proof.executedSourceArchive)); assert.equal(archive.sourceCommit, row.executedHead);
  for (const [file, digest] of Object.entries(wrapper.sourcePins)) {
    const old = archive.files[file]; let bytes;
    if (old) { bytes = gunzipSync(Buffer.from(old.gzipBase64, "base64"), { maxOutputLength: 32768 }); assert.equal(bytes.length, old.bytes); assert.equal(sha(bytes), old.sha256); }
    else bytes = await read(file);
    assert.equal(sha(bytes), digest, file);
  }
  assert.equal(row.ownedRuntimeRemoved, true); assert.equal(wrapper.ownedGenerationRuntimeRemoved, true);
  assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent")); assert.equal(wrapper.processCleanup.status, "owned-identity-absent");
  assert.deepEqual(row.protectedOriginalAfter, row.protectedOriginalBefore); assert.equal(row.publicEngineReplacement, false);
});
test("lifecycle diagnostic that never stabilized its earliest blank remains unexecuted, not evidence for the hypothesis", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-28-svg-lifecycle-diagnostic-terminal.json"));
  const values = [];
  for (const entry of [proof.wrapper, proof.browser]) {
    const bytes = await read(entry.path); assert.equal(bytes.length, entry.bytes); assert.equal(sha(bytes), entry.sha256); values.push(JSON.parse(bytes));
  }
  const [wrapper, browser] = values;
  assert.equal(wrapper.lifecycleDiagnostic, true); assert.equal(wrapper.stats, null); assert.equal(wrapper.incrementalPrivateMiB, null);
  assert.equal(browser.blankBaseline, null); assert.equal(browser.blankSamples.length, 17);
  assert.equal(browser.lifecycleDiagnostic, undefined); assert.equal(browser.stats, undefined);
  assert.match(browser.failures[0], /Do not delay\/inflate the earliest stable blank baseline/);
  assert.equal(browser.ownedRuntimeRemoved, true); assert.equal(wrapper.ownedGenerationRuntimeRemoved, true);
  assert.ok(browser.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(wrapper.processCleanup.status, "owned-identity-absent");
  assert.deepEqual(browser.protectedOriginalBefore, browser.protectedOriginalAfter);
  assert.equal(proof.retainedNavigationHypothesis, "untested, not confirmed or rejected");
});
