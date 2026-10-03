import assert from "node:assert/strict";
import test from "node:test";
import { summarizeUtilityActivity } from "../scripts/lib/chromium-utility-summary.mjs";

test("utility attribution preserves complete peak trees and identifies later services without omitting them", () => {
  const browser = { pid: 1, type: "browser", privateBytes: 10, rssBytes: 20 };
  const utility = { pid: 2, parentPid: 1, type: "utility", utilitySubtype: "chrome.mojom.UtilWin",
    sandboxType: "none", createdAt: "second", privateBytes: 250, rssBytes: 260 };
  const result = summarizeUtilityActivity([
    { phase: "blank", timestamp: "first", elapsedMs: 0, privateBytes: 10, rssBytes: 20, processes: [browser] },
    { phase: "conversion", timestamp: "second", elapsedMs: 1, privateBytes: 260, rssBytes: 280, processes: [browser, utility] },
  ]);
  assert.equal(result.phases[1].peakPrivateBytes, 260);
  assert.deepEqual(result.phases[1].peakSample.processes, [browser, utility]);
  assert.equal(result.utilities[0].utilitySubtype, "chrome.mojom.UtilWin");
  assert.equal(result.utilities[0].firstSeenPhase, "conversion");
  assert.equal(result.utilities[0].peakPrivateBytes, 250);
});

test("unavailable trees stay null, and reused utility PIDs remain separate by creation time", () => {
  const samples = [
    { phase: "unavailable", privateBytes: null, processes: null },
    ...["first", "second"].map((createdAt) => ({ phase: "idle", privateBytes: 20, processes: [
      { pid: 2, type: "utility", createdAt, privateBytes: 20 },
    ] })),
  ];
  const result = summarizeUtilityActivity(samples);
  assert.equal(result.phases[0].peakPrivateBytes, null);
  assert.equal(result.phases[0].minimumPrivateBytes, null);
  assert.equal(result.phases[0].unavailableSamples, 1);
  assert.equal(result.utilities.length, 2);
  assert.equal(result.utilities[0].utilitySubtype, null);
});
