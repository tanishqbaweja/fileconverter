import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const source = await readFile(new URL("../scripts/diagnose-navigation-worker-retention.mjs", import.meta.url), "utf8");
test("idle navigation diagnostic cannot become a converted-file, stable-baseline, peak-memory or cache-disabled acceptance test", () => {
  assert.match(source, /fileSelections: 0, conversions: 0, memoryAcceptance: false, baseline: null/);
  assert.match(source, /diagnosticPerturbsMemory: true/);
  assert.match(source, /index <= 3/); assert.match(source, /sameDocument && row.events.some/);
  assert.match(source, /event.type === "pageshow" && event.persisted/);
  assert.match(source, /snapshots: true/);
  assert.doesNotMatch(source, /--disable-|ignoreDefaultArgs|setInputFiles|showSaveFilePicker|collectGarbage|setWebLifecycleState|Memory\.forciblyPurgeJavaScriptMemory|incrementalPrivateMiB\s*=/);
});
test("idle diagnostic state, I/O and events are bounded and retain unavailable samples as null", () => {
  assert.match(source, /report.events.length >= 64/); assert.match(source, /state.events.length < 16/);
  assert.match(source, /targets.length <= 32/); assert.match(source, /forbidden.length >= 32/);
  assert.match(source, /let memory = null, unavailable = null/); assert.match(source, /memoryUnavailable: unavailable/);
  assert.match(source, /\.slice\(-16384\)/); assert.match(source, /serverDeadline = Date.now\(\) \+ 30000/);
});
test("navigation diagnostic owns only hidden launches, waits for birth-verified absence then cleans owned scratch and verifies original", () => {
  assert.match(source, /createOwnedRuntimeScratch\("navigation-worker-diagnostic-"\)/);
  assert.match(source, /windowsHide: true/); assert.match(source, /"--headless=new"/);
  assert.match(source, /assert.deepEqual\(await queryReliableProcessIdentity\(child.pid\), birth\)/);
  assert.match(source, /observeOwnedProcessExit\(birth\)/);
  assert.match(source, /owned-identity-absent/); assert.match(source, /await runtime\?\.close\(\)/);
  assert.match(source, /protectedOriginalAfter = await originalIdentity\(\)/);
  assert.match(source, /assertInstalledChromePinsEqual/);
});
test("first idle diagnostic stays failed, while exact events and target identities prove one retained idle worker rather than peak causality", async () => {
  const read = file => readFile(new URL("../" + file, import.meta.url)), sha = b => createHash("sha256").update(b).digest("hex");
  const proof = JSON.parse(await read("evidence/2026-10-28-idle-navigation-first-terminal.json")), bytes = await read(proof.raw.path);
  assert.equal(bytes.length, proof.raw.bytes); assert.equal(sha(bytes), proof.raw.sha256);
  const row = JSON.parse(bytes); assert.equal(row.status, "failed-idle-navigation-diagnostic"); assert.equal(row.phases.length, 3);
  assert.match(row.failures[0], /page.goBack: Timeout/);
  const initial = row.phases.find(phase => phase.phase === "app-initial-idle"), away = row.phases.find(phase => phase.phase === "away-1");
  assert.ok(row.events.some(event => event.documentId === initial.document.state.documentId && event.type === "pageshow" && event.persisted));
  const before = initial.targets.filter(target => target.type === "worker"), after = away.targets.filter(target => target.type === "worker");
  assert.equal(before.length, 1); assert.equal(after.length, 1); assert.equal(after[0].targetId, before[0].targetId);
  assert.equal(row.conversions, 0); assert.equal(row.memoryAcceptance, false); assert.equal(proof.fullConversionPeakAllocationCauseProven, false);
  const archive = JSON.parse(await read(proof.sourceArchive));
  for (const file of ["lib/staged-worker-coordinator.ts", "scripts/diagnose-navigation-worker-retention.mjs"]) {
    const entry = archive.files[file], source = gunzipSync(Buffer.from(entry.gzipBase64, "base64"), { maxOutputLength: 65536 });
    assert.equal(source.length, entry.bytes); assert.equal(sha(source), entry.sha256); assert.equal(entry.sha256, row.sourcePins[file]);
  }
  assert.equal(row.ownedRuntimeRemoved, true); assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent"));
  assert.deepEqual(row.protectedOriginalBefore, row.protectedOriginalAfter);
});
test("fixed real app retires all idle workers while away and creates fresh workers after both cached and fresh-document returns", async () => {
  const read = file => readFile(new URL("../" + file, import.meta.url)), sha = b => createHash("sha256").update(b).digest("hex");
  const proof = JSON.parse(await read("evidence/2026-10-28-idle-navigation-fixed-terminal.json")), bytes = await read(proof.raw.path);
  assert.equal(bytes.length, proof.raw.bytes); assert.equal(sha(bytes), proof.raw.sha256);
  const row = JSON.parse(bytes); assert.equal(row.status, proof.status); assert.deepEqual(row.failures, []); assert.equal(row.phases.length, 8);
  const workers = phase => phase.targets.filter(target => target.type === "worker");
  const away = row.phases.filter(phase => phase.phase.startsWith("away-"));
  const returned = row.phases.filter(phase => phase.phase.startsWith("returned-"));
  assert.deepEqual(away.map(phase => workers(phase).length), [0,0,0]); assert.deepEqual(returned.map(phase => workers(phase).length), [1,1,1]);
  const initial = row.phases.find(phase => phase.phase === "app-initial-idle");
  assert.equal(new Set([initial, ...returned].map(phase => workers(phase)[0].targetId)).size, 4);
  assert.equal(row.events.filter(event => event.type === "pageshow" && event.persisted).length, 2);
  assert.equal(row.browserServicesDisabled, false); assert.equal(row.bfcacheRestoreObserved, true); assert.equal(row.fullDomAndHarTracing, true);
  assert.equal(row.memoryAcceptance, false); assert.equal(row.conversions, 0); assert.equal(row.baseline, null);
  for (const [file, digest] of Object.entries(row.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  assert.equal(row.ownedRuntimeRemoved, true); assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent"));
  assert.deepEqual(row.protectedOriginalBefore, row.protectedOriginalAfter);
});
