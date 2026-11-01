// Private controlled fallback. The public coordinator does not select this path.
import { runMediaRemux, type MediaRemuxOptions } from "./media-remux";
import { assertWebCodecsVp9Options, loadWebCodecsVp9Core, type WebCodecsVp9Core } from "./webcodecs-vp9-core";
import type { RandomAccessDestination } from "./random-access-destination";

export async function runOptionalWebCodecsVp9(options: MediaRemuxOptions, dependencies: {
  loadCore?: () => Promise<WebCodecsVp9Core>;
  run?: typeof runMediaRemux;
  beforeWasmFallback?: () => Promise<void>;
  wasmFallbackCore?: "default" | "single-thread";
} = {}): Promise<{ backend: "webcodecs" | "wasm"; fallbackReason: string | null; wasmFallbackCore?: "default" | "single-thread" }> {
  if (![10, 11].includes(options.remuxProfile) || options.webCodecsVp9Core || options.vpxDecoderCore || options.mpeg2SplitCore ||
      options.aiffSpecialistCore || options.lowMemoryVideoCore || options.singleThreadVideoCore)
    throw new TypeError("Optional VP9 requires an unambiguous native VP9 profile and no other injected core.");
  if (dependencies.wasmFallbackCore !== undefined && !["default", "single-thread"].includes(dependencies.wasmFallbackCore))
    throw new TypeError("Unknown private Wasm fallback core policy.");
  let writeAttempts = 0, fallbackReason = "";
  const original = options.writable, run = dependencies.run ?? runMediaRemux;
  const writable: RandomAccessDestination = {
    requiresOwnedWriteBuffer: original.requiresOwnedWriteBuffer, additionalWorkerCount: original.additionalWorkerCount,
    sharedBufferBytes: original.sharedBufferBytes, maximumWriteBytes: original.maximumWriteBytes,
    async write(operation) { writeAttempts++; return original.write(operation); },
    writeSync: original.writeSync ? operation => { writeAttempts++; return original.writeSync!(operation); } : undefined,
    truncate: size => original.truncate(size), truncateSync: original.truncateSync?.bind(original),
    flush: original.flush?.bind(original), flushSync: original.flushSync?.bind(original), rotate: original.rotate?.bind(original),
    close: () => original.close(), abort: reason => original.abort(reason),
  };
  try {
    assertWebCodecsVp9Options(options.remuxProfile, options.audioOptions, options.videoOptions);
    const core = await (dependencies.loadCore ?? loadWebCodecsVp9Core)();
    await run({ ...options, writable, webCodecsVp9Core: core, forceAsynchronousInput: true });
    return { backend: "webcodecs", fallbackReason: null };
  } catch (error) {
    if (options.isCancelled()) throw new DOMException("Conversion cancelled", "AbortError");
    if (!(error instanceof DOMException) || error.name !== "NotSupportedError" || writeAttempts !== 0) throw error;
    // Keep bounded text, not the exception/stack across the entire CPU job.
    // An exception can retain its initialization call graph and native instance.
    fallbackReason = error.message.slice(0, 512);
  }
  // Never replay a write failure, partial output, cancelled job or corrupt source.
  // The candidate's production runtime already disposed its engine/input reader.
  await writable.truncate(0);
  if (options.isCancelled()) throw new DOMException("Conversion cancelled", "AbortError");
  if (dependencies.beforeWasmFallback) {
    await dependencies.beforeWasmFallback();
    if (options.isCancelled()) throw new DOMException("Conversion cancelled", "AbortError");
  }
  options.post({ type: "warning", jobId: options.jobId,
    message: "WebCodecs could not initialize this exact VP9 configuration; using the existing bounded Wasm encoder with the same requested settings." });
  await run({ ...options, writable, forceAsynchronousInput: true,
    ...(dependencies.wasmFallbackCore === "single-thread" ? { singleThreadVideoCore: true } : {}) });
  return { backend: "wasm", fallbackReason, wasmFallbackCore: dependencies.wasmFallbackCore ?? "default" };
}
