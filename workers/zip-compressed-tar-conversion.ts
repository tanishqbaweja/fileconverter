import type { ConversionMetrics } from "../lib/conversion-protocol";
import { runZipArchiveConversion } from "./archive-conversion";
import { runBzip2Conversion } from "./bzip2-compression";
import { runXzConversion } from "./xz-compression";

const TAR_BRIDGE_CHUNK_BYTES = 64 * 1024;

export interface ZipToCompressedTarOptions {
  file: File;
  codec: "bzip2" | "xz";
  metrics: ConversionMetrics;
  assertActive(): void;
  progress(phase: string): void;
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
}

export async function runZipToCompressedTar(
  options: ZipToCompressedTarOptions,
): Promise<void> {
  const tarStream = new TransformStream<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
  >();
  const tarWriter = tarStream.writable.getWriter();
  let codecFailure: unknown = null;

  const codec = (async () => {
    try {
      const codecOptions = {
        file: options.file,
        inputStream: tarStream.readable,
        trackInputMetrics: false,
        decompress: false,
        metrics: options.metrics,
        assertActive: options.assertActive,
        progress: options.progress,
        write: options.write,
      };
      if (options.codec === "bzip2") {
        await runBzip2Conversion(codecOptions);
      } else {
        await runXzConversion(codecOptions);
      }
    } catch (error) {
      codecFailure = error;
    }
  })();

  const writeTarChunk = async (chunk: Uint8Array<ArrayBuffer>): Promise<void> => {
    for (
      let offset = 0;
      offset < chunk.byteLength;
      offset += TAR_BRIDGE_CHUNK_BYTES
    ) {
      if (codecFailure) throw codecFailure;
      const part = chunk.subarray(
        offset,
        Math.min(offset + TAR_BRIDGE_CHUNK_BYTES, chunk.byteLength),
      );
      await tarWriter.write(part);
      if (codecFailure) throw codecFailure;
    }
  };

  try {
    await runZipArchiveConversion({
      file: options.file,
      profileId: "zip-to-tar",
      metrics: options.metrics,
      write: (chunk) => writeTarChunk(chunk),
      assertActive: options.assertActive,
      progress: options.progress,
    });
    await tarWriter.close();
    await codec;
    if (codecFailure) throw codecFailure;
    if (options.metrics.outputBytes === 0) {
      throw new Error("The ZIP conversion produced no compressed TAR output.");
    }
  } catch (error) {
    await tarWriter.abort(error).catch(() => {});
    await codec;
    throw codecFailure ?? error;
  }
}
