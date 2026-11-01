// Independent finally checks for the private browser qualification harness.
// An acquisition that never happened is unavailable, not a passing pin check.
export async function finishPrivateVp9Integrity({ report, runtime, runtimeRemovalAllowed,
  original, expectedOriginal, assertEqual, inspectBrowserPin, assertBrowserPinsEqual, verifySources }) {
  const attempt = async (label, action) => {
    try { await action(); } catch (error) { report.failures.push(`${label}: ${error}`); }
  };
  await attempt("Owned runtime cleanup", async () => {
    report.ownedRuntimeRemoved = false;
    report.runtimeCleanupStatus = runtime ? "retained-unverified-process-exit" : "not-created";
    if (!runtime) return;
    if (!runtimeRemovalAllowed) throw new Error("Owned process exit must be verified before removing runtime data");
    report.runtimeCleanupStatus = "removal-failed";
    await runtime.close(); report.ownedRuntimeRemoved = true; report.runtimeCleanupStatus = "removed";
  });
  await attempt("Original integrity", async () => {
    report.originalAfter = await original(); assertEqual(report.originalAfter, expectedOriginal);
  });
  report.browserPinFinalCheck = "not-acquired";
  if (report.browserPin) {
    report.browserPinFinalCheck = "failed";
    await attempt("Browser pin integrity", async () => {
      assertBrowserPinsEqual(report.browserPin, await inspectBrowserPin());
      report.browserPinFinalCheck = "verified";
    });
  }
  await attempt("Source integrity", verifySources);
}
