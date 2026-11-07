// Test trigger only: the production DOM handlers still start/cancel conversion.
// Observe real output before cancelling, with one frame awaited and no queue.
// No sleeps, slowed writer, smaller source, synthetic engine result or API hook.
export async function cancelAfterRealBrowserPayload({ getState, start, cancel, nextFrame, now }) {
  const deadline = now() + 30000;
  start();
  while (now() < deadline) {
    await nextFrame();
    const state = getState();
    if (state?.jobState === "running" && state.metrics?.outputBytes >= 65536) {
      const armedMetrics = { ...state.metrics };
      cancel();
      return { method: "in-page-real-output-observation-then-production-cancel-button", armedMetrics };
    }
    if (["complete", "error", "cancelled"].includes(state?.jobState))
      throw new Error("Payload cancellation missed running output; terminal state: " + state.jobState);
  }
  throw new Error("Payload cancellation timed out before real output; no cancellation claimed");
}
