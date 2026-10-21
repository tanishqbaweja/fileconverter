import type { ConversionMetrics, StartConversionMessage, TestFault } from "./conversion-protocol";
import { MPEG2_JOB_PROFILE } from "./mpeg2-stage-policy";
import { isVpxDecoderProfile, type VpxDecoderProfile } from "./vpx-decoder-policy";

export type StagedCopyProfile = "mkv-to-mp4" | typeof MPEG2_JOB_PROFILE | VpxDecoderProfile;

export function isOwnedCompletedStage(profileId: string, stagingName: string, jobId: string): boolean {
  return (profileId === "mkv-to-mp4" || profileId === MPEG2_JOB_PROFILE || isVpxDecoderProfile(profileId)) &&
    typeof jobId === "string" && /^[A-Za-z0-9-]+$/.test(jobId) &&
    typeof stagingName === "string" && stagingName.length <= 160 &&
    stagingName === `within-stage-${profileId}-${jobId}`;
}

export interface StagedCopyHandoff {
  type: "staged-copy-handoff";
  jobId: string;
  profileId: StagedCopyProfile;
  stagingName: string;
  stageClosed: true;
  jobStartedEpochMs: number;
  metrics: ConversionMetrics;
}

export interface StagedSaveRequest {
  type: "copy-staged";
  jobId: string;
  profileId: StagedCopyProfile;
  stagingName: string;
  handle: FileSystemFileHandle;
  jobStartedEpochMs: number;
  metrics: ConversionMetrics;
  cancellationBuffer?: SharedArrayBuffer;
  testFault?: Exclude<TestFault, "worker-crash">;
}

export interface StagedJobIdentity {
  jobId: string;
  profileId: string;
  sourceBytes: number;
  destination: StartConversionMessage["destination"];
  cancellationBuffer?: SharedArrayBuffer;
  testFault?: TestFault;
}

function invalid(): never { throw new TypeError("Invalid completed-stage handoff"); }
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const numericFields = new Set([
  "inputBytes", "outputBytes", "queuedBytes", "peakQueuedBytes", "pendingOperations", "peakPendingOperations",
  "maxReadChunkBytes", "maxWriteChunkBytes", "wasmMemoryBytes", "peakWasmMemoryBytes", "codecWorkingBytes", "peakCodecWorkingBytes",
  "scratchBytes", "peakScratchBytes", "maxScratchReadChunkBytes", "maxScratchWriteChunkBytes", "sharedArrayBufferBytes",
  "activeWorkerCount", "imageWorkingBytes", "peakImageWorkingBytes", "maxImagePixelStripBytes",
]);

export function validateStagedCopyHandoff(value: unknown, job: StagedJobIdentity, nowEpochMs: number): StagedSaveRequest {
  if (!value || typeof value !== "object" || !Number.isFinite(nowEpochMs)) invalid();
  const handoff = value as StagedCopyHandoff;
  if (handoff.type !== "staged-copy-handoff" || handoff.jobId !== job.jobId ||
    job.profileId !== handoff.profileId || job.destination.mode !== "staged-handle" || handoff.stageClosed !== true ||
    handoff.stagingName !== job.destination.stagingName || !isOwnedCompletedStage(handoff.profileId, handoff.stagingName, handoff.jobId) ||
    !Number.isFinite(handoff.jobStartedEpochMs) || handoff.jobStartedEpochMs <= 0 || handoff.jobStartedEpochMs > nowEpochMs + 1000)
    invalid();
  const original = handoff.metrics;
  if (!original || typeof original !== "object" || Object.keys(original).length > 32) invalid();
  for (const [key, field] of Object.entries(original)) {
    if (key === "elapsedMs") { if (!Number.isFinite(field) || field < 0) invalid(); }
    else if (key === "wasmMemories") {
      if (!field || typeof field !== "object" || Array.isArray(field) || Object.keys(field).length > 16) invalid();
      for (const [name, bytes] of Object.entries(field)) if (name.length > 64 || !count(bytes)) invalid();
    } else if (!numericFields.has(key) || !count(field)) invalid();
  }
  for (const key of ["inputBytes", "outputBytes", "queuedBytes", "peakQueuedBytes", "pendingOperations", "peakPendingOperations", "maxReadChunkBytes", "maxWriteChunkBytes"] as const)
    if (!count(original[key])) invalid();
  if (!Number.isFinite(original.elapsedMs) || original.elapsedMs < 0 || original.inputBytes > job.sourceBytes ||
    original.queuedBytes !== 0 || original.pendingOperations !== 0 || !count(original.scratchBytes) || original.scratchBytes <= 0 ||
    original.outputBytes !== 0 || !count(original.peakScratchBytes) || original.peakScratchBytes < original.scratchBytes)
    invalid();
  if (job.cancellationBuffer && job.cancellationBuffer.byteLength !== 4) invalid();
  return {
    type: "copy-staged", jobId: job.jobId, profileId: handoff.profileId, stagingName: handoff.stagingName,
    // Never trust a destination supplied by the retiring worker: retain the
    // original user-selected handle from the host's start request instead.
    handle: job.destination.handle, jobStartedEpochMs: handoff.jobStartedEpochMs,
    metrics: { ...original, wasmMemories: { ...original.wasmMemories } }, cancellationBuffer: job.cancellationBuffer,
    testFault: job.testFault === "worker-crash" ? undefined : job.testFault,
  };
}
