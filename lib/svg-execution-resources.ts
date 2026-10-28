import type { ConversionMetrics } from "./conversion-protocol";
import type { RandomAccessDestination } from "../workers/random-access-destination";

type Phase = NonNullable<ConversionMetrics["svgExecutionResources"]>["phase"];
/** Scalar metadata only: the real destination owns its worker and buffers. */
export function observeSvgExecutionResources(
  metrics: ConversionMetrics,
  destination: Pick<RandomAccessDestination, "sharedBufferBytes" | "additionalWorkerCount">,
  cancellationBytes: number,
  phase: Phase,
): void {
  if (!["opened", "closed", "aborted", "abort-unverified"].includes(phase)) {
    throw new TypeError("Unknown SVG destination resource phase");
  }
  const destinationSharedBytes = destination.sharedBufferBytes ?? 0;
  const destinationWorkers = destination.additionalWorkerCount ?? 0;
  if (![destinationSharedBytes, destinationWorkers].every(value => Number.isSafeInteger(value) && value >= 0) ||
      (cancellationBytes !== 0 && cancellationBytes !== Int32Array.BYTES_PER_ELEMENT)) {
    throw new RangeError("Invalid SVG destination allocation metadata");
  }
  const allocatedSharedBytes = cancellationBytes + destinationSharedBytes;
  const knownWorkerPeak = 1 + destinationWorkers;
  if (!Number.isSafeInteger(allocatedSharedBytes) || !Number.isSafeInteger(knownWorkerPeak)) {
    throw new RangeError("SVG destination allocation total exceeds safe integer bookkeeping");
  }
  const currentDestinationWorkers = phase === "opened" ? destinationWorkers
    : phase === "abort-unverified" && destinationWorkers !== 0 ? null : 0;
  const previous = metrics.svgExecutionResources;
  metrics.svgExecutionResources = {
    phase, cancellationBytes, destinationSharedBytes, allocatedSharedBytes,
    peakAllocatedSharedBytes: Math.max(previous?.peakAllocatedSharedBytes ?? 0, allocatedSharedBytes),
    destinationWorkerCount: currentDestinationWorkers,
    peakKnownWorkerCount: Math.max(previous?.peakKnownWorkerCount ?? 1, knownWorkerPeak),
    sharedBytesMeaning: "allocated-for-job-not-garbage-collection-or-process-memory",
  };
  // A closed stream can still retain the SAB closures until this job's worker
  // retires. Never pretend close/abort proves those allocations were collected.
  metrics.sharedArrayBufferBytes = allocatedSharedBytes;
  if (currentDestinationWorkers === null) delete metrics.activeWorkerCount;
  else metrics.activeWorkerCount = 1 + currentDestinationWorkers;
}
