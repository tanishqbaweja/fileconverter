// Inspect retained measurements only. No source media read/conversion or browser.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectRetainedPeakNeighbors } from "./lib/native-memory-bursts.mjs";
const root = path.resolve(import.meta.dirname, "..");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-static-ui-original-failure-2026-10-07.json")));
const file = path.join(root, prior.report.path);
assert.ok((await stat(file)).size <= 32 * 1048576);
const bytes = await readFile(file);
assert.equal(bytes.length, prior.report.bytes); assert.equal(sha(bytes), prior.report.sha256);
const report = JSON.parse(bytes), peak = report.runs[0].nativePeaks.peak;
const neighbors = inspectRetainedPeakNeighbors(report.nativeMemory, peak);
assert.equal(neighbors.increase.adjacent, true);
assert.equal(neighbors.increase.treeDeltaPrivateBytes, 59551744);
assert.equal(neighbors.increase.processDeltas.filter(p => p.deltaPrivateBytes !== 0).length, 1);
const changed = neighbors.increase.processDeltas.find(p => p.deltaPrivateBytes !== 0);
assert.equal(changed.pid, 38208); assert.equal(changed.deltaPrivateBytes, 59551744);
assert.deepEqual(neighbors.increase.addedIdentities, []); assert.deepEqual(neighbors.increase.removedIdentities, []);
assert.equal(neighbors.laterDecrease.treeDeltaPrivateBytes, -53792768);
assert.equal(neighbors.laterDecrease.processDeltas.find(p => p.pid === 38208).deltaPrivateBytes, -53813248);
const pins = ["scripts/analyze-original-native-burst.mjs", "scripts/lib/native-memory-bursts.mjs"];
const evidence = { recordedAt: new Date().toISOString(), status: "retained-adjacent-renderer-burst-confirmed",
  report: prior.report, originalFailureEvidence: "evidence/mpeg2-static-ui-original-failure-2026-10-07.json",
  neighbors, rendererIdentity: prior.rendererAttribution.matchingLaterCimIdentity,
  treeIncreaseMiB: 59551744 / 1048576,
  allOtherEightProcessPrivateBytesUnchanged: true,
  knownOldDrainIntervalMs: 500, knownOldNativeAcquisitionIntervalMs: 100,
  next: "Use a bounded faster native-drain callback and measure dispatch/dump latency before another full-original diagnostic. This process delta is not a callsite or allocator attribution.",
  sourcePins: Object.fromEntries(await Promise.all(pins.map(async file => [file, sha(await readFile(path.join(root, file)))]))),
  browserConversionsStarted: 0, generatedMediaCopies: 0, originalRead: false,
  allocationSource: null, publicAcceptance: false, completeChromiumMemoryAcceptance: false };
const json = JSON.stringify(evidence, null, 2) + "\n";
assert.ok(Buffer.byteLength(json) < 32768);
const output = path.join(root, "evidence/original-renderer-burst-2026-10-07.json");
await writeFile(output, json, { flag: "wx" }); console.log(output);
