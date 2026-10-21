// Independent bounded SMALL fixture inspection only. Reads serialized sample
// durations, never media payloads, complete files or inferred DTS differences.
import assert from "node:assert/strict";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
const MAX_FILE = 2 * 1024 ** 2, MAX_METADATA = 262144;
const positive = (value, maximum) => assert.ok(Number.isSafeInteger(value) && value > 0 && value <= maximum);
const single = (boxes, type) => { const found = boxes.filter(box => box.type === type); assert.equal(found.length, 1, "Expected exactly one " + type); return found[0]; };
export async function inspectSmallMp4SampleDuration(reader, fileBytes, { trackId, timeScale, expectedPackets, firstDtsTicks = 0 }) {
  positive(fileBytes, MAX_FILE); positive(trackId, 0xffffffff); positive(timeScale, 192000); positive(expectedPackets, 512);
  assert.ok(Number.isSafeInteger(firstDtsTicks) && firstDtsTicks >= 0);
  let bytesRead = 0, largestRead = 0, boxCount = 0;
  const read = async (position, length) => {
    assert.ok(Number.isSafeInteger(position) && Number.isSafeInteger(length) && length > 0 && length <= 64 && position >= 0 && position + length <= fileBytes);
    bytesRead += length; assert.ok(bytesRead <= MAX_METADATA); largestRead = Math.max(largestRead, length);
    const value = await reader(position, length); assert.ok(Buffer.isBuffer(value) && value.length === length, "Short metadata read"); return value;
  };
  const boxes = async (start, end) => {
    const found = [];
    while (start < end) {
      assert.ok(++boxCount <= 4096 && end - start >= 8, "Box count/truncated header");
      const header = await read(start, 8); let size = header.readUInt32BE(0), headerBytes = 8;
      if (size === 1) { assert.ok(end - start >= 16, "Truncated extended box header"); const large = (await read(start + 8, 8)).readBigUInt64BE(); assert.ok(large <= BigInt(MAX_FILE)); size = Number(large); headerBytes = 16; }
      else if (size === 0) size = end - start;
      assert.ok(size >= headerBytes && start + size <= end, "Box escapes parent or has invalid size");
      found.push({ type: header.toString("latin1", 4, 8), start, end: start + size, payload: start + headerBytes, length: size - headerBytes });
      start += size;
    }
    assert.equal(start, end); return found;
  };
  const children = box => boxes(box.payload, box.end);
  const field = async (box, offset, length) => { assert.ok(offset >= 0 && offset + length <= box.length, "Truncated box field"); return read(box.payload + offset, length); };
  const roots = await boxes(0, fileBytes), moov = single(roots, "moov"), movie = await children(moov);
  let selected = 0;
  for (const trak of movie.filter(box => box.type === "trak")) {
    const track = await children(trak), header = single(track, "tkhd"), version = (await field(header, 0, 1))[0];
    assert.ok(version === 0 || version === 1);
    if ((await field(header, version ? 20 : 12, 4)).readUInt32BE() !== trackId) continue;
    assert.equal(++selected, 1, "Duplicate track id");
    const media = await children(single(track, "mdia")), mdhd = single(media, "mdhd"), mdhdVersion = (await field(mdhd, 0, 1))[0];
    assert.ok(mdhdVersion === 0 || mdhdVersion === 1);
    assert.equal((await field(mdhd, mdhdVersion ? 20 : 12, 4)).readUInt32BE(), timeScale);
    const tables = await children(single(await children(single(media, "minf")), "stbl"));
    assert.equal((await field(single(tables, "stts"), 4, 4)).readUInt32BE(), 0, "Initial sample table must be empty");
    assert.equal((await field(single(tables, "stsz"), 8, 4)).readUInt32BE(), 0, "Initial sample sizes must be empty");
  }
  assert.equal(selected, 1, "Selected track absent");
  let inheritedDuration = null, inheritedOffset = null;
  for (const trex of (await children(single(movie, "mvex"))).filter(box => box.type === "trex")) {
    assert.equal(trex.length, 24); const data = await field(trex, 0, 16); assert.equal(data.readUInt32BE(0), 0);
    if (data.readUInt32BE(4) === trackId) { assert.equal(inheritedDuration, null, "Duplicate trex"); inheritedDuration = data.readUInt32BE(12); inheritedOffset = trex.payload + 12; }
  }
  let totalSamples = 0, first = null, previousDecodeTime = -1;
  const fragments = roots.filter(box => box.type === "moof"); assert.ok(fragments.length > 0 && fragments.length <= 128);
  for (const moof of fragments) for (const traf of (await children(moof)).filter(box => box.type === "traf")) {
    const content = await children(traf), tfhd = single(content, "tfhd"); assert.ok(tfhd.length <= 40);
    const header = await field(tfhd, 0, tfhd.length), flags = header.readUInt32BE(0) & 0xffffff;
    assert.equal(header[0], 0); assert.equal(flags & ~0x03003b, 0, "Unknown tfhd flags");
    if (header.readUInt32BE(4) !== trackId) continue;
    let offset = 8; if (flags & 1) offset += 8; if (flags & 2) offset += 4;
    let defaultDuration = inheritedDuration, defaultOffset = inheritedOffset, defaultBox = "trex";
    if (flags & 8) { assert.ok(offset + 4 <= header.length); defaultDuration = header.readUInt32BE(offset); defaultOffset = tfhd.payload + offset; defaultBox = "tfhd"; offset += 4; }
    if (flags & 16) offset += 4; if (flags & 32) offset += 4; assert.equal(offset, header.length);
    const tfdt = single(content, "tfdt"), decodeHeader = await field(tfdt, 0, 4); assert.ok(decodeHeader[0] === 0 || decodeHeader[0] === 1);
    assert.equal(decodeHeader.readUInt32BE() & 0xffffff, 0);
    const decodeBytes = await field(tfdt, 4, decodeHeader[0] ? 8 : 4);
    const decodeBig = decodeHeader[0] ? decodeBytes.readBigUInt64BE() : BigInt(decodeBytes.readUInt32BE());
    assert.ok(decodeBig <= BigInt(Number.MAX_SAFE_INTEGER)); const decodeTime = Number(decodeBig);
    assert.ok(decodeTime > previousDecodeTime, "Overlapping/out-of-order fragment origins"); previousDecodeTime = decodeTime;
    for (const trun of content.filter(box => box.type === "trun")) {
      const run = await field(trun, 0, 8), runFlags = run.readUInt32BE(0) & 0xffffff, count = run.readUInt32BE(4);
      assert.ok(run[0] === 0 || run[0] === 1); assert.equal(runFlags & ~0x000f05, 0, "Unknown trun flags"); positive(count, 512);
      totalSamples += count; assert.ok(totalSamples <= 512);
      const entryStart = 8 + (runFlags & 1 ? 4 : 0) + (runFlags & 4 ? 4 : 0);
      const stride = [0x100, 0x200, 0x400, 0x800].filter(flag => runFlags & flag).length * 4;
      assert.equal(trun.length, entryStart + stride * count, "Truncated/extra sample table fields");
      if (!first) {
        assert.equal(decodeTime, firstDtsTicks, "Physical first sample does not match the raw native first packet");
        const duration = runFlags & 0x100 ? (await field(trun, entryStart, 4)).readUInt32BE() : defaultDuration;
        positive(duration, timeScale);
        first = { sampleDurationTicks: duration, timeScale, trackId, firstDecodeTimeTicks: decodeTime,
          sourceBox: runFlags & 0x100 ? "trun" : defaultBox,
          sourceFieldOffset: runFlags & 0x100 ? trun.payload + entryStart : defaultOffset };
      }
    }
  }
  assert.equal(totalSamples, expectedPackets, "Serialized sample count differs from native packet count"); assert.ok(first);
  return { ...first, packetCount: totalSamples, initialSampleTablesEmpty: true, metadataBytesRead: bytesRead,
    largestReadBytes: largestRead, mediaPayloadBytesRead: 0, scope: "serialized-small-fragmented-MP4-duration-only-not-a-conversion-or-large-file-pass" };
}
export async function readSmallMp4SampleDuration(file, options) {
  const root = path.resolve(import.meta.dirname, "../.."), work = await realpath(path.join(root, "work")), resolved = await realpath(file), relative = path.relative(work, resolved);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const info = await lstat(resolved); assert.ok(info.isFile() && !info.isSymbolicLink()); positive(info.size, MAX_FILE);
  const handle = await open(resolved, "r");
  try { return await inspectSmallMp4SampleDuration(async (position, length) => {
    const buffer = Buffer.alloc(length), result = await handle.read(buffer, 0, length, position);
    assert.equal(result.bytesRead, length, "Short serialized metadata read"); return buffer;
  }, info.size, options); } finally { await handle.close(); }
}
