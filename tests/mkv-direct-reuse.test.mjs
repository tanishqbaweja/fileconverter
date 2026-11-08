import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { prepareMkvDirectReuseOverlay } from "../scripts/lib/mkv-direct-reuse-overlay.mjs";
import { compareSmallMkvPacketClocks } from "../scripts/lib/mkv-direct-packet-clocks.mjs";
import { inspectMkvMp4TimelineBoxes } from "../scripts/lib/mkv-mp4-timeline-boxes.mjs";

const read = file => readFile(new URL("../" + file, import.meta.url));
const paths = ["workers/conversion.worker.ts", "workers/media-remux.ts", "workers/random-access-destination.ts"];
const sources = Object.fromEntries(await Promise.all(paths.map(async file => [file, await read(file)])));
const raw = await read("scripts/lib/private-mkv-write-reuse.ts");
const { code } = await transform(raw.toString(), { loader: "ts", format: "esm" });
const { createMkvWriteReuse, MKV_REUSE_WRITE_BYTES } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

test("the two private MKV arms share exact destination routing and native inputs and differ only in the async write allocation", async () => {
  const asset = "/assets/direct-file-writer.worker-test.js";
  const fresh = prepareMkvDirectReuseOverlay(sources, "fresh", asset), reuse = prepareMkvDirectReuseOverlay(sources, "reuse", asset);
  for (const file of [paths[0], paths[2]]) assert.equal(fresh.files[file], reuse.files[file]);
  assert.equal(fresh.files[paths[1]], sources[paths[1]].toString());
  assert.match(fresh.files[paths[0]], /profileId === "mkv-to-mp4" && message.destination.mode === "staged-handle"/);
  assert.match(fresh.files[paths[0]], /DIRECT_REMUX_WRITE_CHUNK, true\);\n    } else if/);
  assert.match(reuse.files[paths[1]], /copyOutput: writable\.requiresOwnedWriteBuffer && !directReuse/);
  assert.match(reuse.files[paths[1]], /!writable\.writeSync &&\n    writable\.requiresOwnedWriteBuffer && maximumOutputWriteBytes === MKV_REUSE_WRITE_BYTES/);
  assert.equal(reuse.proof.exactSingleFactorVerified, true);
  assert.equal(reuse.proof.currentPublicRouteCompared, false);
  assert.notEqual(fresh.proof.mediaArmSha256, reuse.proof.mediaArmSha256);
  for (const arm of [fresh, reuse]) for (const file of paths) await transform(arm.files[file], { loader: "ts" });
  assert.throws(() => prepareMkvDirectReuseOverlay({ ...sources, [paths[0]]: Buffer.concat([sources[paths[0]], Buffer.from("\n")]) }, "reuse", asset));
  assert.throws(() => prepareMkvDirectReuseOverlay(sources, "release", asset));
});

test("shared input becomes a single reusable unshared buffer, held unchanged through backpressure", async () => {
  let release, received, backing;
  const ops = [], gate = new Promise(resolve => { release = resolve; });
  const write = createMkvWriteReuse(async operation => {
    assert.ok(operation.data.buffer instanceof ArrayBuffer);
    backing ??= operation.data.buffer;
    assert.equal(operation.data.buffer, backing);
    received = operation.data;
    ops.push([operation.position, [...operation.data]]);
    await gate;
  });
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
  const bytes = new Uint8Array(memory.buffer, 5, 4);
  bytes.set([1, 3, 5, 7]);
  const pending = write(100, bytes);
  bytes.fill(8);
  await assert.rejects(write(104, new Uint8Array([9])), /overlapping/);
  assert.deepEqual([...received], [1, 3, 5, 7]);
  assert.equal(backing.byteLength, MKV_REUSE_WRITE_BYTES);
  release(); await pending;
  await write(3, new Uint8Array([2, 4]));
  assert.deepEqual(ops, [[100, [1, 3, 5, 7]], [3, [2, 4]]]);
});

test("write failures propagate without retaining a pending operation; unsafe sizes and offsets never reach the writer", async () => {
  let calls = 0;
  const write = createMkvWriteReuse(async () => { if (++calls === 1) throw new DOMException("quota", "QuotaExceededError"); });
  for (const [position, size] of [[-1, 1], [0, 0], [0, MKV_REUSE_WRITE_BYTES + 1], [Number.MAX_SAFE_INTEGER, 2]])
    await assert.rejects(write(position, new Uint8Array(size)), /finite offset/);
  assert.equal(calls, 0);
  await assert.rejects(write(0, new Uint8Array([2])), error => error.name === "QuotaExceededError");
  await write(0, new Uint8Array([2]));
  assert.equal(calls, 2);
});

test("packet clocks match in each track's decode order and expose shifts, missing clocks, or nonmonotonic DTS", () => {
  const packet = (stream_index, pts_time, dts_time) => ({ stream_index, pts_time, dts_time });
  const source = [packet(0, "0.021000"), packet(1, "0.000000", "0.000000"), packet(0, "0.105000", "0.021000"), packet(0, "0.063000", "0.063000")];
  const output = [packet(1, "0.000000", "0.000000"), packet(0, "0.021000", "-0.021000"),
    packet(0, "0.104917", "0.021000"), packet(0, "0.063250", "0.063000")];
  const [video, audio] = compareSmallMkvPacketClocks(source, output);
  assert.equal(video.maximumPtsErrorUs, 250); assert.equal(video.outputDtsMonotonic, true); assert.equal(video.comparableDts, 2);
  assert.deepEqual([video.minimumPtsDeltaUs, video.maximumPtsDeltaUs, video.ptsDeltaSpreadUs], [-83, 250, 333]);
  assert.deepEqual(video.sourcePtsRangeUs, [21000, 105000]); assert.deepEqual(video.outputPtsRangeUs, [21000, 104917]);
  assert.equal(video.sourceFirstDtsUs, null); assert.equal(video.outputFirstDtsUs, -21000);
  assert.equal(audio.maximumPtsErrorUs, 0);
  assert.throws(() => compareSmallMkvPacketClocks(source, output.slice(1)));
  const bad = structuredClone(output); bad[3].dts_time = "-0.090000"; bad[3].pts_time = "0.069000";
  assert.equal(compareSmallMkvPacketClocks(source, bad)[0].outputDtsMonotonic, false);
  assert.equal(compareSmallMkvPacketClocks(source, bad)[0].maximumPtsErrorUs, 6000);
  bad[3].pts_time = "N/A";
  assert.throws(() => compareSmallMkvPacketClocks(source, bad));
});

test("MP4 clock metadata reads versioned edit lists and fragment origins without reading media payload", async () => {
  const box = (type, ...payload) => {
    const data = Buffer.concat(payload), head = Buffer.alloc(8);
    head.writeUInt32BE(data.length + 8); head.write(type, 4, "latin1"); return Buffer.concat([head, data]);
  };
  const words = (...values) => {
    const result = Buffer.alloc(values.length * 4);
    values.forEach((value, i) => result.writeUInt32BE(value >>> 0, i * 4)); return result;
  };
  const fixture = Buffer.concat([
    box("moov", box("mvhd", words(0, 0, 0, 1000, 0)),
      box("trak", box("tkhd", words(0, 0, 0, 1)), box("edts", box("elst", words(0, 1, 80, -1, 65536))),
        box("mdia", box("mdhd", words(0, 0, 0, 48000, 0)), box("hdlr", words(0, 0), Buffer.from("soun"))))),
    box("moof", box("traf", box("tfhd", words(0, 1)), box("tfdt", words(0x01000000, 0, 123)))), box("mdat", Buffer.alloc(512)),
  ]);
  const payloadAt = fixture.length - 512;
  const proof = await inspectMkvMp4TimelineBoxes(async (at, count) => {
    assert.ok(at + count <= payloadAt); return fixture.subarray(at, at + count);
  }, fixture.length);
  assert.deepEqual(proof.movie, { timeScale: 1000, durationTicks: "0" });
  assert.equal(proof.tracks[0].firstFragmentDecodeTimeTicks, "123");
  assert.deepEqual(proof.tracks[0].edits, [{ segmentDurationTicks: "80", mediaTimeTicks: "-1", mediaRateInteger: 1, mediaRateFraction: 0 }]);
  assert.equal(proof.mediaPayloadBytesRead, 0); assert.ok(proof.maximumReadBytes <= 24);
  await assert.rejects(inspectMkvMp4TimelineBoxes(async (at, count) => fixture.subarray(at, at + count), fixture.length - 1));
});

test("the real private MKV A/B is retained as a common timing failure, not a speedup or public regression", async () => {
  const digest = value => createHash("sha256").update(value).digest("hex");
  const cycle = JSON.parse(await read("evidence/2026-11-08-mkv-direct-reuse-cycle.json"));
  const receipts = await Promise.all(cycle.attempts.map(async ({ file, sha256 }) => {
    const bytes = await read(file); assert.equal(digest(bytes), sha256); return JSON.parse(bytes);
  }));
  assert.equal(receipts.length, 4);
  for (const report of receipts) {
    assert.equal(report.status, "failed-not-acceptance"); assert.equal(report.originalMediaSelected, false);
    assert.equal(report.fixtureRuntimeRemoved, true); assert.deepEqual(report.originalAfter, report.originalBefore);
    assert.ok(report.arms.every(a => a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent));
  }
  const result = receipts.at(-1), terminal = cycle.terminalControl;
  assert.equal(result.executedHead, terminal.executedHead);
  assert.equal(result.fixture.bytes, 5945358);
  assert.deepEqual(result.arms.map(a => a.mode), ["fresh", "reuse"]);
  for (const [index, arm] of result.arms.entries()) {
    assert.equal(arm.cases.length, 1); const job = arm.cases[0], v = job.validation;
    assert.equal(job.state, "complete"); assert.equal(job.metrics.outputBytes, 5948888);
    assert.equal(v.outputSha256, terminal.outputSha256BothArms); assert.equal(v.fullDecode, true);
    assert.equal(v.packetHashes, result.fixture.packetHashes);
    assert.deepEqual(v.clocks.map(c => c.packets), [288, 564]);
    assert.deepEqual(v.clocks.map(c => c.maximumPtsErrorUs), [83000, 83000]);
    assert.ok(v.clocks.every(c => c.outputDtsMonotonic));
    assert.equal(v.durationDeltaSeconds, terminal.containerDurationDeltaSeconds);
    assert.ok(v.durationDeltaSeconds >= terminal.durationDifferenceLimitSecondsExclusive);
    assert.ok(v.clocks.every(c => c.maximumPtsErrorUs > terminal.allowedPacketPtsDeltaUs));
    assert.deepEqual(arm.forbiddenRequests, []); assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
    const packed = await read(arm.archive.file), raw = gunzipSync(packed, { maxOutputLength: 4194304 });
    assert.equal(digest(packed), arm.archive.sha256); assert.equal(digest(raw), arm.archive.decodedSha256);
    const valid = JSON.parse(raw).filter(s => s.privateBytes !== null && Date.parse(s.timestamp) >= arm.memory.start && Date.parse(s.timestamp) <= arm.memory.end);
    assert.equal(valid.length, terminal.validSamplesFreshThenReuse[index]);
    assert.ok(valid.every(row => row.processes.reduce((sum, p) => sum + p.privateBytes, 0) === row.privateBytes));
    assert.equal((Math.max(...valid.map(s => s.privateBytes)) - arm.blank.privateBytes) / 1048576, terminal.wholeTreePrivateMiBFreshThenReuse[index]);
  }
  assert.equal(result.speedGainProven, false); assert.equal(result.publicAcceptance, false);
  assert.equal(terminal.publicStagedPathAffectedProven, false);
});
