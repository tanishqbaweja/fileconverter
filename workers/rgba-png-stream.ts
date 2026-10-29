// Private strip-rendering foundation. Not connected to any public profile.
// Input is straight (not premultiplied) RGBA, in complete rows, in image order.
import { updateCrc32 } from "./archive-conversion";

export const PNG_STRIP_BYTES = 256 * 1024;
export const PNG_IDAT_BYTES = 64 * 1024 - 12;
const MAX_PIXELS = 8_388_608;
const MAX_OUTPUT = 64 * 1024 * 1024;

export interface PngStripObservation {
  currentExplicitBufferBytes: number;
  peakExplicitBufferBytes: number;
  rows: number;
  outputBytes: number;
  maximumRgbaBytes: number;
  maximumFilteredBytes: number;
  maximumCodecChunkBytes: number;
  maximumWriteBytes: number;
  maximumPendingWrites: number;
  codecChunks: number;
  idatChunks: number;
  fixedCoalescerBytes: number;
  totalWriteMs: number;
  maximumWriteMs: number;
}

interface Options {
  width: number;
  height: number;
  strips: AsyncIterable<Uint8Array<ArrayBuffer>>;
  assertActive: () => void;
  write: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
  observation: PngStripObservation;
  // Owned/in-flight buffer payload only; not opaque CompressionStream storage,
  // Wasm, GC retention, allocator overhead or process-tree private memory.
  onWorkingBytes?: (bytes: number) => void;
}

export function pngStripObservation(): PngStripObservation {
  return { currentExplicitBufferBytes: 0, peakExplicitBufferBytes: 0, rows: 0, outputBytes: 0, maximumRgbaBytes: 0,
    maximumFilteredBytes: 0, maximumCodecChunkBytes: 0,
    maximumWriteBytes: 0, maximumPendingWrites: 0, codecChunks: 0,
    idatChunks: 0, fixedCoalescerBytes: 0, totalWriteMs: 0, maximumWriteMs: 0 };
}

function chunk(type: string, data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const kind = new TextEncoder().encode(type), bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(kind, 4); bytes.set(data, 8);
  const crc = updateCrc32(updateCrc32(0xffff_ffff, kind), data);
  view.setUint32(bytes.length - 4, (crc ^ 0xffff_ffff) >>> 0);
  return bytes;
}

// Sub filtering needs only the current row, with no prior-strip dependency.
function filter(rgba: Uint8Array<ArrayBuffer>, rowBytes: number): Uint8Array<ArrayBuffer> {
  const rows = rgba.length / rowBytes, filtered = new Uint8Array((rowBytes + 1) * rows);
  for (let row = 0; row < rows; row++) {
    const input = row * rowBytes, output = row * (rowBytes + 1);
    filtered[output] = 1;
    for (let x = 0; x < rowBytes; x++) {
      filtered[output + 1 + x] = rgba[input + x] - (x < 4 ? 0 : rgba[input + x - 4]);
    }
  }
  return filtered;
}

export async function writeRgbaPngStrips(options: Options): Promise<void> {
  const { width, height, strips, observation, assertActive, write } = options;
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 8192)
      || width * height > MAX_PIXELS) throw new RangeError("PNG strip dimensions exceed the bounded profile.");
  if (typeof CompressionStream !== "function") throw new Error("Streaming DEFLATE is unavailable.");
  const rowBytes = width * 4, iterator = strips[Symbol.asyncIterator]();
  let returning: Promise<void> | null = null;
  let pendingRead: Promise<IteratorResult<Uint8Array<ArrayBuffer>>> | null = null;
  const releaseInput = () => returning ??= (async () => {
    // Do not race return() against an in-flight producer operation.
    await pendingRead?.catch(() => {});
    await iterator.return?.();
  })();
  let pendingWrites = 0;
  let headerBytes = 0, filteredBytes = 0, coalescerBytes = 0, codecBytes = 0, writeBytes = 0;
  const observeBuffers = () => {
    const bytes = headerBytes + filteredBytes + coalescerBytes + codecBytes + writeBytes;
    observation.currentExplicitBufferBytes = bytes;
    observation.peakExplicitBufferBytes = Math.max(observation.peakExplicitBufferBytes, bytes);
    options.onWorkingBytes?.(bytes);
  };
  const writeOne = async (bytes: Uint8Array<ArrayBuffer>) => {
    assertActive();
    if (bytes.length > 65536 || observation.outputBytes + bytes.length > MAX_OUTPUT)
      throw new RangeError("PNG output exceeds the bounded write or output limit.");
    pendingWrites++;
    observation.maximumPendingWrites = Math.max(observation.maximumPendingWrites, pendingWrites);
    if (pendingWrites !== 1) throw new Error("PNG output writes must be serial.");
    observation.maximumWriteBytes = Math.max(observation.maximumWriteBytes, bytes.length);
    writeBytes = bytes.byteLength; observeBuffers();
    const started = performance.now();
    try { await write(bytes); observation.outputBytes += bytes.length; }
    finally {
      const elapsed = performance.now() - started;
      observation.totalWriteMs += elapsed;
      observation.maximumWriteMs = Math.max(observation.maximumWriteMs, elapsed);
      pendingWrites--;
      writeBytes = 0; observeBuffers();
    }
  };
  let primaryFailure = false;
  try {
    await writeOne(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    const header = new Uint8Array(13), view = new DataView(header.buffer);
    headerBytes = header.byteLength; observeBuffers();
    view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
    await writeOne(chunk("IHDR", header));
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        // A subsequent pull means the prior filtered input was consumed.
        filteredBytes = 0; observeBuffers();
        assertActive();
        pendingRead = iterator.next();
        const next = await pendingRead;
        pendingRead = null;
        assertActive();
        if (next.done) {
          if (observation.rows !== height) throw new Error("PNG strips ended before the declared height.");
          controller.close(); return;
        }
        const rgba = next.value;
        if (!(rgba instanceof Uint8Array) || rgba.length === 0 || rgba.length % rowBytes !== 0)
          throw new RangeError("PNG strip must contain complete nonempty RGBA rows.");
        const rows = rgba.length / rowBytes;
        if ((rowBytes + 1) * rows > PNG_STRIP_BYTES || observation.rows + rows > height)
          throw new RangeError("PNG strip exceeds the fixed working limit or declared height.");
        const filtered = filter(rgba, rowBytes);
        filteredBytes = filtered.byteLength; observeBuffers();
        observation.maximumRgbaBytes = Math.max(observation.maximumRgbaBytes, rgba.length);
        observation.maximumFilteredBytes = Math.max(observation.maximumFilteredBytes, filtered.length);
        observation.rows += rows;
        controller.enqueue(filtered);
      },
      cancel: releaseInput,
    }, { highWaterMark: 0 });
    // One reusable fixed buffer, never an array of codec chunks. Await each
    // full PNG chunk before reuse, preserving the same serial writer contract.
    const coalescer = new Uint8Array(PNG_IDAT_BYTES);
    coalescerBytes = coalescer.byteLength; observeBuffers();
    observation.fixedCoalescerBytes = coalescer.length;
    let filled = 0;
    const flushIdat = async () => {
      if (filled === 0) return;
      await writeOne(chunk("IDAT", coalescer.subarray(0, filled)));
      observation.idatChunks++;
      filled = 0;
    };
    await source.pipeThrough(new CompressionStream("deflate")).pipeTo(new WritableStream({
      async write(bytes: Uint8Array<ArrayBuffer>) {
        codecBytes = bytes.byteLength; observeBuffers();
        try {
        assertActive();
        observation.codecChunks++;
        observation.maximumCodecChunkBytes = Math.max(observation.maximumCodecChunkBytes, bytes.length);
        if (bytes.length > PNG_STRIP_BYTES) throw new RangeError("Unexpectedly large streaming DEFLATE output chunk.");
        for (let offset = 0; offset < bytes.length;) {
          assertActive();
          const length = Math.min(coalescer.length - filled, bytes.length - offset);
          coalescer.set(bytes.subarray(offset, offset + length), filled);
          filled += length; offset += length;
          if (filled === coalescer.length) await flushIdat();
        }
        } finally { codecBytes = 0; observeBuffers(); }
      },
      close: flushIdat,
    }, { highWaterMark: 1 }));
    await writeOne(chunk("IEND", new Uint8Array(0)));
  } catch (error) { primaryFailure = true; throw error; }
  finally {
    // A generator cleanup failure must not hide a native/IO/cancellation error.
    try { await releaseInput(); } catch (error) { if (!primaryFailure) throw error; }
    finally {
      headerBytes = filteredBytes = coalescerBytes = codecBytes = writeBytes = 0;
      observeBuffers();
    }
  }
}
