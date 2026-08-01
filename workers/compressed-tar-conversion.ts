import type { ConversionMetrics } from "../lib/conversion-protocol";
import { convertSequentialTarToZip } from "./archive-conversion";
import { runBzip2Conversion } from "./bzip2-compression";
import { runXzConversion } from "./xz-compression";

const TAR_CHUNK_BYTES = 64 * 1024;

export interface CompressedTarToZipOptions {
  file: File;
  codec: "bzip2" | "xz";
  metrics: ConversionMetrics;
  assertActive(): void;
  progress(phase: string): void;
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
}

export async function runCompressedTarToZip(
  options: CompressedTarToZipOptions,
): Promise<void> {
  const tarStream = new TransformStream<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
  >();
  const tarWriter = tarStream.writable.getWriter();
  let consumerFailure: unknown = null;

  const consumer = (async () => {
    try {
      await convertSequentialTarToZip(
        {
          file: options.file,
          metrics: options.metrics,
          assertActive: options.assertActive,
          progress: options.progress,
          write: options.write,
        },
        tarStream.readable,
        options.codec === "bzip2" ? "TAR.BZ2" : "TAR.XZ",
      );
    } catch (error) {
      consumerFailure = error;
    }
  })();

  const writeTarChunk = async (chunk: Uint8Array<ArrayBuffer>): Promise<void> => {
    if (chunk.byteLength > TAR_CHUNK_BYTES) {
      throw new Error("The compressed-TAR bridge exceeded its 64 KiB chunk limit.");
    }
    if (consumerFailure) throw consumerFailure;
    await tarWriter.write(chunk);
    if (consumerFailure) throw consumerFailure;
  };

  try {
    const codecOptions = {
      file: options.file,
      decompress: true,
      metrics: options.metrics,
      assertActive: options.assertActive,
      progress: options.progress,
      write: (chunk: Uint8Array<ArrayBuffer>) => writeTarChunk(chunk),
    };
    if (options.codec === "bzip2") {
      await runBzip2Conversion(codecOptions);
    } else {
      await runXzConversion(codecOptions);
    }
    await tarWriter.close();
    await consumer;
    if (consumerFailure) throw consumerFailure;
    if (options.metrics.outputBytes === 0) {
      throw new Error("The compressed TAR conversion produced no ZIP output.");
    }
  } catch (error) {
    await tarWriter.abort(error).catch(() => {});
    await consumer;
    throw consumerFailure ?? error;
  }
}
