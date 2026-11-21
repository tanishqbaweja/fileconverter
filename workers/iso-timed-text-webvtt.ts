// Private engine candidate, intentionally not registered until browser qualification.
// 3GPP TS 26.245 text samples inside non-fragmented ISO-BMFF.
export const TIMED_TEXT_READ_BYTES = 128 * 1024;
export const TIMED_TEXT_WRITE_BYTES = 64 * 1024;
const TABLE_WINDOW_BYTES = 16 * 1024;
const PAYLOAD_WINDOW_BYTES = 16 * 1024;
const PAYLOAD_WINDOW_SAMPLES = 64;
const MAX_BOX_HEADERS = 4_096;
const MAX_DATA_REGIONS = 128;
const ZERO = BigInt(0), EMPTY_EDIT = BigInt(-1), TWO = BigInt(2);
const THOUSAND = BigInt(1000), MINUTE_MS = BigInt(60000), HOUR_MS = BigInt(3600000), SIXTY = BigInt(60);

export interface IsoTimedTextRuntime {
  size: number;
  /** Read an exact bounded slice from the original file, never URL data. */
  read(position: number, length: number): Promise<Uint8Array<ArrayBuffer>>;
  /** Await consumption before reusing the view. Commit only on success. */
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
  assertActive(): void;
  warn(message: string): void;
}

type Box = { type: string; data: number; end: number };
type Track = { id: number; media: Box; info: Box; sampleTable: Box; edits?: Box };
type Table = { count: number; row(index: number): Promise<DataView> };
type Read = (position: number, length: number) => Promise<DataView>;
type Edit = { movieScale: bigint; leading: bigint; length: bigint; mediaStart: bigint };

const fail = (message: string): never => { throw new Error(`Timed-text extraction: ${message}`); };
const ascii = (view: DataView, at: number) => String.fromCharCode(
  view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3),
);
const safeNumber = (value: bigint): number =>
  value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : fail("box or chunk offset exceeds exact browser addressing.");
const one = (boxes: readonly Box[], name: string, needed = true): Box | undefined => {
  const found = boxes.filter(box => box.type === name);
  if (found.length > 1) fail(`multiple ${name} boxes are ambiguous.`);
  return found[0] ?? (needed ? fail(`missing ${name} box.`) : undefined);
};

function openBoxes(runtime: IsoTimedTextRuntime) {
  if (!Number.isSafeInteger(runtime.size) || runtime.size < 8) fail("invalid source size.");
  const read: Read = async (position, length) => {
    if (!Number.isSafeInteger(position) || position < 0 || length < 0 ||
        length > TIMED_TEXT_READ_BYTES || position > runtime.size - length) fail("out-of-range read.");
    runtime.assertActive();
    const bytes = await runtime.read(position, length);
    runtime.assertActive();
    if (bytes.byteLength !== length) fail("short source read.");
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  };
  let headers = 0;
  const readBox = async (offset: number, limit: number): Promise<Box> => {
    if (++headers > MAX_BOX_HEADERS) fail("box header limit exceeded.");
    if (limit - offset < 8) fail("truncated box header.");
    const view = await read(offset, 8);
    let size = view.getUint32(0);
    const type = ascii(view, 4);
    let header = 8;
    if (size === 1) {
      if (limit - offset < 16) fail("truncated extended box header.");
      size = safeNumber((await read(offset + 8, 8)).getBigUint64(0));
      header = 16;
    } else if (size === 0) size = limit - offset;
    if (size < header || size > limit - offset) fail("invalid box size.");
    return { type, data: offset + header, end: offset + size };
  };
  const children = async (start: number, end: number) => {
    const boxes = [];
    while (start < end) {
      const box = await readBox(start, end);
      boxes.push(box); start = box.end;
    }
    return boxes;
  };
  return { read, readBox, children };
}

async function readTimescale(read: Read, box: Box): Promise<bigint> {
  const n = Math.min(24, box.end - box.data);
  if (n < 16) fail("truncated media or movie clock.");
  const bytes = await read(box.data, n);
  const version = bytes.getUint8(0);
  const offset = version === 0 ? 12 : version === 1 ? 20 : fail("unsupported clock version.");
  if (offset + 4 > n) fail("truncated clock timescale.");
  const scale = bytes.getUint32(offset);
  return scale > 0 ? BigInt(scale) : fail("zero clock timescale.");
}

async function readEdit(read: Read, box: Box | undefined, movieScale: bigint): Promise<Edit | undefined> {
  if (!box) return;
  const length = box.end - box.data;
  if (length < 8 || length > 48) fail("only a single media edit with an optional leading empty edit is supported.");
  const bytes = await read(box.data, length);
  const version = bytes.getUint8(0);
  const rowBytes = version === 0 ? 12 : version === 1 ? 20 : fail("unsupported edit list version.");
  const count = bytes.getUint32(4);
  if ((bytes.getUint32(0) & 0x00ffffff) !== 0 || count < 1 || count > 2 || length !== 8 + count * rowBytes)
    fail("unsupported or incomplete edit list.");
  let leading = ZERO;
  for (let index = 0; index < count; index++) {
    const at = 8 + index * rowBytes;
    const duration = version === 0 ? BigInt(bytes.getUint32(at)) : bytes.getBigUint64(at);
    const start = version === 0 ? BigInt(bytes.getInt32(at + 4)) : bytes.getBigInt64(at + 8);
    const rate = bytes.getUint32(at + rowBytes - 4);
    if (rate !== 0x10000 || duration === ZERO) fail("only positive, normal-speed edits are supported.");
    if (count === 2 && index === 0) {
      if (start !== EMPTY_EDIT) fail("the first of two edits must be a leading empty edit.");
      leading = duration;
    } else {
      if (start < ZERO) fail("unsupported negative media edit start.");
      return { movieScale, leading, length: duration, mediaStart: start };
    }
  }
}

async function table(read: Read, box: Box, width: number, header = 8, fixedSizeAllowed = false): Promise<Table & { fixed: number }> {
  if (box.end - box.data < header) fail(`truncated ${box.type} table.`);
  const top = await read(box.data, header);
  if (top.getUint32(0) !== 0) fail(`unsupported ${box.type} version or flags.`);
  const count = top.getUint32(header - 4);
  const fixed = fixedSizeAllowed ? top.getUint32(4) : 0;
  const data = box.data + header;
  if (box.end - data !== (fixed ? 0 : count * width)) fail(`incorrect ${box.type} table length.`);
  let first = -1, rows = 0, window: DataView;
  const windowRows = Math.floor(TABLE_WINDOW_BYTES / width);
  return { count, fixed, async row(index) {
    if (fixed || index < 0 || index >= count) fail(`sample tables disagree at ${box.type}.`);
    if (index < first || index >= first + rows) {
      first = index; rows = Math.min(windowRows, count - index);
      window = await read(data + index * width, rows * width);
    }
    return new DataView(window.buffer, window.byteOffset + (index - first) * width, width);
  } };
}

async function readTrackId(read: Read, box: Box): Promise<number> {
  const n = Math.min(24, box.end - box.data);
  if (n < 16) fail("truncated track header.");
  const bytes = await read(box.data, n);
  const version = bytes.getUint8(0), index = version === 0 ? 12 : version === 1 ? 20 : fail("unsupported track version.");
  if (index + 4 > n) fail("truncated track ID.");
  return bytes.getUint32(index) || fail("invalid track ID.");
}

const utf8 = new TextDecoder("utf-8", { fatal: true });
const utf16BE = new TextDecoder("utf-16be", { fatal: true });
const utf16LE = new TextDecoder("utf-16le", { fatal: true });

function decodeSample(sample: DataView): string | null {
  if (sample.byteLength < 2) fail("truncated text sample length.");
  const bytes = sample.getUint16(0);
  if (bytes > sample.byteLength - 2) fail("text length crosses its sample boundary.");
  if (!bytes) return null; // a clear/gap sample, not a WebVTT cue
  const text = new Uint8Array(sample.buffer, sample.byteOffset + 2, bytes);
  const decoder = text[0] === 0xfe && text[1] === 0xff ? utf16BE : text[0] === 0xff && text[1] === 0xfe ? utf16LE : utf8;
  let decoded: string;
  try { decoded = decoder.decode(text); } catch { return fail("invalid UTF-8 or BOM-tagged UTF-16 sample."); }
  if (!decoded || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(decoded))
    fail("invalid subtitle text or control character.");
  // A blank raw line ends a WebVTT cue. Use an inert visually blank line.
  return decoded.replace(/\r\n?/g, "\n").split("\n").map(line =>
    line ? line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") : "&nbsp;").join("\n");
}

function presentation(start: bigint, end: bigint, timescale: bigint, edit?: Edit) {
  let denominator = timescale;
  if (edit) {
    start = (start - edit.mediaStart) * edit.movieScale;
    end = (end - edit.mediaStart) * edit.movieScale;
    const limit = edit.length * timescale;
    if (end <= ZERO || start >= limit) return;
    if (start < ZERO) start = ZERO;
    if (end > limit) end = limit;
    start += edit.leading * timescale;
    end += edit.leading * timescale;
    denominator *= edit.movieScale;
  }
  const round = (ticks: bigint) => (ticks * THOUSAND + denominator / TWO) / denominator;
  const first = round(start), last = round(end);
  if (first >= last) fail("a visible cue has no positive duration at WebVTT millisecond precision.");
  return { first, last };
}

function clock(ms: bigint): string {
  const pad = (n: bigint, digits: number) => n.toString().padStart(digits, "0");
  return `${pad(ms / HOUR_MS, 2)}:${pad(ms / MINUTE_MS % SIXTY, 2)}:${pad(ms / THOUSAND % SIXTY, 2)}.${pad(ms % THOUSAND, 3)}`;
}

function webvttWriter(runtime: IsoTimedTextRuntime) {
  const encoder = new TextEncoder(), buffer = new Uint8Array(TIMED_TEXT_WRITE_BYTES);
  let used = 0;
  const flush = async () => {
    if (!used) return;
    runtime.assertActive();
    await runtime.write(buffer.subarray(0, used));
    runtime.assertActive();
    used = 0;
  };
  return { flush, async write(value: string) {
    for (let offset = 0; offset < value.length;) {
      const { read, written } = encoder.encodeInto(offset ? value.slice(offset) : value, buffer.subarray(used));
      offset += read; used += written;
      if (used === buffer.length || offset < value.length) await flush();
    }
  } };
}

export async function runIsoTimedTextToWebVtt(runtime: IsoTimedTextRuntime, trackId?: number) {
  const { read, readBox, children } = openBoxes(runtime);
  const roots = await children(0, runtime.size);
  if (!one(roots, "ftyp", false)) fail("the source is not a supported ISO-BMFF file.");
  if (roots.some(box => box.type === "moof")) fail("fragmented subtitle tracks are not supported.");
  const moov = one(roots, "moov")!;
  const data = roots.filter(box => box.type === "mdat");
  if (data.length < 1 || data.length > MAX_DATA_REGIONS) fail("missing or too many media data boxes.");
  const movie = await children(moov.data, moov.end);
  const tracks: Track[] = [], observedIds = new Set<number>();
  for (const item of movie.filter(box => box.type === "trak")) {
    const parts = await children(item.data, item.end);
    const id = await readTrackId(read, one(parts, "tkhd")!);
    if (observedIds.has(id)) fail("duplicate track ID.");
    observedIds.add(id);
    const media = one(parts, "mdia")!;
    const fields = await children(media.data, media.end);
    const handler = one(fields, "hdlr")!;
    if (handler.end - handler.data < 12) fail("truncated media handler.");
    if (!["text", "sbtl", "subt"].includes(ascii(await read(handler.data, 12), 8))) continue;
    const info = one(fields, "minf")!;
    const sampleTable = one(await children(info.data, info.end), "stbl")!;
    const descriptions = one(await children(sampleTable.data, sampleTable.end), "stsd")!;
    if (descriptions.end - descriptions.data < 16) continue;
    const header = await read(descriptions.data, 8);
    const entry = await readBox(descriptions.data + 8, descriptions.end);
    if (entry.type !== "tx3g") continue;
    if (header.getUint32(0) !== 0 || header.getUint32(4) !== 1 || entry.end !== descriptions.end ||
        entry.end - entry.data < 38 || (await read(entry.data, 8)).getUint16(6) !== 1)
      fail("unsupported timed-text sample description or external data reference.");
    tracks.push({ id, media, info, sampleTable, edits: one(parts, "edts", false) });
  }
  if (trackId === undefined && tracks.length > 1) fail("choose an explicit timed-text track ID.");
  const track = trackId === undefined ? tracks[0] : tracks.find(track => track.id === trackId);
  if (!track) return fail("no matching tx3g subtitle track.");
  const dataInfo = one(await children(track.info.data, track.info.end), "dinf")!;
  const reference = one(await children(dataInfo.data, dataInfo.end), "dref")!;
  if (reference.end - reference.data < 20) fail("truncated track data reference.");
  const refHeader = await read(reference.data, 8);
  const local = await readBox(reference.data + 8, reference.end);
  if (refHeader.getUint32(0) !== 0 || refHeader.getUint32(4) !== 1 || local.type !== "url " ||
      local.end !== reference.end || local.end - local.data !== 4 || (await read(local.data, 4)).getUint32(0) !== 1)
    fail("subtitles must point only to media data in the source file.");
  const timescale = await readTimescale(read, one(await children(track.media.data, track.media.end), "mdhd")!);
  const edit = track.edits ? await readEdit(read, one(await children(track.edits.data, track.edits.end), "elst")!,
    await readTimescale(read, one(movie, "mvhd")!)) : undefined;
  const tables = await children(track.sampleTable.data, track.sampleTable.end);
  if (tables.some(box => ["ctts", "cslg", "stz2", "saiz", "saio", "senc"].includes(box.type)))
    fail("composition offsets, compact sizes or encrypted subtitle tables are not supported.");
  const stco = one(tables, "stco", false), co64 = one(tables, "co64", false);
  if (Boolean(stco) === Boolean(co64)) fail("exactly one chunk offset table is required.");
  const offsets = await table(read, (stco ?? co64)!, co64 ? 8 : 4);
  const mapping = await table(read, one(tables, "stsc")!, 12);
  const sizes = await table(read, one(tables, "stsz")!, 4, 12, true);
  const times = await table(read, one(tables, "stts")!, 8);
  if (!offsets.count || !mapping.count || !sizes.count || !times.count) fail("empty sample tables.");

  async function chunkRule(index: number) {
    const row = await mapping.row(index);
    const first = row.getUint32(0), count = row.getUint32(4), description = row.getUint32(8);
    if (!first || first > offsets.count || !count || description !== 1) fail("invalid chunk-to-sample mapping.");
    return { first, count };
  }
  let rule = await chunkRule(0), ruleIndex = 1;
  if (rule.first !== 1) fail("chunk mapping does not start at chunk one.");
  let next = ruleIndex < mapping.count ? await chunkRule(ruleIndex) : undefined;
  const writer = webvttWriter(runtime);
  runtime.warn("WebVTT preserves the selected timed-text track's cue text and timing. Styles, fonts, positioning, highlights and other modifiers are omitted. Line endings are normalized; empty cue lines become visibly blank nonbreaking-space lines.");
  await writer.write("WEBVTT\n\n");
  let sampleIndex = 0, timeIndex = 0, remainingTimeSamples = 0, delta = ZERO, time = ZERO, cues = 0;
  const sampleLengths = new Uint32Array(PAYLOAD_WINDOW_SAMPLES);
  const chunkStart = async (index: number) => {
    const offset = await offsets.row(index);
    return co64 ? safeNumber(offset.getBigUint64(0)) : offset.getUint32(0);
  };
  let nextChunkAt = await chunkStart(0);
  for (let chunk = 1; chunk <= offsets.count; chunk++) {
    if (next && next.first <= rule.first) fail("unordered chunk mapping.");
    if (next?.first === chunk) {
      rule = next;
      next = ++ruleIndex < mapping.count ? await chunkRule(ruleIndex) : undefined;
    }
    let at = nextChunkAt;
    nextChunkAt = chunk < offsets.count ? await chunkStart(chunk) : runtime.size;
    const region = data.find(box => at >= box.data && at < box.end);
    if (!region || rule.count > sizes.count - sampleIndex) return fail("chunk offset or sample count is outside the track's media data.");
    if (nextChunkAt <= at) fail("only non-overlapping chunks in file order are supported.");
    let payload: DataView | undefined;
    let windowIndex = 0, windowCount = 0, consumed = 0;
    for (let index = 0; index < rule.count; index++) {
      runtime.assertActive();
      if (!remainingTimeSamples) {
        const row = await times.row(timeIndex++);
        remainingTimeSamples = row.getUint32(0); delta = BigInt(row.getUint32(4));
        if (!remainingTimeSamples || remainingTimeSamples > sizes.count - sampleIndex) fail("invalid timing sample count.");
      }
      if (windowIndex === windowCount) {
        // Adjacent samples in one selected-track chunk are contiguous. Never
        // prefetch across chunks (where audio/video or another track may sit).
        // Consume the old view before acquiring another. A large single sample
        // keeps the existing exact-read path and the original 128 KiB cap.
        payload = undefined;
        windowIndex = 0; windowCount = 0; consumed = 0;
        let bytes = 0;
        const limit = Math.min(PAYLOAD_WINDOW_SAMPLES, rule.count - index);
        while (windowCount < limit) {
          const length = sizes.fixed || (await sizes.row(sampleIndex + windowCount)).getUint32(0);
          if (bytes && bytes + length > PAYLOAD_WINDOW_BYTES) break;
          if (length < 2 || length > TIMED_TEXT_READ_BYTES || length > region.end - at - bytes)
            fail("subtitle sample exceeds its media data or the bounded sample limit.");
          if (length > nextChunkAt - at - bytes) fail("only non-overlapping chunks in file order are supported.");
          sampleLengths[windowCount++] = length;
          bytes += length;
          if (bytes >= PAYLOAD_WINDOW_BYTES) break;
        }
        payload = await read(at, bytes);
      }
      const length = sampleLengths[windowIndex++];
      const current = payload!;
      const cue = decodeSample(new DataView(current.buffer, current.byteOffset + consumed, length));
      consumed += length;
      if (cue !== null) {
        const range = presentation(time, time + delta, timescale, edit);
        if (range) {
          await writer.write(`${clock(range.first)} --> ${clock(range.last)}\n${cue}\n\n`);
          cues++;
        }
      }
      time += delta; remainingTimeSamples--; sampleIndex++; at += length;
    }
  }
  if (sampleIndex !== sizes.count || remainingTimeSamples || timeIndex !== times.count || next)
    fail("sample, chunk and timing table totals disagree.");
  if (!cues) fail("the selected track contains no visible timed-text cues.");
  await writer.flush();
  return { trackId: track.id, samples: sampleIndex, cues };
}
