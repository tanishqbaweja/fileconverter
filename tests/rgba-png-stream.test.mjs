// Synthetic strip/PNG algorithm tests, not browser conversion qualification.
import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";
import { build } from "esbuild";
const bundle = await build({ stdin: { contents: 'export * from "./workers/rgba-png-stream.ts";', loader: "ts", resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", write: false });
const { writeRgbaPngStrips, pngStripObservation } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
function decode(bytes, width, height) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
  const compressed = []; let offset = 8, sawEnd = false;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
    assert.ok(length <= 65524);
    assert.equal(crc(bytes.subarray(offset + 4, offset + 8 + length)), bytes.readUInt32BE(offset + 8 + length));
    if (type === "IHDR") {
      assert.equal(bytes.readUInt32BE(offset + 8), width); assert.equal(bytes.readUInt32BE(offset + 12), height);
      assert.equal(bytes[offset + 16], 8); assert.equal(bytes[offset + 17], 6);
    } else if (type === "IDAT") compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    else { assert.equal(type, "IEND"); assert.equal(length, 0); sawEnd = true; }
    offset += length + 12;
  }
  assert.equal(offset, bytes.length); assert.equal(sawEnd, true);
  const filtered = inflateSync(Buffer.concat(compressed)), rowBytes = width * 4, output = Buffer.alloc(width * height * 4);
  assert.equal(filtered.length, (rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const input = y * (rowBytes + 1), out = y * rowBytes; assert.equal(filtered[input], 1);
    for (let x = 0; x < rowBytes; x++) output[out + x] = filtered[input + x + 1] + (x < 4 ? 0 : output[out + x - 4]);
  }
  return output;
}

test("streamed synthetic RGBA retains every channel/alpha byte, validates CRC/zlib and serial slow writes", {timeout:10000}, async () => {
  const width = 257, height = 269, original = new Uint8Array(width * height * 4);
  for (let i = 0; i < original.length; i++) original[i] = (i * 113 + (i >>> 9)) & 255;
  let released = 0, pending = 0, peak = 0;
  async function* strips() { try { for (let y = 0; y < height; y += 17) yield original.slice(y * width * 4, Math.min(y + 17, height) * width * 4); } finally { released++; } }
  const observation = pngStripObservation(), output = [];
  await writeRgbaPngStrips({ width, height, strips: strips(), observation, assertActive() {},
    async write(bytes) { pending++; peak = Math.max(peak, pending); await new Promise(resolve => setTimeout(resolve, 1)); output.push(Buffer.from(bytes)); pending--; } });
  assert.deepEqual(decode(Buffer.concat(output), width, height), Buffer.from(original));
  assert.equal(released, 1); assert.equal(peak, 1); assert.equal(observation.maximumPendingWrites, 1);
  assert.equal(observation.rows, height); assert.ok(observation.maximumFilteredBytes <= 262144);
  assert.ok(observation.maximumWriteBytes <= 65536); assert.equal(observation.outputBytes, Buffer.concat(output).length);
});

test("write rejection closes producer, emits no IEND and preserves the original error over cleanup", {timeout:10000}, async () => {
  const failure = new Error("owned synthetic write failure"); let returned = 0, writes = 0;
  const strips = { [Symbol.asyncIterator]() { return {
    async next() { return { done: false, value: new Uint8Array(4096) }; },
    async return() { returned++; throw new Error("secondary generator cleanup"); },
  }; } };
  await assert.rejects(writeRgbaPngStrips({ width: 32, height: 4096, strips, observation: pngStripObservation(), assertActive() {},
    async write() { if (++writes === 3) throw failure; } }), error => error === failure);
  assert.equal(returned, 1); assert.equal(writes, 3);
});

test("cancellation before another strip/write preserves cancellation and returns generator once", {timeout:10000}, async () => {
  let cancelled = false, returned = 0, produced = 0;
  const failure = new Error("synthetic cancellation");
  async function* strips() { try { while (true) { produced++; if (produced === 3) cancelled = true; yield new Uint8Array(1024); } } finally { returned++; } }
  await assert.rejects(writeRgbaPngStrips({ width: 16, height: 4096, strips: strips(), observation: pngStripObservation(),
    assertActive() { if (cancelled) throw failure; }, async write() {} }), error => error === failure);
  assert.equal(returned, 1); assert.equal(produced, 3);
});

test("invalid dimensions, oversized/misaligned/short/excess strips never produce a valid completed PNG", {timeout:10000}, async () => {
  const base = { width: 8, height: 2, observation: pngStripObservation(), assertActive() {}, async write() {} };
  for (const dimensions of [{width: 0}, {width: 8193}, {width: 8192, height: 8192}, {height: 1.5}])
    await assert.rejects(writeRgbaPngStrips({...base,...dimensions}), /dimensions/);
  for (const lengths of [[0], [31], [32], [96], [262144]]) {
    const output = [];
    async function* strips() { for (const length of lengths) yield new Uint8Array(length); }
    await assert.rejects(writeRgbaPngStrips({...base, strips: strips(), observation: pngStripObservation(), async write(bytes) { output.push(Buffer.from(bytes)); } }), /strip|height/);
    assert.ok(!output.some(bytes => bytes.toString("ascii",4,8) === "IEND"));
  }
});

test("header sink failure releases iterator without requesting pixels", {timeout:10000}, async () => {
  let returned = 0;
  const strips = { [Symbol.asyncIterator]() { return { async next() { assert.fail("Must not read"); }, async return() { returned++; return {done:true}; } }; } };
  await assert.rejects(writeRgbaPngStrips({width: 1,height: 1,strips,observation:pngStripObservation(),assertActive() {}, async write() {throw new Error("header failed");}}), /header failed/);
  assert.equal(returned, 1);
});
