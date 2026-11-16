import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const read = name => readFile(new URL(`../${name}`, import.meta.url));
const sha = b => createHash("sha256").update(b).digest("hex");
test("actual four-minute NORMAL blank control identifies on-device-model role by SAME root/child births with NO converter or replacement acceptance baseline", async () => {
  const file = "evidence/2026-11-16T00-35-35-988Z-normal-blank-large-child.json", bytes = await read(file);
  assert.equal(sha(bytes), "659ca570f0972f222650af5382bb0c3ef6c5189a214c944793db74c295f8c32b");
  const r = JSON.parse(bytes); assert.equal(r.status, "completed-blank-role-diagnostic-not-conversion-acceptance");
  assert.equal(r.actualObservationMs, 240265); assert.equal(r.converterLoaded, false); assert.equal(r.inputsSelected, 0);
  assert.equal(r.conversionsPerformed, 0); assert.equal(r.featuresDisabled, false); assert.equal(r.baselineReplaced, false);
  assert.equal(r.publicAcceptance, false); assert.equal(r.memory.acceptanceMetric, false);
  assert.ok(r.launch.includes("--headless=new") && r.launch.includes("about:blank"));
  assert.ok(r.launch.every(flag => !flag.startsWith("--disable-")));
  const [role] = r.roles; assert.equal(r.roles.length, 1); assert.equal(role.error, null);
  assert.equal(role.nativeBirth.pid, 10876); assert.equal(role.nativeBirth.parentPid, r.identity.pid);
  assert.equal(role.nativeBirth.privateBytes, 246362112);
  assert.equal(role.result.status, "same-owned-root-and-child-birth-role-observed");
  assert.equal(role.result.type, "utility"); assert.equal(role.result.utilitySubtype, "on_device_model.mojom.OnDeviceModelService");
  assert.equal(role.result.sandboxType, "on_device_model_execution");
  const packed = await read(r.archive.file); assert.equal(sha(packed), r.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 32 * 1048576 }); assert.equal(sha(raw), r.archive.decodedSha256);
  const samples = JSON.parse(raw); assert.equal(samples.length, 2197);
  const valid = samples.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
  for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
  assert.deepEqual(peak, r.memory.peak);
  assert.equal((peak.privateBytes - r.earlyBlank.privateBytes) / 1048576, 238.39453125);
  assert.equal(r.memory.incrementalOverEarlyBlankMiB, 238.39453125);
  assert.ok(r.runtimeRemoved); assert.equal(r.browserCleanup.status, "owned-observed-pids-absent");
  assert.equal(r.browserCleanup.observedPids.length, 44); assert.deepEqual(r.failures, []);
  // The separate failed conversion child27200 remains unclassified. This
  // control does NOT retroactively identify a different process's role.
});
test("earlier low-memory refusal has no browser/sample evidence and separate exact-empty recovery is nonrecursive and preserves the original receipt", async () => {
  const bytes = await read("evidence/2026-11-16T00-33-21-046Z-normal-blank-large-child.json");
  assert.equal(sha(bytes), "3a001fb9d024e85e04112be053fc9860759cadd4c7f4a0a19e02f20d8c242ec9");
  const r = JSON.parse(bytes); assert.equal(r.hostPreflight.safeToStart, false);
  assert.equal(r.hostPreflight.freeVirtualBytes, 1511260160); assert.equal(r.identity, undefined); assert.equal(r.archive.records, 0);
  assert.equal(r.memory.peak, null); assert.equal(r.roles.length, 0);
  const recovery = JSON.parse(await read("evidence/2026-11-16-held-blank-empty-scratch-recovery.json"));
  assert.equal(recovery.priorSha256, sha(bytes)); assert.equal(recovery.emptyDirectoryRemoved, true);
  for (const field of ["recursiveDeletion", "processesKilled", "mediaFilesRemoved"]) assert.equal(recovery[field], false);
  assert.equal(recovery.priorReceiptUnchanged, true);
});
test("future budget-failure role capture quiesces production job BEFORE one reserved census and never changes original primary memory", async () => {
  const source = await read("scripts/qualify-mkv-direct-reuse.mjs"), text = source.toString();
  const start = text.indexOf("const diagnostic = result.budgetFailureRoleDiagnostic");
  const end = text.indexOf("if (retention && /250 MiB", start), branch = text.slice(start, end);
  assert.ok(branch.indexOf("await cancelBrowserConversionBeforeCleanup(page)") < branch.indexOf("await sampleChromiumTree(identity.pid)"));
  assert.match(branch, /maximumCensusQueries: 1, maximumMatchedChildren: 4/);
  assert.match(branch, /matchOwnedBurstRole\(identity, nativeBirth, tree\)/);
  assert.doesNotMatch(branch, /result\.blank\s*=|incrementalPrivateMiB\s*=|collectGarbage|--disable-/);
});
