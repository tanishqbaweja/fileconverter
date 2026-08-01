import { runZipArchiveConversion } from "./archive-conversion";
import { runBzip2Conversion } from "./bzip2-compression";
import {
  runTarStreamToSevenZip,
  type SevenZipConversionOptions,
} from "./sevenzip-conversion";
import { runXzConversion } from "./xz-compression";

const INPUT_CHUNK_BYTES = 256 * 1024;
const TAR_CHUNK_BYTES = 64 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_EXPANSION_RATIO = 100;

export interface ArchiveToSevenZipOptions extends SevenZipConversionOptions {
  source: "gzip" | "bzip2" | "xz" | "zip";
}

export async function runArchiveToSevenZip(
  options: ArchiveToSevenZipOptions,
): Promise<void> {
  const tarStream = new TransformStream<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
  >();
  const tarWriter = tarStream.writable.getWriter();
  const sourceLabel =
    options.source === "gzip"
      ? "TAR.GZ"
      : options.source === "bzip2"
        ? "TAR.BZ2"
        : options.source === "xz"
          ? "TAR.XZ"
          : "ZIP";
  const phase = `Converting ${sourceLabel} to 7Z`;
  let producerFailure: unknown = null;
  let consumerFailure: unknown = null;

  const writeTarChunk = async (
    chunk: Uint8Array<ArrayBuffer>,
  ): Promise<void> => {
    for (let offset = 0; offset < chunk.byteLength; offset += TAR_CHUNK_BYTES) {
      if (consumerFailure) throw consumerFailure;
      const part = chunk.slice(
        offset,
        Math.min(offset + TAR_CHUNK_BYTES, chunk.byteLength),
      );
      await tarWriter.write(part);
      if (consumerFailure) throw consumerFailure;
    }
  };

  const consumer = (async () => {
    try {
      await runTarStreamToSevenZip(options, tarStream.readable, phase);
    } catch (error) {
      consumerFailure = error;
    }
  })();

  const producer = (async () => {
    try {
      if (options.source === "gzip") {
        await produceGzipTar(options, writeTarChunk);
      } else if (options.source === "zip") {
        await runZipArchiveConversion({
          file: options.file,
          profileId: "zip-to-tar",
          metrics: options.metrics,
          assertActive: assertActive(options),
          progress: progress(options),
          write: (chunk) => writeTarChunk(chunk),
        });
      } else {
        const codecOptions = {
          file: options.file,
          decompress: true,
          metrics: options.metrics,
          assertActive: assertActive(options),
          progress: progress(options),
          write: (chunk: Uint8Array<ArrayBuffer>) => writeTarChunk(chunk),
          compactDecoder: options.source === "xz",
        };
        if (options.source === "bzip2") {
          await runBzip2Conversion(codecOptions);
        } else {
          await runXzConversion(codecOptions);
        }
      }
    } catch (error) {
      producerFailure = error;
    }
  })();

  try {
    await producer;
    if (producerFailure) throw producerFailure;
    await tarWriter.close();
    await consumer;
    if (consumerFailure) throw consumerFailure;
    if (options.metrics.outputBytes === 0) {
      throw new Error(`${phase} produced no output.`);
    }
  } catch (error) {
    await tarWriter.abort(error).catch(() => {});
    await producer;
    await consumer;
    throw producerFailure ?? consumerFailure ?? error;
  }
}

async function produceGzipTar(
  options: ArchiveToSevenZipOptions,
  writeTarChunk: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>,
): Promise<void> {
  const source = createBoundedFileInput(options);
  const decoded = source.pipeThrough(
    new DecompressionStream("gzip") as unknown as ReadableWritablePair<
      Uint8Array<ArrayBuffer>,
      Uint8Array<ArrayBuffer>
    >,
  );
  const reader = decoded.getReader();
  let expandedBytes = 0;
  try {
    for (;;) {
      assertActive(options)();
      const { done, value } = await reader.read();
      if (done) break;
      expandedBytes += value.byteLength;
      const ratio = expandedBytes / Math.max(1, options.metrics.inputBytes);
      if (
        expandedBytes > MAX_EXPANDED_BYTES ||
        (expandedBytes > 1024 * 1024 && ratio > MAX_EXPANSION_RATIO)
      ) {
        throw new Error(
          `GZIP decompression stopped: output exceeded the ${MAX_EXPANSION_RATIO}:1 or 64 GiB expansion safety limit.`,
        );
      }
      await writeTarChunk(value);
      progress(options)("Decompressing TAR.GZ");
    }
    options.metrics.inputBytes = options.file.size;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function createBoundedFileInput(
  options: ArchiveToSevenZipOptions,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const reader = options.file.stream().getReader({ mode: "byob" });
  let readBuffer = new Uint8Array(INPUT_CHUNK_BYTES);
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        assertActive(options)();
        const { done, value } = await reader.read(readBuffer);
        if (done) {
          controller.close();
          return;
        }
        const owned = value.slice();
        options.metrics.inputBytes += owned.byteLength;
        options.metrics.maxReadChunkBytes = Math.max(
          options.metrics.maxReadChunkBytes,
          owned.byteLength,
        );
        progress(options)("Reading TAR.GZ");
        readBuffer =
          value.buffer.byteLength >= INPUT_CHUNK_BYTES
            ? new Uint8Array(value.buffer, 0, INPUT_CHUNK_BYTES)
            : new Uint8Array(INPUT_CHUNK_BYTES);
        controller.enqueue(owned);
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => {});
      },
    },
    { highWaterMark: 1 },
  );
}

function assertActive(
  options: ArchiveToSevenZipOptions,
): () => void {
  return () => {
    if (options.isCancelled()) {
      throw new DOMException("Conversion cancelled", "AbortError");
    }
  };
}

function progress(
  options: ArchiveToSevenZipOptions,
): (phase: string) => void {
  return (phase) =>
    options.emitProgress(
      options.jobId,
      phase,
      options.metrics,
      options.startedAt,
    );
}
