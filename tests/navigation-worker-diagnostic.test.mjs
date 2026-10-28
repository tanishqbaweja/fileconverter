import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
