// Headless input/destination-picker adapter only. All conversion, AVIO and
// random-access writing below are production modules, not a Node converter.
import { runMediaRemux } from "../../../workers/media-remux";
import { asynchronousFileStreamDestination } from "../../../workers/random-access-destination";
import type { Mpeg2SplitCore } from "../../../workers/mpeg2-split-runtime";
import type { ConversionMetrics } from "../../../lib/conversion-protocol";

self.onmessage = async (event: MessageEvent<{ file: File; handle: FileSystemFileHandle }>) => {
  const { file, handle } = event.data;
  const decoderUrl = "/engines/mpeg2-runtime-check/decoder.mjs";
  const encoderUrl = "/engines/mpeg2-runtime-check/encoder.mjs";
  const [{ default: decoderFactory }, { default: encoderFactory }] = await Promise.all([
    import(/* @vite-ignore */ decoderUrl), import(/* @vite-ignore */ encoderUrl),
  ]) as [{ default: Mpeg2SplitCore["decoderFactory"] }, { default: Mpeg2SplitCore["encoderFactory"] }];
  const writable = asynchronousFileStreamDestination(await handle.createWritable());
  const metrics: ConversionMetrics = { inputBytes: 0, outputBytes: 0, queuedBytes: 0, peakQueuedBytes: 0,
    pendingOperations: 0, peakPendingOperations: 0, maxReadChunkBytes: 0, maxWriteChunkBytes: 0, elapsedMs: 0 };
  const phases = new Set<string>();
  try {
    await runMediaRemux({ file, writable, remuxProfile: 40, profileId: "mkv-to-mp4-mpeg2", jobId: "runtime-check",
      mpeg2SplitCore: { decoderFactory, encoderFactory, decoderWasmUrl: "/engines/mpeg2-runtime-check/decoder.wasm",
        encoderWasmUrl: "/engines/mpeg2-runtime-check/encoder.wasm" },
      startedAt: performance.now(), isCancelled: () => false,
      metrics, post() {}, emitProgress(_id, phase) { phases.add(phase); } });
    await writable.close();
    self.postMessage({ type: "complete", metrics, phases: [...phases] });
  } catch (error) {
    await writable.abort();
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Unknown conversion failure", metrics });
  }
};
