import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cancelBrowserConversionBeforeCleanup } from "../scripts/lib/cancel-browser-conversion-before-cleanup.mjs";

test("Running memory-failed conversion reaches native terminal cancellation before cleanup", async () => {
  const calls = []; let state = "running";
  const page = { isClosed: () => false,
    evaluate: async () => { calls.push("state"); return { jobState: state }; },
    getByRole: (role, options) => { assert.equal(role, "button"); assert.deepEqual(options, { name: "Cancel safely", exact: true });
      return { click: async options => { assert.equal(options.timeout, 15000); calls.push("cancel"); } }; },
    waitForFunction: async (_, args, options) => { assert.equal(args, undefined); assert.equal(options.timeout, 30000); calls.push("terminal"); state = "cancelled"; },
  };
  const result = await cancelBrowserConversionBeforeCleanup(page);
  assert.deepEqual(calls, ["state", "cancel", "terminal", "state"]);
  assert.equal(result.cancellationRequested, true); assert.equal(result.terminalState, "cancelled");
  const driver = await readFile(new URL("../scripts/mpeg2-split-protected-memory.mjs", import.meta.url), "utf8");
  assert.ok(driver.indexOf("cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page)") < driver.indexOf("if (observer) {"));
  assert.ok(driver.indexOf("cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page)") < driver.indexOf("if (page && !page.isClosed()) await emptyOpfs()"));
});

test("Cancellation failure is surfaced instead of claiming quiescence or hiding lock ownership", async () => {
  for (const phase of ["cancel", "terminal"]) {
    const page = { isClosed: () => false, evaluate: async () => ({ jobState: "running" }),
      getByRole: () => ({ click: async () => { if (phase === "cancel") throw new Error("cancel unavailable"); } }),
      waitForFunction: async () => { throw new Error("terminal deadline"); },
    };
    await assert.rejects(cancelBrowserConversionBeforeCleanup(page), phase === "cancel" ? /cancel unavailable/ : /terminal deadline/);
  }
  assert.equal((await cancelBrowserConversionBeforeCleanup(null)).cancellationRequested, false);
  const result = await cancelBrowserConversionBeforeCleanup({ isClosed: () => false, evaluate: async () => ({ jobState: "error" }) });
  assert.equal(result.cancellationRequested, false); assert.equal(result.terminalState, "error");
});
