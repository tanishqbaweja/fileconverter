import type { ConversionMetrics } from "../lib/conversion-protocol";
import { runBzip2Conversion } from "./bzip2-compression";
import { TarStreamValidator } from "./tar-stream-validator";
import { runXzConversion } from "./xz-compression";

const INPUT_CHUNK_BYTES = 256 * 1024;
const TAR_CHUNK_BYTES = 64 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_EXPANSION_RATIO = 100;

export type CompressionCodec = "gzip" | "bzip2" | "xz";

export interface CompressionTranscodeOptions {
  file: File;
  source: CompressionCodec;
  target: CompressionCodec;
  validateTar: boolean;
  metrics: ConversionMetrics;
  assertActive(): void;
  progress(phase: string): void;
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
}

export async function runCompressionTranscode(
  options: CompressionTranscodeOptions,
): Promise<void> {
  if (options.source === options.target) {
    throw new Error("Compression transcoding requires different codecs.");
  }
  const payloadStream = new TransformStream<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
  >();
  const payloadWriter = payloadStream.writable.getWriter();
  const validator = options.validateTar ? new TarStreamValidator() : null;
  let targetFailure: unknown = null;

  const target = (async () => {
    try {
      await encodeTarget(options, payloadStream.readable);
    } catch (error) {
      targetFailure = error;
    }
  })();

  const writePayloadChunk = async (
    chunk: Uint8Array<ArrayBuffer>,
  ): Promise<void> => {
    validator?.push(chunk);
    for (let offset = 0; offset < chunk.byteLength; offset += TAR_CHUNK_BYTES) {
      if (targetFailure) throw targetFailure;
      const part = chunk.slice(
        offset,
        Math.min(offset + TAR_CHUNK_BYTES, chunk.byteLength),
      );
      await payloadWriter.write(part);
      if (targetFailure) throw targetFailure;
    }
  };

  let sourceFailure: unknown = null;
  try {
    try {
      await decodeSource(options, writePayloadChunk);
      validator?.finish();
    } catch (error) {
      sourceFailure = error;
      throw error;
    }
    await payloadWriter.close();
    await target;
    if (targetFailure) throw targetFailure;
    if (options.metrics.outputBytes === 0) {
      throw new Error("The compression transcoder produced no output.");
    }
  } catch (error) {
    await payloadWriter.abort(error).catch(() => {});
    await target;
    throw sourceFailure ?? targetFailure ?? error;
  }
}

async function decodeSource(
  options: CompressionTranscodeOptions,
  writePayloadChunk: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>,
): Promise<void> {
  if (options.source === "gzip") {
    await decodeGzip(options, writePayloadChunk);
    return;
  }
  const codecOptions = {
    file: options.file,
    decompress: true,
    metrics: options.metrics,
    assertActive: options.assertActive,
    progress: options.progress,
    write: (chunk: Uint8Array<ArrayBuffer>) => writePayloadChunk(chunk),
  };
  if (options.source === "bzip2") {
    await runBzip2Conversion(codecOptions);
  } else {
    await runXzConversion(codecOptions);
  }
}

async function encodeTarget(
  options: CompressionTranscodeOptions,
  inputStream: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<void> {
  if (options.target === "gzip") {
    const encoded = inputStream.pipeThrough(
      new CompressionStream("gzip") as unknown as ReadableWritablePair<
        Uint8Array<ArrayBuffer>,
        Uint8Array<ArrayBuffer>
      >,
    );
    const reader = encoded.getReader();
    try {
      for (;;) {
        options.assertActive();
        const { done, value } = await reader.read();
        if (done) break;
        await options.write(value, `Writing ${codecLabel(options.target)}`);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return;
  }

  const codecOptions = {
    file: options.file,
    inputStream,
    trackInputMetrics: false,
    decompress: false,
    metrics: options.metrics,
    assertActive: options.assertActive,
    progress: options.progress,
    write: options.write,
  };
  if (options.target === "bzip2") {
    await runBzip2Conversion(codecOptions);
  } else {
    await runXzConversion(codecOptions);
  }
}

async function decodeGzip(
  options: CompressionTranscodeOptions,
  writePayloadChunk: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>,
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
      options.assertActive();
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
      await writePayloadChunk(value);
      options.progress(`Decompressing ${codecLabel(options.source)}`);
    }
    options.metrics.inputBytes = options.file.size;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function createBoundedFileInput(
  options: CompressionTranscodeOptions,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const reader = options.file.stream().getReader({ mode: "byob" });
  let readBuffer = new Uint8Array(INPUT_CHUNK_BYTES);
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        options.assertActive();
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
        options.progress(`Reading ${codecLabel(options.source)}`);
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

function codecLabel(codec: CompressionCodec): string {
  return codec === "gzip" ? "GZIP" : codec === "bzip2" ? "BZIP2" : "XZ";
}
