import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectMediaSource, MAX_AIFF_INSPECTION_BYTES } from "../lib/media-source-inspection.ts";

// A bounded random-access unit double, NOT a generated media/stress fixture.
// It has no audio payload and throws if inspection tries to read one.
function aiffChunkDouble({ audioBytes = 2 ** 31, chunks = [["ID3 ", 10]], outside = false, formDelta = 0 } = {}) {
  const form = Buffer.alloc(12); form.write("FORM"); form.write("AIFF", 8);
  const commHeader = Buffer.alloc(8); commHeader.write("COMM"); commHeader.writeUInt32BE(18, 4);
  const comm = Buffer.alloc(18); comm.writeUInt16BE(1); comm.writeUInt32BE(48000, 2); comm.writeUInt16BE(16, 6);
  Buffer.from([0x40, 0x0e, 0xbb, 0x80, 0, 0, 0, 0, 0, 0]).copy(comm, 8);
  const ssnd = Buffer.alloc(8); ssnd.write("SSND"); ssnd.writeUInt32BE(audioBytes + 8, 4);
  const regions = new Map([[0, form], [12, commHeader], [20, comm], [38, ssnd]]), reads = [];
  let end = 54 + audioBytes + (audioBytes & 1); const audioEnd = end;
  for (const [id, length] of chunks) {
    const header = Buffer.alloc(8); header.write(id, 0, "ascii"); header.writeUInt32BE(length, 4);
    regions.set(end, header); end += 8 + length + (length & 1);
  }
  form.writeUInt32BE((outside ? audioEnd : end) - 8 + formDelta, 4);
  return { size: end, reads, audioEnd,
    slice(start, finish) {
      reads.push([start, finish]); const region = regions.get(start);
      assert.ok(region && finish - start <= region.length, "Inspection read audio or metadata payload instead of bounded chunk headers");
      return new Blob([region.subarray(0, finish - start)]);
    },
  };
}

test("AIFF metadata headers beyond a 2GiB audio chunk are discovered without reading the payload or allocating it", async () => {
  const source = aiffChunkDouble({ chunks: [["ID3 ", 10], ["AUTH", 7], ["ANNO", 5], ["(c) ", 9]] });
  const result = await inspectMediaSource(source, "aiff");
  assert.deepEqual(result.metadataSignals, ["ID3 tag", "Author", "Annotation", "Copyright"]);
  assert.equal(result.durationSeconds, 1); assert.equal(result.sampleRateHz, 48000);
  assert.equal(result.inspectedBytes, 78); assert.ok(result.inspectedBytes < MAX_AIFF_INSPECTION_BYTES);
  assert.ok(source.reads.some(([start]) => start > 2 ** 31));
  assert.ok(source.reads.every(([start, end]) => end - start <= 18));
});
test("AIFF odd chunk padding is skipped and metadata outside declared FORM is never accepted", async () => {
  const source = aiffChunkDouble({ audioBytes: 17, chunks: [["NAME", 3], ["ID3 ", 11]] });
  assert.deepEqual((await inspectMediaSource(source, "aiff")).metadataSignals, ["Name", "ID3 tag"]);
  const outside = aiffChunkDouble({ outside: true });
  const result = await inspectMediaSource(outside, "aiff"); assert.deepEqual(result.metadataSignals, []);
  assert.ok(outside.reads.every(([start]) => start < outside.audioEnd));
});
test("AIFF rejects truncated FORM or a chunk crossing its declared FORM boundary", async () => {
  await assert.rejects(inspectMediaSource(aiffChunkDouble({ formDelta: 2 }), "aiff"), /FORM.*truncated|truncated.*FORM/);
  await assert.rejects(inspectMediaSource(aiffChunkDouble({ formDelta: -2 }), "aiff"), /chunk.*FORM|FORM.*chunk/);
});
test("AIFF seeks remain bounded by a fixed chunk-count ceiling, independent of file size", async () => {
  const source = aiffChunkDouble({ chunks: [...Array.from({ length: 256 }, () => ["JUNK", 0]), ["ID3 ", 10]] });
  const result = await inspectMediaSource(source, "aiff");
  assert.deepEqual(result.metadataSignals, []); assert.ok(result.notes.some(note => /bounded inspection ceiling/.test(note)));
  assert.ok(source.reads.length <= 258); assert.ok(result.inspectedBytes <= MAX_AIFF_INSPECTION_BYTES);
});
test("real-input gate checks independently valid trailing tags and production UI bounded slices without claiming conversion or memory acceptance", async () => {
  const source = await readFile("scripts/validate-aiff-tail-inspection.mjs", "utf8");
  assert.match(source, /"-write_id3v2", "1"/); assert.match(source, /"-f", "hash", "-hash", "sha256"/);
  assert.match(source, /id3.offset >= sound.offset \+ 8 \+ sound.length && id3.offset > 262144/);
  assert.match(source, /before.result.metadataSignals.includes\("ID3 tag"\), false/);
  assert.match(source, /after.result.metadataSignals.includes\("ID3 tag"\), true/);
  assert.match(source, /headless: true/); assert.match(source, /windowsHide: true/);
  assert.match(source, /row.ui.slices.every\(read => read.bytes <= 22\)/);
  assert.match(source, /assert.equal\(row.ui.state, "idle"\)/);
  assert.match(source, /await runtime.close\(\)/); assert.match(source, /observeOwnedProcessExit\(browserIdentity\)/);
  assert.match(source, /conversionExecuted: false, nativeConversionUsed: false, publicProfilePromoted: false/);
  assert.doesNotMatch(source, /getByTestId\("convert-button"\)\.click|test\.mkv|--disable-features|--disable-gpu/);
});
