import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const file = "output/playwright/2026-10-06T21-20-21-338Z-ui-native-allocation.json";
const raw = await readFile(path.join(root, file)), report = JSON.parse(raw);
assert.equal(report.status, "completed-diagnostic"); assert.equal(report.conversionsPerformed, 0);
assert.equal(report.publicAcceptance, false); assert.equal(report.completeChromiumMemoryAcceptance, false);
assert.equal(report.conversionSpeedAcceptance, false);
for (const value of Object.values(report.cleanup)) assert.equal(value, true);
assert.deepEqual(report.forbidden, []);
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
for (const [source, digest] of Object.entries(report.sourcePins))
  assert.equal(sha(await readFile(path.join(root, source))), digest, source);
const before = report.rows.find(row => row.phase === "native-sampling-start");
const after = report.rows.find(row => row.phase === "ui-selections-60");
assert.equal(before.dom.nodes, 6723); assert.equal(after.dom.nodes, 8343);
assert.equal(before.dom.jsEventListeners, 192); assert.equal(after.dom.jsEventListeners, 372);
assert.equal(before.dom.documents, 6); assert.equal(after.dom.documents, 6);
assert.equal(before.heap.embedderHeapUsedSize, 16635776); assert.equal(after.heap.embedderHeapUsedSize, 28386208);
assert.ok(report.rows.filter(row => row.jobState !== null).every(row => row.jobState === "idle"));
assert.ok(report.profiles.every(profile => profile.profile.samples.length >= 1 && profile.profile.samples.length <= 3));
assert.ok(report.profiles.every(profile => profile.profile.samples.every(sample => sample.stack.every(frame => /^0x[0-9a-f]+$/i.test(frame)))));
const proof = { ...report, report: { path: file, bytes: raw.length, sha256: sha(raw) },
  observedDeltas: { nodes: after.dom.nodes - before.dom.nodes,
    eventListeners: after.dom.jsEventListeners - before.dom.jsEventListeners,
    documents: after.dom.documents - before.dom.documents,
    pageEmbedderHeapBytes: after.heap.embedderHeapUsedSize - before.heap.embedderHeapUsedSize },
  nativeStackSymbolsResolved: false, originalConversionAllocationCauseProven: false,
  causalFixProven: false, forcedGcUsed: false, conversionOutputsCreated: 0,
  limitations: ["DOM counters include objects not yet collected; growth is not by itself a retained leak.",
    "The1-to3live native samples per phase have unresolved Windows addresses; they do not identify the Blink allocation object/call-site.",
    "Changing format controls is not conversion progress. This control does not prove the source of the prior original-conversion peak.",
    "No full-tree250MiB or conversion-speed certification. Only phase snapshots; no exact A/B timing or retained alternate-format identity."],
  next: "Capture DOM/JS allocation stacks during real conversion or benchmark isolated static-UI render reuse; do not retry unchanged original or apply an unproven codec/heap-quality fix.",
  sourcePins: { ...report.sourcePins, "scripts/freeze-ui-native-allocation.mjs": sha(await readFile(new URL(import.meta.url))) } };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 128 * 1024);
await writeFile(path.join(root, "evidence/ui-native-allocation-2026-10-06.json"), json, { flag: "wx" });
console.log("Frozen genuine idle UI control; native sampled stack addresses remain unresolved");
