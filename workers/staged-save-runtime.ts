import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import { isOwnedCompletedStage, type StagedSaveRequest } from "../lib/staged-copy-protocol";
import { MIN_PROGRESS_INTERVAL_MS, STAGED_SAVE_COPY_CHUNK_BYTES } from "../lib/resource-limits";

export async function runStagedSave(message: StagedSaveRequest, options: {
  storage: Pick<StorageManager, "getDirectory">;
  isCancelled(): boolean;
  post(message: WorkerResponse): void;
  clock?: { origin: number; now(): number; pause(): Promise<void> };
}): Promise<void> {
  const clock = options.clock ?? { origin: performance.timeOrigin, now: () => performance.now(),
    pause: () => new Promise<void>(resolve => setTimeout(resolve, 0)) };
  const metrics: ConversionMetrics = { ...message.metrics, wasmMemoryBytes: 0, wasmMemories: {},
    sharedArrayBufferBytes: message.cancellationBuffer?.byteLength ?? 0, activeWorkerCount: 1 };
  const jobId = message.jobId, startedAt = message.jobStartedEpochMs - clock.origin;
  const copyPhase = "Copying staged MP4 to selected destination", copyChunkBytes = STAGED_SAVE_COPY_CHUNK_BYTES;
  let root: FileSystemDirectoryHandle | null = null, readAccess: FileSystemSyncAccessHandle | null = null;
  let finalWritable: FileSystemWritableFileStream | null = null;
  let stageOwned = false;
  let lastProgressAt = -Infinity, lastCancellationYieldBytes = 0;
  const assertActive = () => { if (options.isCancelled()) throw new DOMException("Conversion cancelled", "AbortError"); };
  const emitProgress = (_job: string, phase: string, current: ConversionMetrics, _started: number, force = false) => {
    const now = clock.now(); if (!force && now - lastProgressAt < MIN_PROGRESS_INTERVAL_MS) return;
    lastProgressAt = now; current.elapsedMs = Math.max(current.elapsedMs, now - startedAt);
    options.post({ type: "progress", jobId, phase, metrics: { ...current } });
  };
  const yieldForCancellation = async (bytes: number) => {
    if (bytes - lastCancellationYieldBytes < 1024 * 1024) return;
    lastCancellationYieldBytes = bytes; await clock.pause(); assertActive();
  };
  const faultMessage = (fault: StagedSaveRequest["testFault"]): Error => {
    if (fault === "quota") return new DOMException("The destination ran out of quota after a bounded write.", "QuotaExceededError");
    if (fault === "permission") return new DOMException("Destination permission was revoked after a bounded write.", "NotAllowedError");
    return new Error("The destination rejected a bounded write.");
  };
  const removeStage = async () => {
    if (!stageOwned) return;
    if (!root) root = await options.storage.getDirectory();
    try { await root.removeEntry(message.stagingName); metrics.scratchBytes = 0; }
    catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") { metrics.scratchBytes = 0; return; }
      options.post({ type: "warning", jobId, message: "The completed stage could not be removed. Use Storage management to clean temporary files." });
      throw error;
    }
  };
  try {
    if (!isOwnedCompletedStage(message.profileId, message.stagingName, message.jobId))
      throw new Error("Invalid completed stage");
    stageOwned = true;
    assertActive(); root = await options.storage.getDirectory();
    const stagingHandle = await root.getFileHandle(message.stagingName), stagedFile = await stagingHandle.getFile();
    if (stagedFile.size !== metrics.scratchBytes || stagedFile.size <= 0) throw new Error("Completed stage changed before final save");
    emitProgress(jobId, copyPhase, metrics, startedAt, true);
    assertActive(); finalWritable = await message.handle.createWritable({ keepExistingData: false });
    await finalWritable.truncate(0); readAccess = await stagingHandle.createSyncAccessHandle!();
    const testFault = message.testFault;
        const buffer = new Uint8Array(copyChunkBytes);
        let copiedBytes = 0;
        let injectedFault = false;
        while (copiedBytes < stagedFile.size) {
          assertActive();
          const bytesRead = readAccess.read(buffer, { at: copiedBytes });
          if (bytesRead <= 0) {
            throw new Error(
              `The staged output stopped after ${copiedBytes} of ${stagedFile.size} bytes.`,
            );
          }
          const value = buffer.subarray(0, bytesRead);
          assertActive();
          metrics.maxScratchReadChunkBytes = Math.max(
            metrics.maxScratchReadChunkBytes ?? 0,
            value.byteLength,
          );
          metrics.maxScratchWriteChunkBytes = Math.max(
            metrics.maxScratchWriteChunkBytes ?? 0,
            value.byteLength,
          );
          metrics.maxWriteChunkBytes = Math.max(
            metrics.maxWriteChunkBytes,
            value.byteLength,
          );
          metrics.queuedBytes = value.byteLength;
          metrics.peakQueuedBytes = Math.max(
            metrics.peakQueuedBytes,
            value.byteLength,
          );
          metrics.pendingOperations = 1;
          metrics.peakPendingOperations = Math.max(
            metrics.peakPendingOperations,
            1,
          );
          try {
            await finalWritable.write(value);
          } finally {
            metrics.queuedBytes = 0;
            metrics.pendingOperations = 0;
          }
          copiedBytes += value.byteLength;
          metrics.outputBytes = copiedBytes;
          if (testFault && !injectedFault) {
            injectedFault = true;
            throw faultMessage(testFault);
          }
          emitProgress(
            jobId,
            copyPhase,
            metrics,
            startedAt,
          );
          await yieldForCancellation(copiedBytes);
        }
        readAccess.close();
        readAccess = null;
        if (copiedBytes !== stagedFile.size) {
          throw new Error(
            `The staged output copy was incomplete: ${copiedBytes} of ${stagedFile.size} bytes.`,
          );
        }
        await finalWritable.close();
    finalWritable = null;
    await removeStage();
    emitProgress(jobId, "Complete", metrics, startedAt, true);
    options.post({ type: "complete", jobId, metrics: { ...metrics } });
  } catch (error) {
    try { readAccess?.close(); } catch { /* Continue all independent owned cleanup. */ }
    readAccess = null;
    try { await finalWritable?.abort(error); } catch { /* Preserve the first write/cancel error. */ }
    finalWritable = null;
    try { await removeStage(); } catch { /* Warning emitted; host also owns abandoned-stage cleanup. */ }
    metrics.queuedBytes = 0; metrics.pendingOperations = 0;
    metrics.elapsedMs = Math.max(metrics.elapsedMs, clock.now() - startedAt);
    if (error instanceof DOMException && error.name === "AbortError") options.post({ type: "cancelled", jobId, metrics: { ...metrics } });
    else options.post({ type: "error", jobId, message: (error instanceof Error ? error.message : String(error)).slice(0, 512), metrics: { ...metrics } });
  }
}
