import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSameMkvNativeBuild, protectedRepeatReference, readProtectedRepeatReference, summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
import { renderProtectedRepeatReport } from "../scripts/lib/mkv-protected-repeat-report.mjs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

test("Protected repeats bind to validated whole-output bytes even after an exact build gets a new ZIP", async () => {
  const bytes = await readFile(new URL(`../${protectedRepeatReference.file}`, import.meta.url));
  const report = JSON.parse(bytes), before = report.candidateBuild;
  const after = { ...before, artifact: { id: 42, digest: "sha256:" + "e".repeat(64), bytes: 12345 } };
  assertSameMkvNativeBuild(before, after);
  const reference = readProtectedRepeatReference(bytes, after);
  assert.equal(reference.outputBytes, 2962151594);
  assert.equal(reference.outputSha256, "247c77c371340f8bfb090dc8f8cfde22d83ca1e83483672847013527c50d937b");
  assert.equal(reference.fullVideoDecode, false);
  assert.throws(() => readProtectedRepeatReference(Buffer.concat([bytes, Buffer.from("\n")]), after));
  const changed = structuredClone(after);
  changed.build.artifacts["within-direct.wasm"].sha256 = "f".repeat(64);
  assert.throws(() => readProtectedRepeatReference(bytes, changed), /Exact native build/);
});

const sample = (ms, privateBytes) => ({ timestamp: new Date(ms).toISOString(), privateBytes,
  processes: privateBytes === null ? null : [{ privateBytes }] });

test("Each protected job uses its original blank baseline and only its own conversion window", () => {
  const mib = 1048576, blank = 100 * mib;
  const rows = [sample(100, 270 * mib), sample(150, null), sample(200, 290 * mib),
    sample(300, 900 * mib), sample(400, 310 * mib), sample(500, 320 * mib)];
  const first = summarizeProtectedWindow(rows, { start: 100, end: 200 }, blank);
  const second = summarizeProtectedWindow(rows, { start: 400, end: 500 }, blank);
  assert.equal(first.incrementalPrivateMiB, 190);
  assert.equal(first.validSamples, 2); assert.equal(first.unavailableSamples, 1);
  assert.equal(second.incrementalPrivateMiB, 220);
  assert.throws(() => summarizeProtectedWindow(rows, { start: 100, end: 500 }, blank), /250 MiB/);
  assert.throws(() => summarizeProtectedWindow(rows, { start: 150, end: 150 }, blank), /no valid/);
  const altered = [sample(100, 290 * mib)]; altered[0].processes[0].privateBytes--;
  assert.throws(() => summarizeProtectedWindow(altered, { start: 100, end: 100 }, blank));
});

test("Derived repeat report labels missing measurements unavailable and preserves incomplete status", () => {
  const report = { status: "failed-not-acceptance", originalBefore: { bytes: 2958573265 }, arms: [{ cases: [{ state: "error" }] }] };
  const { csv, html } = renderProtectedRepeatReport(report);
  assert.match(csv, /unavailable/);
  assert.match(html, /failed-not-acceptance/);
  assert.match(html, /S1 J1: unavailable/);
  assert.match(html, /not public-release or 10 GB acceptance/);
  assert.doesNotMatch(html, /<script|https?:\/\//);
  assert.throws(() => renderProtectedRepeatReport({ ...report, status: "running" }));
});

test("Actual protected repeats include three same-page jobs, a clean-session job and honest per-job memory", async () => {
  const read = file => readFile(new URL(`../${file}`, import.meta.url));
  const sha = value => createHash("sha256").update(value).digest("hex");
  const stem = "evidence/2026-11-14T08-57-02-899Z-mkv-exact-aac-protected-repeats";
  const bytes = await read(stem + ".json");
  assert.equal(sha(bytes), "f6104f45830821f14aa0fc0b366c98c683a3e24af7ed8583de9ef51d183899c3");
  const report = JSON.parse(bytes);
  assert.equal(report.status, "passed-protected-repeats-not-public-acceptance");
  assert.deepEqual(report.arms.map(arm => arm.cases.length), [3, 1]);
  assert.ok(report.arms.every(arm => arm.browser.version === "157.0.8103.51"));
  assert.equal(report.protectedReference.priorBrowserVersion, "156.0.8078.80");
  assert.equal(report.candidateBuild.build.artifacts["within-direct.wasm"].sha256, "f56a8592f81294dc07190f400d9ce1399361ebfe963a558ff63bff4041707be7");
  assert.notEqual(report.candidateBuild.artifact.id, 13598298761);
  readProtectedRepeatReference(await read(protectedRepeatReference.file), report.candidateBuild);
  const peaks = [], cleanup = []; let valid = 0, unavailable = 0, observed = 0;
  for (const arm of report.arms) {
    assert.equal(arm.status, "passed-protected-repeat-session");
    assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent);
    assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
    assert.deepEqual(arm.forbiddenRequests, []);
    observed += arm.browserCleanup.observedPids.length;
    const archive = await read(arm.archive.file);
    assert.equal(sha(archive), arm.archive.sha256);
    const raw = gunzipSync(archive, { maxOutputLength: 8 * 1024 ** 2 });
    assert.equal(sha(raw), arm.archive.decodedSha256);
    const samples = JSON.parse(raw);
    for (const row of arm.cases) {
      assert.equal(row.state, "complete");
      assert.ok(row.outputRemoved && row.selection.completeOriginalSelected);
      assert.equal(row.metrics.outputBytes, 2962151594);
      assert.equal(row.metrics.peakScratchBytes ?? 0, 0);
      assert.equal(row.validation.outputSha256, report.protectedReference.outputSha256);
      assert.equal(row.validation.fullVideoDecode, false);
      assert.equal(row.validation.serializedTimeline.tracks[1].edits[0].mediaTimeTicks, "5058");
      assert.ok(row.validation.structure.subtitleDisclosed && row.validation.structure.artworkDisclosed);
      assert.deepEqual(summarizeProtectedWindow(samples, row.conversionWindow, arm.blank.privateBytes), row.memory);
      assert.equal(row.cleanupAboveIdleMiB, (row.cleanupStable.privateBytes - arm.loaded.privateBytes) / 1048576);
      assert.ok(row.cleanupAboveIdleMiB <= 96);
      peaks.push(row.memory.incrementalPrivateMiB); cleanup.push(row.cleanupAboveIdleMiB);
      valid += row.memory.validSamples; unavailable += row.memory.unavailableSamples;
    }
  }
  assert.deepEqual(peaks, [211.33984375, 161.48046875, 219.328125, 201.74609375]);
  assert.deepEqual(cleanup, [-0.5078125, 30.4609375, 14.7109375, -4.3515625]);
  assert.equal(valid, 1503); assert.equal(unavailable, 1); assert.equal(observed, 98);
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.equal(report.originalBefore.bytes, 2958573265);
  assert.ok(report.toolDownloadRemoved);
  assert.equal(report.publicAcceptance, false);
  const rendered = renderProtectedRepeatReport(report);
  assert.equal((await read(stem + ".csv")).toString(), rendered.csv);
  assert.equal((await read(stem + ".html")).toString(), rendered.html);
});
