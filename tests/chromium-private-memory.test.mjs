import assert from "node:assert/strict";
import test from "node:test";
import { stableWindow, summarizeTree } from "../scripts/lib/chromium-private-memory.mjs";

test("private-memory aggregation includes utility and GPU processes and rejects missing root/data", () => {
  const processes = [
    { pid: 1, type: "browser", privateBytes: 10, rssBytes: 20 },
    { pid: 2, type: "gpu-process", privateBytes: 30, rssBytes: 40 },
    { pid: 3, type: "utility", privateBytes: 50, rssBytes: 60 },
  ];
  assert.equal(summarizeTree(processes, 1).privateBytes, 90);
  assert.equal(summarizeTree(processes, 1).rssBytes, 120);
  assert.throws(() => summarizeTree([], 1));
  assert.throws(() => summarizeTree(processes, 4));
  assert.throws(() => summarizeTree([...processes, { pid: 4, privateBytes: null, rssBytes: 10 }], 1));
});

test("baseline requires five consecutive valid stable samples after stabilization, not a larger fallback", () => {
  const samples = Array.from({ length: 9 }, (_, index) => ({ timestamp: String(index), elapsedMs: index * 1000,
    privateBytes: 100_000_000 + index * 1000, rssBytes: 200_000_000 }));
  assert.equal(stableWindow(samples).privateBytes, 100_006_000);
  assert.equal(stableWindow(samples.slice(0, 5)), null);
  assert.equal(stableWindow([...samples.slice(0, -1), { ...samples.at(-1), privateBytes: null }]), null);
  assert.equal(stableWindow([...samples.slice(0, -1), { ...samples.at(-1), privateBytes: 150_000_000 }]), null);
});
