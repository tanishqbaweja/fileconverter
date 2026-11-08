// Read only bounded serialized MP4 timeline metadata; skip media payloads.
import assert from "node:assert/strict";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

const LIMIT = 8 * 1024 * 1024;
export async function inspectMkvMp4TimelineBoxes(reader, size) {
  assert.ok(Number.isSafeInteger(size) && size >= 8 && size <= LIMIT);
  let headers = 0, bytesRead = 0, maximumReadBytes = 0;
  const read = async (offset, count) => {
    assert.ok(Number.isSafeInteger(offset) && offset >= 0 && count > 0 && count <= 24 && offset + count <= size);
    bytesRead += count; assert.ok(bytesRead <= 65536); maximumReadBytes = Math.max(maximumReadBytes, count);
    const result = await reader(offset, count);
    assert.ok(Buffer.isBuffer(result) && result.length === count); return result;
  };
  const list = async (start, end) => {
    const found = [];
    for (let at = start; at < end;) {
      assert.ok(++headers <= 1024 && end - at >= 8);
      const h = await read(at, 8);
      const initial = h.readUInt32BE(), wide = initial === 1, width = wide ? 16 : 8;
      assert.ok(end - at >= width);
      const extent = wide ? (await read(at + 8, 8)).readBigUInt64BE() : BigInt(initial || end - at);
      assert.ok(extent >= BigInt(width) && extent <= BigInt(end - at));
      const next = at + Number(extent);
      found.push({ type: h.toString("latin1", 4, 8), payload: at + width, end: next });
      at = next;
    }
    return found;
  };
  const children = box => list(box.payload, box.end);
  const find = (boxes, type, required = true) => {
    const matches = boxes.filter(box => box.type === type);
    assert.ok(matches.length <= 1 && (!required || matches.length === 1), type);
    return matches[0];
  };
  const field = (box, offset, count) => {
    assert.ok(offset >= 0 && box.payload + offset + count <= box.end, `Truncated ${box.type}`);
    return read(box.payload + offset, count);
  };
  const version = async box => {
    const v = (await field(box, 0, 1))[0]; assert.ok(v === 0 || v === 1, box.type); return v;
  };
  const duration = async box => {
    const v = await version(box), offset = v ? 20 : 12;
    const fields = await field(box, offset, v ? 12 : 8), timeScale = fields.readUInt32BE();
    assert.ok(timeScale > 0);
    return { timeScale, durationTicks: (v ? fields.readBigUInt64BE(4) : BigInt(fields.readUInt32BE(4))).toString() };
  };
  const roots = await list(0, size), movie = await children(find(roots, "moov"));
  const tracks = [];
  for (const trak of movie.filter(box => box.type === "trak")) {
    assert.ok(tracks.length < 8);
    const parts = await children(trak), tkhd = find(parts, "tkhd"), id = (await field(tkhd, (await version(tkhd)) ? 20 : 12, 4)).readUInt32BE();
    assert.ok(id && tracks.every(track => track.id !== id));
    const media = await children(find(parts, "mdia"));
    const kind = (await field(find(media, "hdlr"), 8, 4)).toString("latin1");
    const edts = find(parts, "edts", false), edits = [];
    if (edts) {
      const elst = find(await children(edts), "elst"), v = await version(elst), width = v ? 20 : 12;
      const count = (await field(elst, 4, 4)).readUInt32BE();
      assert.ok(count <= 8 && elst.end - elst.payload === 8 + count * width);
      for (let i = 0; i < count; i++) {
        const data = await field(elst, 8 + i * width, width);
        edits.push({ segmentDurationTicks: (v ? data.readBigUInt64BE() : BigInt(data.readUInt32BE())).toString(),
          mediaTimeTicks: (v ? data.readBigInt64BE(8) : BigInt(data.readInt32BE(4))).toString(),
          mediaRateInteger: data.readInt16BE(v ? 16 : 8), mediaRateFraction: data.readInt16BE(v ? 18 : 10) });
      }
    }
    tracks.push({ id, kind, ...(await duration(find(media, "mdhd"))), editListPresent: !!edts, edits, firstFragmentDecodeTimeTicks: null });
  }
  const fragments = roots.filter(box => box.type === "moof"); assert.ok(fragments.length && tracks.length);
  for (const moof of fragments.slice(0, 32)) {
    for (const traf of (await children(moof)).filter(box => box.type === "traf")) {
      const content = await children(traf), id = (await field(find(content, "tfhd"), 4, 4)).readUInt32BE();
      const track = tracks.find(track => track.id === id); assert.ok(track);
      if (track.firstFragmentDecodeTimeTicks !== null) continue;
      const tfdt = find(content, "tfdt"), v = await version(tfdt), value = await field(tfdt, 4, v ? 8 : 4);
      track.firstFragmentDecodeTimeTicks = (v ? value.readBigUInt64BE() : BigInt(value.readUInt32BE())).toString();
    }
    if (tracks.every(track => track.firstFragmentDecodeTimeTicks !== null)) break;
  }
  return { movie: await duration(find(movie, "mvhd")), tracks, fragmentCount: fragments.length, bytesRead, maximumReadBytes, mediaPayloadBytesRead: 0 };
}

export async function readMkvMp4TimelineBoxes(file) {
  const work = await realpath(path.resolve(import.meta.dirname, "../../work")), absolute = await realpath(file);
  const relative = path.relative(work, absolute);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const info = await lstat(absolute); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= LIMIT);
  const handle = await open(absolute, "r");
  try {
    return await inspectMkvMp4TimelineBoxes(async (offset, length) => {
      const buffer = Buffer.alloc(length), { bytesRead } = await handle.read(buffer, 0, length, offset);
      assert.equal(bytesRead, length); return buffer;
    }, info.size);
  } finally { await handle.close(); }
}
