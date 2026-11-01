// Private worker smoke harness. Uses production AVIO/native ABI and destination
// adapters; no Node converter. Not a public profile or a substitute for full stress.
import { runMediaRemux } from "./media-remux";
import { loadWebCodecsVp9Core } from "./webcodecs-vp9-core";
import { runOptionalWebCodecsVp9 } from "./webcodecs-vp9-optional";
import { asynchronousFileStreamDestination } from "./random-access-destination";
import type { ConversionMetrics } from "../lib/conversion-protocol";
import type { VideoConversionOptions } from "../lib/media-conversion-options";
interface Request {
  file: File;
  output: FileSystemFileHandle;
  cancellation: SharedArrayBuffer;
  nativeProfile: 10 | 11;
  video: VideoConversionOptions;
  implementation: "candidate" | "wasm-baseline" | "automatic";
  diagnosticCheckpoints?: boolean;
  fallbackCore?: "default" | "single-thread";
}
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request | { diagnosticRelease: number }>) => void) | null; postMessage(value: unknown): void; close(): void };
let running = false;
let pendingCheckpoint: { id: number; release: () => void } | null = null;
scope.onmessage = async ({ data }) => {
  if ("diagnosticRelease" in data) {
    if (Number.isSafeInteger(data.diagnosticRelease) && pendingCheckpoint?.id === data.diagnosticRelease) pendingCheckpoint.release();
    return;
  }
  if (running) { scope.postMessage({ type: "error", message: "One private qualification job at a time" }); return; }
  running = true;
  let destination: ReturnType<typeof asynchronousFileStreamDestination> | undefined, succeeded = false;
  let terminal: Record<string, unknown> = { type: "error", message: "Private worker did not finish" };
  const startedAt = performance.now(), warnings: string[] = [];
  const metrics: ConversionMetrics = { inputBytes: 0, outputBytes: 0, queuedBytes: 0, peakQueuedBytes: 0,
    pendingOperations: 0, peakPendingOperations: 0, maxReadChunkBytes: 0, maxWriteChunkBytes: 0, elapsedMs: 0,
    wasmMemoryBytes: 0, peakWasmMemoryBytes: 0, wasmMemories: {}, sharedArrayBufferBytes: 4, activeWorkerCount: 1, imageWorkingBytes: 0 };
  let core: Awaited<ReturnType<typeof loadWebCodecsVp9Core>> | undefined, lastProgress = -Infinity;
  let checkpointCount = 0;
  const checkpoint = async (label: string): Promise<void> => {
    if (!data.diagnosticCheckpoints) return;
    if (pendingCheckpoint || ++checkpointCount > 4) throw new Error("Private diagnostic checkpoint bound exceeded");
    const id = checkpointCount;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { pendingCheckpoint = null; reject(new Error("Private diagnostic checkpoint timed out")); }, 4000);
      pendingCheckpoint = { id, release() { clearTimeout(timer); pendingCheckpoint = null; resolve(); } };
      scope.postMessage({ type: "diagnostic-checkpoint", id, label, metrics });
    });
  };
  try {
    if (!(data.file instanceof File) || !(data.cancellation instanceof SharedArrayBuffer) || data.cancellation.byteLength !== 4 ||
        ![10, 11].includes(data.nativeProfile) || !["candidate", "wasm-baseline", "automatic"].includes(data.implementation) ||
        (data.diagnosticCheckpoints !== undefined && typeof data.diagnosticCheckpoints !== "boolean") ||
        (data.fallbackCore !== undefined && !["default", "single-thread"].includes(data.fallbackCore)))
      throw new TypeError("Invalid private qualification request");
    const cancelled = new Int32Array(data.cancellation);
    destination = asynchronousFileStreamDestination(await data.output.createWritable());
    if (data.implementation === "candidate") core = await loadWebCodecsVp9Core();
    const options = { file: data.file, profileId: data.nativeProfile === 11 ? "ogv-to-webm-vp9" : "mkv-to-webm-vp9",
      onNativeInitialized: data.diagnosticCheckpoints ? async observation => checkpoint(observation.engine + "-ready") : undefined,
      writable: destination, remuxProfile: data.nativeProfile, webCodecsVp9Core: core, forceAsynchronousInput: true,
      videoOptions: data.video, jobId: "private-webcodecs-vp9", metrics, startedAt,
      isCancelled: () => Atomics.load(cancelled, 0) !== 0,
      emitProgress(_job, phase, current, _started, force) {
        current.elapsedMs = performance.now() - startedAt;
        if (force || performance.now() - lastProgress >= 500) {
          lastProgress = performance.now(); scope.postMessage({ type: "progress", phase, metrics: current });
        }
      }, post(message) {
        if (message.type === "warning") { if (warnings.length === 32) warnings.shift(); warnings.push(message.message.slice(0, 512)); }
      } } satisfies Parameters<typeof runMediaRemux>[0];
    const selection = data.implementation === "automatic" ? await runOptionalWebCodecsVp9(options, {
      async loadCore() { core = await loadWebCodecsVp9Core(); return core; },
      beforeWasmFallback: data.diagnosticCheckpoints ? async () => checkpoint("candidate-disposed") : undefined,
      wasmFallbackCore: data.fallbackCore,
    }) : null;
    if (!selection) await runMediaRemux(options);
    await destination.close(); succeeded = true;
    if (data.diagnosticCheckpoints) await checkpoint("output-closed");
    metrics.elapsedMs = performance.now() - startedAt;
    terminal = { type: "complete", elapsedMs: metrics.elapsedMs, metrics, warnings, selection, encoder: core?.snapshot() ?? null,
      scope: "real-private-worker-conversion-not-stress-or-public-acceptance" };
  } catch (error) {
    terminal = { type: "error", elapsedMs: performance.now() - startedAt, metrics, warnings,
      message: String(error).slice(0, 4096), encoder: core?.snapshot() ?? null };
  } finally {
    try { if (!succeeded) await destination?.abort("Private qualification failed"); }
    catch (error) { terminal = { ...terminal, type: "error", cleanupError: String(error).slice(0, 512) }; }
    finally { scope.postMessage(terminal); scope.close(); }
  }
};
