import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = await read("evidence/2026-11-07T02-51-38-596Z-docx-html-qualification.json");
assert.equal(sha(bytes), "ecea1214979260e55527d2592daf71033ea1a9dd140543dc8e4cd17c8dced3ac");
const r = JSON.parse(bytes);

test("first outline large browser control remains failed despite four genuine independently valid outputs and sub250MiB primary", () => {
  assert.equal(r.status, "failed-not-acceptance"); assert.equal(r.cases.length, 4);
  for (const c of r.cases) {
    assert.equal(c.kind, "complete"); assert.equal(c.validated.allParagraphsComparedInOrder, true);
    assert.ok(c.outlineWarnings.includes("DOCX outline metadata read 257 style definitions from a referenced internal package part."));
  }
  const large = r.cases.at(-1);
  assert.equal(large.sourceBytes, 141871070); assert.equal(large.outputBytes, 139756049);
  assert.equal(large.validated.sha256, "b8ef8ba6178329962cc48943d18e3dd049b1b4b1e7423b821c766f457f8ea859");
  assert.equal(large.runMemory.cleanupDeltaFromLoadedMiB, 110.43359375); assert.equal(large.runMemory.cleanupRecoveryLimitMiB, 96);
  assert.ok(large.runMemory.cleanupDeltaFromLoadedMiB > 96); assert.equal(r.memory.incrementalPrivateMiB, 143.2890625);
  assert.equal(r.memory.limitMiB, 250); assert.match(r.failures.join("\n"), /Unchanged96MiB cleanup recovery gate/);
  assert.equal(r.outlineControl.fixtureBytes, 36933); assert.equal(r.outlineControl.generated.styleDefinitions, 166);
  assert.deepEqual(r.outlineControl.validatorControls.map(x => [x.name, x.exitCode]), [["positive", 0], ["wrong-heading", 1], ["wrong-text", 1], ["active-markup", 1], ["unclosed", 1]]);
  assert.deepEqual(r.outlineControl.cases, [], "Native fixture generation/validator preflights are not real browser heading conversions");
  assert.equal(r.outlineControlVerified, undefined); assert.equal(r.publicPromotion, false);
});

test("raw primary totals and post-failure absence reconciliation preserve unavailable roles and do not invent the cleanup exception or allocation cause", async () => {
  const packed = await read(r.nativeArchive.file), raw = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(sha(packed), r.nativeArchive.sha256); assert.equal(sha(raw), r.nativeArchive.decodedSha256);
  const samples = JSON.parse(raw).filter(s => Date.parse(s.timestamp) >= Date.parse(r.memory.windowStart) && Date.parse(s.timestamp) <= Date.parse(r.memory.windowEnd));
  assert.equal(samples.filter(s => s.privateBytes !== null).length, 521);
  for (const s of samples) if (s.privateBytes !== null) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  assert.equal(Math.max(...samples.filter(s => s.privateBytes !== null).map(s => s.privateBytes)), r.memory.peak.privateBytes);
  const analysis = JSON.parse(await read("evidence/2026-11-07-docx-outline-first-control-analysis.json"));
  assert.equal(analysis.sourceReceipt.sha256, sha(bytes)); assert.equal(analysis.failedCleanup.passed, false);
  assert.equal(analysis.nativeWordFixture.actualBrowserHeadingConversions, 0);
  const process = analysis.processEndpointDiagnosis.processes.find(p => p.pid === 23880);
  assert.equal(process.deltaPrivateBytes, 108466176); assert.equal(process.nativeRole, "unknown");
  assert.equal(analysis.ownedCleanupReconciliation.observedNativePidCount, 38);
  assert.deepEqual(analysis.ownedCleanupReconciliation.current, []); assert.equal(analysis.ownedCleanupReconciliation.noProcessesKilled, true);
  assert.equal(analysis.ownedCleanupReconciliation.originalBrowserCleanupErrorCauseUnknown, true);
  assert.equal(analysis.ownedCleanupReconciliation.ownedRuntimeDirectoryAbsent, true);
  assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter); assert.equal(r.protectedOriginalAfter.bytes, 2958573265);
  assert.equal(r.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
});
