import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import {
  createZipDataDescriptor,
  createZipLocalHeader,
  ensureZip32,
  finishZip,
  unixToDos,
  updateCrc32,
  type WrittenZipEntry,
} from "./archive-conversion";
import type { RandomAccessDestination } from "./random-access-destination";

const MODULE_URL = "/engines/tiff/within-tiff.mjs";
const WASM_URL = "/engines/tiff/within-tiff.wasm";
const INPUT_BUFFER_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const WASM_MEMORY_BYTES = 40 * 1024 * 1024;
const MAX_TIFF_PAGES = 1_000;
const MAX_TIFF_AGGREGATE_DECODED_BYTES = 64 * 1024 ** 3;
const MAX_TIFF_EXPANSION_RATIO = 1_000;

interface TiffBridge {
  read(offset: number, destination: Uint8Array): Promise<number> | number;
  write(offset: number, source: Uint8Array<ArrayBuffer>): Promise<number> | number;
  message(text: string): void;
}

interface TiffModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  ccall(
    name: "within_tiff_scan_pages" | "within_tiff_page_to_png",
    returnType: "number",
    argumentTypes: readonly "number"[],
    arguments_: readonly number[],
    options: { async: true },
  ): Promise<number>;
  _within_tiff_error(): number;
  _within_tiff_has_more_pages(): number;
  _within_tiff_page_count(): number;
  _within_tiff_page_width(): number;
  _within_tiff_page_height(): number;
  _within_tiff_page_bits(): number;
  _within_tiff_page_samples(): number;
  UTF8ToString(pointer: number, maximumBytesToRead?: number): string;
}

type TiffModuleFactory = (options: {
  withinBridge: TiffBridge;
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<TiffModule>;

export interface TiffConversionOptions {
  file: File;
  writable: RandomAccessDestination;
  jobId: string;
  metrics: ConversionMetrics;
  startedAt: number;
  isCancelled(): boolean;
  emitProgress(
    jobId: string,
    phase: string,
    metrics: ConversionMetrics,
    startedAt: number,
    force?: boolean,
  ): void;
  post(message: WorkerResponse): void;
}

export async function runTiffToPng(options: TiffConversionOptions): Promise<void> {
  await runTiffConversion(options, false);
}

export async function runTiffToZip(options: TiffConversionOptions): Promise<void> {
  await runTiffConversion(options, true);
}

interface ActiveZipPage {
  nameBytes: Uint8Array<ArrayBuffer>;
  localHeaderOffset: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc: number;
  size: number;
}

interface TiffPageRecord {
  file: string;
  index: number;
  width: number;
  height: number;
  bitsPerSample: number;
  samplesPerPixel: number;
  decodedBytes: number;
}

async function runTiffConversion(
  options: TiffConversionOptions,
  archivePages: boolean,
): Promise<void> {
  const { file, writable, jobId, metrics, startedAt, emitProgress } = options;
  if (file.size < 8 || file.size > MAX_INPUT_BYTES) {
    throw new Error("TIFF input must be between 8 bytes and 64 MiB.");
  }
  const errors: string[] = [];
  const synchronousReader = typeof FileReaderSync === "function" ? new FileReaderSync() : null;
  let reader: ReadableStreamBYOBReader | null = null;
  let readerPosition = -1;
  let readBuffer = new Uint8Array(INPUT_BUFFER_BYTES);
  let activeZipPage: ActiveZipPage | null = null;

  const assertActive = (): void => {
    if (options.isCancelled()) throw new DOMException("Conversion cancelled", "AbortError");
  };
  const message = (text: string): void => {
    const bounded = text.trim().slice(0, 512);
    if (!bounded) return;
    if (errors.length === 8) errors.shift();
    errors.push(bounded);
  };
  const writeDestination = (
    position: number,
    source: Uint8Array<ArrayBuffer>,
    phase: string,
  ): Promise<number> | number => {
    assertActive();
    if (
      !Number.isSafeInteger(position) ||
      position < 0 ||
      source.byteLength > OUTPUT_BUFFER_BYTES
    ) {
      throw new Error("TIFF route requested an invalid bounded destination write.");
    }
    const complete = (): number => {
      metrics.outputBytes = Math.max(
        metrics.outputBytes,
        position + source.byteLength,
      );
      metrics.maxWriteChunkBytes = Math.max(
        metrics.maxWriteChunkBytes,
        source.byteLength,
      );
      metrics.queuedBytes = 0;
      metrics.pendingOperations = 0;
      emitProgress(jobId, phase, metrics, startedAt);
      return source.byteLength;
    };
    metrics.queuedBytes = source.byteLength;
    metrics.peakQueuedBytes = Math.max(
      metrics.peakQueuedBytes,
      source.byteLength,
    );
    metrics.pendingOperations = 1;
    metrics.peakPendingOperations = Math.max(metrics.peakPendingOperations, 1);
    if (
      writable.writeSync?.({
        type: "write",
        position,
        data: source,
      })
    ) {
      return complete();
    }
    return writable
      .write({ type: "write", position, data: source })
      .then(complete);
  };
  const appendDestination = async (
    source: Uint8Array<ArrayBuffer>,
    phase: string,
  ): Promise<void> => {
    ensureZip32(metrics.outputBytes + source.byteLength, "TIFF ZIP output size");
    await writeDestination(metrics.outputBytes, source, phase);
  };
  const bridge: TiffBridge = {
    read(offset, destination) {
      assertActive();
      if (!Number.isSafeInteger(offset) || offset < 0 || destination.byteLength > INPUT_BUFFER_BYTES) {
        throw new Error("TIFF engine requested an invalid bounded input read.");
      }
      const end = Math.min(file.size, offset + destination.byteLength);
      if (end <= offset) return 0;
      const record = (bytes: number): number => {
        metrics.inputBytes = Math.max(metrics.inputBytes, Math.min(file.size, offset + bytes));
        metrics.maxReadChunkBytes = Math.max(metrics.maxReadChunkBytes, bytes);
        emitProgress(jobId, "Decoding TIFF scanlines", metrics, startedAt);
        return bytes;
      };
      if (synchronousReader) {
        const bytes = new Uint8Array(synchronousReader.readAsArrayBuffer(file.slice(offset, end)));
        destination.set(bytes);
        return record(bytes.byteLength);
      }
      return (async () => {
        if (!reader || readerPosition !== offset) {
          await reader?.cancel("TIFF input seek");
          reader = file.slice(offset).stream().getReader({ mode: "byob" });
          readerPosition = offset;
        }
        const request = end - offset;
        const result = await reader.read(readBuffer.subarray(0, request));
        assertActive();
        if (result.done || !result.value) return 0;
        destination.set(result.value);
        readerPosition += result.value.byteLength;
        readBuffer = result.value.buffer.byteLength >= INPUT_BUFFER_BYTES
          ? new Uint8Array(result.value.buffer)
          : new Uint8Array(INPUT_BUFFER_BYTES);
        return record(result.value.byteLength);
      })();
    },
    write(offset, source) {
      assertActive();
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        source.byteLength > OUTPUT_BUFFER_BYTES ||
        offset + source.byteLength > MAX_OUTPUT_BYTES
      ) {
        throw new Error("TIFF engine requested an invalid bounded PNG write.");
      }
      if (!archivePages) {
        return writeDestination(offset, source, "Writing PNG");
      }
      if (!activeZipPage || offset !== activeZipPage.size) {
        throw new Error("TIFF engine emitted a non-sequential ZIP page write.");
      }
      activeZipPage.crc = updateCrc32(activeZipPage.crc, source);
      activeZipPage.size += source.byteLength;
      ensureZip32(activeZipPage.size, "TIFF ZIP page size");
      return writeDestination(metrics.outputBytes, source, "Writing TIFF page");
    },
    message,
  };

  metrics.activeWorkerCount = 1 + (writable.additionalWorkerCount ?? 0);
  metrics.sharedArrayBufferBytes = writable.sharedBufferBytes ?? 0;
  try {
    const imported = (await import(/* @vite-ignore */ MODULE_URL)) as { default: TiffModuleFactory };
    const tiffModule = await imported.default({
      withinBridge: bridge,
      locateFile: (name) => name.endsWith(".wasm") ? WASM_URL : name,
      print: () => {},
      printErr: message,
    });
    assertActive();
    metrics.wasmMemoryBytes = tiffModule.HEAPU8.buffer.byteLength;
    if (metrics.wasmMemoryBytes !== WASM_MEMORY_BYTES) {
      throw new Error(`TIFF engine loaded ${metrics.wasmMemoryBytes} bytes of Wasm memory; expected ${WASM_MEMORY_BYTES}.`);
    }
    metrics.peakWasmMemoryBytes = Math.max(metrics.peakWasmMemoryBytes ?? 0, metrics.wasmMemoryBytes);
    const scanResult = await tiffModule.ccall(
      "within_tiff_scan_pages",
      "number",
      ["number"],
      [file.size],
      { async: true },
    );
    assertActive();
    if (scanResult !== 0) {
      const nativeError = tiffModule.UTF8ToString(tiffModule._within_tiff_error(), 1024);
      throw new Error(
        [nativeError, ...errors].filter(Boolean).join(" | ") ||
          `TIFF page scan failed with code ${scanResult}.`,
      );
    }
    const pageCount = tiffModule._within_tiff_page_count();
    if (
      !Number.isSafeInteger(pageCount) ||
      pageCount < 1 ||
      pageCount > MAX_TIFF_PAGES
    ) {
      throw new Error(
        `TIFF page count must be between 1 and ${MAX_TIFF_PAGES.toLocaleString("en-US")}.`,
      );
    }

    const entries: WrittenZipEntry[] = [];
    const pages: TiffPageRecord[] = [];
    let aggregateDecodedBytes = 0;
    const pageLimit = archivePages ? pageCount : 1;
    const digits = Math.max(4, String(pageCount).length);
    for (let index = 0; index < pageLimit; index += 1) {
      assertActive();
      const pageName = `page-${String(index + 1).padStart(digits, "0")}.png`;
      if (archivePages) {
        const nameBytes = new TextEncoder().encode(pageName);
        const flags = 0x0808;
        const method = 0;
        const { dosTime, dosDate } = unixToDos(0);
        const localHeaderOffset = metrics.outputBytes;
        ensureZip32(localHeaderOffset, "TIFF ZIP local-header offset");
        activeZipPage = {
          nameBytes,
          localHeaderOffset,
          flags,
          method,
          dosTime,
          dosDate,
          crc: 0xffff_ffff,
          size: 0,
        };
        await appendDestination(
          createZipLocalHeader(nameBytes, flags, method, dosTime, dosDate),
          "Writing TIFF ZIP header",
        );
      }
      emitProgress(
        jobId,
        archivePages
          ? `Decoding TIFF page ${index + 1} of ${pageCount}`
          : "Decoding TIFF scanlines",
        metrics,
        startedAt,
        true,
      );
      const result = await tiffModule.ccall(
        "within_tiff_page_to_png",
        "number",
        ["number", "number"],
        [file.size, index],
        { async: true },
      );
      assertActive();
      if (result !== 0) {
        const nativeError = tiffModule.UTF8ToString(
          tiffModule._within_tiff_error(),
          1024,
        );
        throw new Error(
          [nativeError, ...errors].filter(Boolean).join(" | ") ||
            `TIFF page ${index + 1} conversion failed with code ${result}.`,
        );
      }
      const width = tiffModule._within_tiff_page_width();
      const height = tiffModule._within_tiff_page_height();
      const bitsPerSample = tiffModule._within_tiff_page_bits();
      const samplesPerPixel = tiffModule._within_tiff_page_samples();
      const decodedBytes =
        width * height * samplesPerPixel * (bitsPerSample / 8);
      if (
        !Number.isSafeInteger(decodedBytes) ||
        decodedBytes < 1 ||
        (bitsPerSample !== 8 && bitsPerSample !== 16) ||
        samplesPerPixel < 1 ||
        samplesPerPixel > 4
      ) {
        throw new Error(`TIFF page ${index + 1} returned invalid decoded metadata.`);
      }
      aggregateDecodedBytes += decodedBytes;
      if (
        aggregateDecodedBytes > MAX_TIFF_AGGREGATE_DECODED_BYTES ||
        aggregateDecodedBytes / Math.max(1, file.size) >
          MAX_TIFF_EXPANSION_RATIO
      ) {
        throw new Error(
          "TIFF pages exceed the 64 GiB or 1,000:1 aggregate decoded safety limit.",
        );
      }
      if (!archivePages) continue;
      if (!activeZipPage || activeZipPage.size < 1) {
        throw new Error(`TIFF page ${index + 1} produced no PNG data.`);
      }
      const finalCrc = (activeZipPage.crc ^ 0xffff_ffff) >>> 0;
      await appendDestination(
        createZipDataDescriptor(
          finalCrc,
          activeZipPage.size,
          activeZipPage.size,
        ),
        "Writing TIFF ZIP descriptor",
      );
      entries.push({
        nameBytes: activeZipPage.nameBytes,
        directory: false,
        method: activeZipPage.method,
        flags: activeZipPage.flags,
        dosTime: activeZipPage.dosTime,
        dosDate: activeZipPage.dosDate,
        crc32: finalCrc,
        compressedSize: activeZipPage.size,
        uncompressedSize: activeZipPage.size,
        localHeaderOffset: activeZipPage.localHeaderOffset,
      });
      pages.push({
        file: pageName,
        index,
        width,
        height,
        bitsPerSample,
        samplesPerPixel,
        decodedBytes,
      });
      activeZipPage = null;
    }

    if (archivePages) {
      const manifest = new TextEncoder().encode(
        `${JSON.stringify(
          {
            schema: "within-tiff-pages-v1",
            sourceFormat: "tiff",
            pageCount,
            aggregateDecodedBytes,
            pages,
          },
          null,
          2,
        )}\n`,
      );
      const nameBytes = new TextEncoder().encode("pages.json");
      const flags = 0x0808;
      const method = 0;
      const { dosTime, dosDate } = unixToDos(0);
      const localHeaderOffset = metrics.outputBytes;
      await appendDestination(
        createZipLocalHeader(nameBytes, flags, method, dosTime, dosDate),
        "Writing TIFF manifest header",
      );
      let crc = 0xffff_ffff;
      for (let offset = 0; offset < manifest.byteLength; offset += OUTPUT_BUFFER_BYTES) {
        const chunk = manifest.subarray(
          offset,
          Math.min(offset + OUTPUT_BUFFER_BYTES, manifest.byteLength),
        );
        crc = updateCrc32(crc, chunk);
        await appendDestination(chunk, "Writing TIFF manifest");
      }
      const finalCrc = (crc ^ 0xffff_ffff) >>> 0;
      await appendDestination(
        createZipDataDescriptor(finalCrc, manifest.byteLength, manifest.byteLength),
        "Writing TIFF manifest descriptor",
      );
      entries.push({
        nameBytes,
        directory: false,
        method,
        flags,
        dosTime,
        dosDate,
        crc32: finalCrc,
        compressedSize: manifest.byteLength,
        uncompressedSize: manifest.byteLength,
        localHeaderOffset,
      });
      await finishZip(
        {
          file,
          metrics,
          assertActive,
          progress: (phase) =>
            emitProgress(jobId, phase, metrics, startedAt),
          write: (chunk, phase) => appendDestination(chunk, phase),
        },
        entries,
      );
    } else if (tiffModule._within_tiff_has_more_pages() !== 0) {
      options.post({
        type: "warning",
        jobId,
        message: "This TIFF contains multiple pages; only the first page was converted.",
      });
    }
    if (metrics.outputBytes === 0) {
      throw new Error("TIFF engine completed without producing output.");
    }
    metrics.inputBytes = file.size;
    await writable.flush?.();
    emitProgress(
      jobId,
      archivePages ? "Archived every TIFF page" : "Converted TIFF to PNG",
      metrics,
      startedAt,
      true,
    );
  } finally {
    metrics.queuedBytes = 0;
    metrics.pendingOperations = 0;
    const activeReader = reader as ReadableStreamBYOBReader | null;
    await activeReader?.cancel("TIFF conversion finished").catch(() => {});
  }
}
