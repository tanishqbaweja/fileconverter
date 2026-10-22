// Independent FIRST-sample metadata proof. No whole-file/media reads and no
// inferred DTS differences. Whole output correctness is validated separately.
import assert from "node:assert/strict";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
export async function inspectLargeMp4FirstSample(reader, fileBytes, { trackId, timeScale, firstDtsTicks }) {
  assert.ok(Number.isSafeInteger(fileBytes) && fileBytes > 0 && fileBytes <= 64 * 1024 ** 3);
  assert.ok(Number.isSafeInteger(trackId) && trackId > 0 && trackId <= 0xffffffff);
  assert.ok(Number.isSafeInteger(timeScale) && timeScale > 0 && timeScale <= 192000);
  assert.ok(Number.isSafeInteger(firstDtsTicks) && firstDtsTicks >= 0);
  let bytesRead = 0, boxCount = 0, largestRead = 0, inherited = null, inheritedOffset = null, initialized = false;
  const read = async (position, length) => {
    assert.ok(Number.isSafeInteger(position) && position >= 0 && length > 0 && length <= 64 && position + length <= fileBytes);
    bytesRead += length; assert.ok(bytesRead <= 262144); largestRead = Math.max(largestRead, length);
    const data = await reader(position, length); assert.ok(Buffer.isBuffer(data) && data.length === length); return data;
  };
  const header = async (start, end) => {
    assert.ok(++boxCount <= 4096 && end - start >= 8); const h = await read(start, 8); let size = h.readUInt32BE(), width = 8;
    if (size === 1) { const big = (await read(start + 8, 8)).readBigUInt64BE(); assert.ok(big <= BigInt(fileBytes)); size = Number(big); width = 16; }
    else if (size === 0) size = end - start;
    assert.ok(size >= width && start + size <= end);
    return { type: h.toString("latin1", 4, 8), start, payload: start + width, end: start + size, length: size - width };
  };
  const children = async parent => { const found = []; let at = parent.payload;
    while (at < parent.end) { const box = await header(at, parent.end); found.push(box); at = box.end; } return found; };
  const single = (boxes, type) => { const found = boxes.filter(b => b.type === type); assert.equal(found.length, 1, type); return found[0]; };
  const field = async (box, offset, length) => { assert.ok(offset >= 0 && offset + length <= box.length); return read(box.payload + offset, length); };
  let at = 0;
  while (at < fileBytes) {
    const box = await header(at, fileBytes); at = box.end;
    if (box.type === "moov") {
      assert.equal(initialized, false); const movie = await children(box); let selected = 0;
      for (const trak of movie.filter(b => b.type === "trak")) {
        const track = await children(trak), tkhd = single(track, "tkhd"), version = (await field(tkhd, 0, 1))[0]; assert.ok(version <= 1);
        if ((await field(tkhd, version ? 20 : 12, 4)).readUInt32BE() !== trackId) continue;
        selected++; const media = await children(single(track, "mdia")), mdhd = single(media, "mdhd"), mv = (await field(mdhd, 0, 1))[0]; assert.ok(mv <= 1);
        assert.equal((await field(mdhd, mv ? 20 : 12, 4)).readUInt32BE(), timeScale);
        const tables = await children(single(await children(single(media, "minf")), "stbl"));
        assert.equal((await field(single(tables, "stts"), 4, 4)).readUInt32BE(), 0);
        assert.equal((await field(single(tables, "stsz"), 8, 4)).readUInt32BE(), 0);
      }
      assert.equal(selected, 1);
      for (const trex of (await children(single(movie, "mvex"))).filter(b => b.type === "trex")) {
        assert.equal(trex.length, 24); const data = await field(trex, 0, 16); assert.equal(data.readUInt32BE(), 0);
        if (data.readUInt32BE(4) === trackId) { assert.equal(inherited, null); inherited = data.readUInt32BE(12); inheritedOffset = trex.payload + 12; }
      }
      initialized = true;
    }
    if (box.type !== "moof") continue;
    assert.equal(initialized, true);
    for (const traf of (await children(box)).filter(b => b.type === "traf")) {
      const content = await children(traf), tfhd = single(content, "tfhd"); assert.ok(tfhd.length <= 40);
      const data = await field(tfhd, 0, tfhd.length), flags = data.readUInt32BE() & 0xffffff; assert.equal(data[0], 0); assert.equal(flags & ~0x03003b, 0);
      if (data.readUInt32BE(4) !== trackId) continue;
      let offset = 8 + (flags & 1 ? 8 : 0) + (flags & 2 ? 4 : 0), duration = inherited, durationOffset = inheritedOffset, sourceBox = "trex";
      if (flags & 8) { assert.ok(offset + 4 <= data.length); duration = data.readUInt32BE(offset); durationOffset = tfhd.payload + offset; sourceBox = "tfhd"; offset += 4; }
      if (flags & 16) offset += 4; if (flags & 32) offset += 4; assert.equal(offset, data.length);
      const tfdt = single(content, "tfdt"), dv = await field(tfdt, 0, 4); assert.ok(dv[0] <= 1); assert.equal(dv.readUInt32BE() & 0xffffff, 0);
      const dt = await field(tfdt, 4, dv[0] ? 8 : 4), origin = dv[0] ? dt.readBigUInt64BE() : BigInt(dt.readUInt32BE()); assert.equal(origin, BigInt(firstDtsTicks));
      const trun = content.find(b => b.type === "trun"); assert.ok(trun);
      const run = await field(trun, 0, 8), rf = run.readUInt32BE() & 0xffffff, count = run.readUInt32BE(4);
      assert.ok(run[0] <= 1 && !(rf & ~0x000f05) && count > 0 && count <= 10000000);
      const begin = 8 + (rf & 1 ? 4 : 0) + (rf & 4 ? 4 : 0), stride = [0x100, 0x200, 0x400, 0x800].filter(f => rf & f).length * 4;
      assert.equal(trun.length, begin + stride * count);
      if (rf & 0x100) { duration = (await field(trun, begin, 4)).readUInt32BE(); durationOffset = trun.payload + begin; sourceBox = "trun"; }
      assert.ok(Number.isSafeInteger(duration) && duration > 0 && duration <= timeScale);
      return { sampleDurationTicks: duration, timeScale, trackId, firstDecodeTimeTicks: firstDtsTicks, sourceBox, sourceFieldOffset: durationOffset,
        metadataBytesRead: bytesRead, largestReadBytes: largestRead, mediaPayloadBytesRead: 0, scope: "first-fragment-duration-only-not-whole-output-acceptance" };
    }
  }
  throw new Error("No selected first fragment sample duration found within bounded metadata scan");
}
export async function readLargeMp4FirstSample(file, options) {
  const root = path.resolve(import.meta.dirname, "../.."), work = await realpath(path.join(root, "work")), resolved = await realpath(file), relative = path.relative(work, resolved);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative)); const info = await lstat(resolved); assert.ok(info.isFile() && !info.isSymbolicLink());
  const handle = await open(resolved, "r");
  try { return await inspectLargeMp4FirstSample(async (position, length) => { const data = Buffer.alloc(length), got = await handle.read(data, 0, length, position);
    assert.equal(got.bytesRead, length); return data; }, info.size, options); } finally { await handle.close(); }
}
