import assert from "node:assert/strict";

// A failed memory assertion can interrupt a STILL RUNNING production job.
// Release its native writer/OPFS lock through normal cancellation before storage
// removal, not by racing removeEntry against a live SyncAccessHandle.
export async function cancelBrowserConversionBeforeCleanup(page) {
  if (!page || page.isClosed()) return { scope: "no-live-page", cancellationRequested: false, terminalState: null };
  let state = await page.evaluate(() => window.__WITHIN_TEST__?.getState() ?? null);
  if (state?.jobState === "running") {
    await page.getByRole("button", { name: "Cancel safely", exact: true }).click({ timeout: 15000 });
    await page.waitForFunction(() => {
      const value = window.__WITHIN_TEST__?.getState().jobState;
      return value === "cancelled" || value === "error" || value === "complete";
    }, undefined, { timeout: 30000 });
    state = await page.evaluate(() => window.__WITHIN_TEST__?.getState() ?? null);
    assert.ok(["cancelled", "error", "complete"].includes(state?.jobState), "Owned browser conversion is not terminal");
    return { scope: "normal-production-cancellation-before-storage-removal", cancellationRequested: true, terminalState: state.jobState };
  }
  return { scope: "no-running-conversion", cancellationRequested: false, terminalState: state?.jobState ?? null };
}
