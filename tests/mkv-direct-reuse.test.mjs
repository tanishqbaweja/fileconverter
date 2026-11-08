import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { transform } from "esbuild";
import { prepareMkvDirectReuseOverlay } from "../scripts/lib/mkv-direct-reuse-overlay.mjs";
import { compareSmallMkvPacketClocks } from "../scripts/lib/mkv-direct-packet-clocks.mjs";

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
  assert.equal(audio.maximumPtsErrorUs, 0);
  assert.throws(() => compareSmallMkvPacketClocks(source, output.slice(1)));
  const bad = structuredClone(output); bad[3].dts_time = "-0.090000"; bad[3].pts_time = "0.069000";
  assert.equal(compareSmallMkvPacketClocks(source, bad)[0].outputDtsMonotonic, false);
  assert.equal(compareSmallMkvPacketClocks(source, bad)[0].maximumPtsErrorUs, 6000);
  bad[3].pts_time = "N/A";
  assert.throws(() => compareSmallMkvPacketClocks(source, bad));
});
