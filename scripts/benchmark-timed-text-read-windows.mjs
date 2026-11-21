// Matched engine A/B over the same native-generated, file-backed fixture.
// No browser launch, product output files or native application conversion.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openAsBlob } from "node:fs";
import { lstat, readFile, statfs } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createTimedTextCancellationFixture } from "./lib/timed-text-browser-fixture.mjs";

const baselineCommit = "e4a6fddc2c4e109b8f29fdff17261601ee89a629";
const baselineSha256 = "ffd961199ef0e306d5723ba618a96cfca3e410ded33d88b67e57780f81944150";
const engine = "workers/iso-timed-text-webvtt.ts";
const repo = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.argv.length, 2);
const disk = await statfs(repo);
assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 2, "Need 32 MiB free on the repository drive");

const rawBaseline = execFileSync("git", ["show", `${baselineCommit}:${engine}`],
  { cwd: repo, windowsHide: true, timeout: 5000, maxBuffer: 65536 });
assert.equal(sha(rawBaseline), baselineSha256);
const rawCandidate = await readFile(path.join(repo, engine));
assert.notEqual(sha(rawCandidate), baselineSha256);
const load = async bytes => {
  const code = stripTypeScriptTypes(bytes.toString("utf8"));
  const api = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  assert.equal(api.TIMED_TEXT_READ_BYTES, 131072);
  assert.equal(api.TIMED_TEXT_WRITE_BYTES, 65536);
  return api.runIsoTimedTextToWebVtt;
};

async function run(convert, source, track, cancel = false) {
  const hash = createHash("sha256"), writeSizes = [], warnings = [];
  const abort = new DOMException("Offline control stopped after the output threshold", "AbortError");
  let readCount = 0, readBytes = 0, maxRead = 0, outputBytes = 0, inFlightRead = 0, pending = 0, peakWrites = 0, cancelled = false;
  const began = performance.now();
  const operation = convert({
    size: source.size,
    assertActive() { if (cancel && outputBytes >= 65536) throw abort; },
    warn(message) { warnings.push(message); },
    async read(start, length) {
      assert.equal(++inFlightRead, 1);
      assert.ok(length <= 131072);
      readCount++; readBytes += length; maxRead = Math.max(maxRead, length);
      try { return new Uint8Array(await source.slice(start, start + length).arrayBuffer()); }
      finally { inFlightRead--; }
    },
    async write(bytes) {
      assert.equal(++pending, 1);
      peakWrites = Math.max(peakWrites, pending);
      assert.ok(bytes.length <= 65536 && writeSizes.length < 128);
      hash.update(bytes); outputBytes += bytes.length; writeSizes.push(bytes.length);
      await new Promise(resolve => setImmediate(resolve));
      pending--;
    },
  }, track);
  let counts;
  if (cancel) { await assert.rejects(operation, error => error === abort); cancelled = true; }
  else counts = await operation;
  const elapsedMs = performance.now() - began;
  assert.equal(inFlightRead + pending, 0);
  return { elapsedMs, readCount, readBytes, maxRead, outputBytes, sha256: hash.digest("hex"), writeSizes,
    peakWrites, warnings, counts, cancelled };
}

const median = values => {
  const sorted = values.toSorted((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};
const scratch = await createOwnedRuntimeScratch("timed-text-read-ab-");
let result;
try {
  const [baseline, candidate] = await Promise.all([load(rawBaseline), load(rawCandidate)]);
  const { input, ...fixture } = await createTimedTextCancellationFixture(scratch, path.join(repo, "fixtures/media/quicktime-source.mov"));
  const source = await openAsBlob(input);
  const data = [];
  for (const [track, expected] of [[fixture.trackIds[0], fixture.decoyOracle], [fixture.selectedTrackId, fixture.expected]]) {
    const samples = { baseline: [], candidate: [] };
    await run(baseline, source, track); await run(candidate, source, track);
    for (const label of ["baseline", "candidate", "candidate", "baseline", "candidate", "baseline", "baseline", "candidate",
      "baseline", "candidate", "candidate", "baseline", "candidate", "baseline", "baseline", "candidate"]) {
      samples[label].push(await run(label === "baseline" ? baseline : candidate, source, track));
    }
    for (const sample of [...samples.baseline, ...samples.candidate]) {
      assert.deepEqual([sample.counts.cues, sample.outputBytes, sample.sha256], [expected.cues, expected.bytes, expected.sha256]);
      assert.equal(sample.readBytes, samples.baseline[0].readBytes, "Do not read unselected media or extra bytes");
      assert.deepEqual(sample.writeSizes, samples.baseline[0].writeSizes);
      assert.deepEqual(sample.warnings, samples.baseline[0].warnings);
      assert.deepEqual(sample.counts, samples.baseline[0].counts);
      assert.equal(sample.peakWrites, 1);
    }
    const summary = Object.fromEntries(Object.entries(samples).map(([label, list]) => {
      const { elapsedMs: ignored, ...once } = list[0];
      void ignored;
      return [label, { ...once, medianMs: median(list.map(sample => sample.elapsedMs)), milliseconds: list.map(sample => sample.elapsedMs) }];
    }));
    data.push({ track, expected, ...summary });
  }
  assert.ok(data[1].candidate.readCount < data[1].baseline.readCount / 4, "Contiguous samples should remove at least 75% of file reads");
  const beforeCancel = await run(baseline, source, fixture.selectedTrackId, true);
  const afterCancel = await run(candidate, source, fixture.selectedTrackId, true);
  assert.deepEqual([afterCancel.writeSizes, afterCancel.sha256], [beforeCancel.writeSizes, beforeCancel.sha256]);
  assert.ok(afterCancel.readBytes <= beforeCancel.readBytes + 16384, "Cancellation may prefetch no more than a single payload window");
  result = { baselineCommit, baselineSha256, candidateSha256: sha(rawCandidate), fixture, data, beforeCancel, afterCancel };
} finally { await scratch.close(); }
await assert.rejects(lstat(scratch.directory), { code: "ENOENT" });
console.log(JSON.stringify({ ...result, scratchRemoved: true, browserLaunched: false, browserSpeedMeasured: false,
  browserMemoryMeasured: false, protectedOriginalRead: false }, null, 2));
