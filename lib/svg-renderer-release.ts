import type { ConversionMetrics } from "./conversion-protocol";

/** Try both destructors, but never replace an in-flight parse/render/encode error. */
export function releaseSvgRendererObjects(
  metrics: ConversionMetrics,
  rendered: { free(): void } | null,
  renderer: { free(): void } | null,
  primaryFailureActive: boolean,
): void {
  let firstReleaseFailure: unknown, attemptedObjects = 0, releaseFailures = 0;
  const release = (object: { free(): void } | null) => {
    if (object === null) return;
    attemptedObjects++;
    try { object.free(); }
    catch (error) { if (releaseFailures === 0) firstReleaseFailure = error; releaseFailures++; }
  };
  release(rendered); release(renderer);
  metrics.svgReleaseObservation = { attemptedObjects, releaseFailures, primaryFailurePreserved: primaryFailureActive };
  // No object, Error, closure or buffer is retained in metrics. A failed engine
  // is retired by the normal application error lifecycle, never reused here.
  if (releaseFailures && !primaryFailureActive) throw firstReleaseFailure;
}
