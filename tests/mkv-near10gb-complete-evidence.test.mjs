import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { near10GbReference, readNear10GbReference } from "../scripts/lib/mkv-near10gb-reference.mjs";
import { renderNear10GbReport } from "../scripts/lib/mkv-near10gb-report.mjs";
import { replayLosslessNativeMemoryJournal } from "../scripts/lib/lossless-native-memory-journal.mjs";
import { renderCurrentScalingSeries } from "../scripts/lib/mkv-current-scaling-series.mjs";
import { headerProtectedReference } from "../scripts/lib/mkv-header-protected-reference.mjs";
import { largeScalingReference } from "../scripts/lib/mkv-large-scaling-reference.mjs";
const read = f => readFile(new URL(`../${f}`, import.meta.url)), sha = b => createHash("sha256").update(b).digest("hex");
async function load(reference, label = "near10gb") {
  const bytes = await read(reference.file); assert.equal(sha(bytes), reference.sha256); const report = JSON.parse(bytes), archive = report.arms[0].archive;
  const packed = await read(archive.file); assert.equal(sha(packed), archive.sha256); const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 });
  assert.equal(sha(raw), archive.decodedSha256); return { report, samples: JSON.parse(raw), reference: { ...reference, label }, bytes };
}
test("actual first9.51GB source/output COMPLETE decode equality, all packets/clocks and strict full-Chrome/cleanup limits pass; no repeat/public/speedup claim", async () => {
  const { report: r, bytes } = await load(near10GbReference), [a] = r.arms, [c] = a.cases, v = c.validation;
  const ref = readNear10GbReference(bytes, r.candidateBuild); assert.equal(ref.outputBytes, 9512261399); assert.equal(ref.noValidationReplay, true);
  assert.equal(ref.repeatsAcceptance, false); assert.equal(ref.sameExactNativeBuildRequired, true);
  assert.throws(() => readNear10GbReference(Buffer.from("wrong proof"), r.candidateBuild));
  const wrong = structuredClone(r.candidateBuild); wrong.runId = "different"; assert.throws(() => readNear10GbReference(bytes, wrong));
  assert.equal(c.metrics.elapsedMs, 91319.344999969); assert.equal(v.video.sourceEndUs, 19249568000); assert.equal(v.video.outputEndUs, 19249568000);
  assert.equal(v.sourceCompleteDecode.elapsedMs, 837491); assert.equal(v.outputCompleteDecode.elapsedMs, 766158);
  assert.equal(v.sourceCompleteDecode.completedProgressReports, 27); assert.equal(v.outputCompleteDecode.completedProgressReports, 25);
  assert.equal(v.outputCompleteDecode.decodedVideoSha256, "a54150788330b3e812a1111b8cfa08c481284395b5d14773fe8cfc519e33d835");
  assert.equal(v.outputCompleteDecode.decodedPcmSha256, "0b0050a08753fe15c62a658f72c4f1590ba82b0d7b66001e42f1f10189932d36");
  assert.equal(a.browserCleanup.observedPids.length, 59);
  assert.equal(r.sourcePins["scripts/lib/streamed-decoded-hash.mjs"], "baaf168e636c3c7f36acdfb3e8ce05f51c9f7ffb888695498339ec8fb06252d1");
  assert.equal(r.sourcePins["evidence/2026-11-16T01-23-38-047Z-decoded-timestamp-control.json"], "5ac325fd0a6908dfaff5ab9eef0ed098fd5330b788b2c097cbaa06ea336b8627");
});
test("all18434 native records replay losslessly; every conversion point/count/peak matches original blank and retained positive report", async () => {
  const { report: r, samples } = await load(near10GbReference), [a] = r.arms, j = a.losslessNativeArchive;
  const replay = await replayLosslessNativeMemoryJournal(j); assert.equal(replay.verified, true); assert.equal(replay.records, 18434);
  assert.equal(j.archiveBytes, 817685); assert.equal(j.bytes, 60088237);
  assert.equal(j.archiveSha256, "bea6df8f13a9f22da7b46f603f8d3807b913ce111b192e5f8ab663077e8c4360");
  assert.equal(j.sha256, "fe588ffb80c4a59f5434bc691dee84f09b212e221f5e0e7a40f5e18e6dbec967");
  assert.equal(a.memory.incrementalPrivateMiB, 245.2890625); assert.equal(a.memory.cleanupAboveIdleMiB, 18.171875);
  assert.equal(a.memory.validSamples, 837); assert.equal(a.memory.unavailableSamples, 0); assert.equal(samples.length, 2897);
  const rendered = renderNear10GbReport(r, samples);
  assert.equal(rendered.csv, (await read(near10GbReference.file.replace(/\.json$/, ".csv"))).toString());
  assert.equal(rendered.html, (await read(near10GbReference.file.replace(/\.json$/, ".html"))).toString());
  assert.match(rendered.html, /245\.289/); assert.match(rendered.html, /COMPLETE source and output video\/PCM independently decoded/);
  assert.match(rendered.html, /not repeated\/long-session\/public-release/); assert.doesNotMatch(rendered.html, /<script|https?:\/\//);
});
test("current three-size output graphs bind exact receipts and recomputed process totals without asserting flat memory or clearing prior failed repeats", async () => {
  const data = [await load(headerProtectedReference, "original"), await load(largeScalingReference, "synthetic-900loops"), await load(near10GbReference, "synthetic-1600loops")];
  const rendered = renderCurrentScalingSeries(data), prefix = "evidence/2026-11-16T02-06-06-112Z-mkv-current-core-scaling-series";
  assert.equal(rendered.csv, (await read(`${prefix}.csv`)).toString()); assert.equal(rendered.html, (await read(`${prefix}.html`)).toString());
  assert.deepEqual(rendered.summary, JSON.parse(await read(`${prefix}.json`)));
  assert.deepEqual(rendered.summary.points.map(p => p.incrementalPrivateMiB), [223.46484375, 173.59375, 245.2890625]);
  assert.equal(rendered.summary.flatMemoryProven, false); assert.equal(rendered.summary.repeatGatePassed, false); assert.equal(rendered.summary.productionSpeedupProven, false);
});
