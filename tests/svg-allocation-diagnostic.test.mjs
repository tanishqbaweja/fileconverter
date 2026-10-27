import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
test("SVG allocation mode is explicit, bounded, non-accepting and keeps full-tree/quality/cleanup gates", async () => {
  const source = await read("scripts/test-source-built-svg-candidate.mjs");
  assert.match(source, /process.argv\[2\] === "--allocator-diagnostic"/);
  assert.match(source, /process.argv.length === 2 \|\| \(process.argv.length === 3 && allocationDiagnostic\)/);
  assert.match(source, /diagnosticPerturbsMemory: allocationDiagnostic/); assert.match(source, /memoryAcceptance: false/);
  assert.match(source, /report.allocatorCaptures.length < 3/); assert.match(source, /}, 12000\)/);
  for (const phase of ["blank-after-baseline", "scheduled-late-suite", "post-suite"])
    assert.ok(source.includes(`captureAllocators("${phase}")`));
  assert.doesNotMatch(source, /during:|collectGarbage|forceGC|--disable-/);
  assert.match(source, /connectPlaywrightRealmSampler\(browser, origin\)/);
  assert.match(source, /runnerStillLiveAtRequest: Boolean\(runner && runner.exitCode === null\)/);
  assert.match(source, /startTime: value.startTime/);
  assert.ok(source.indexOf('observer.setPhase("post-suite-diagnostic")') > source.indexOf("report.memory.incrementalPrivateMiB ="));
  assert.match(source, /assert.ok\(report.memory.incrementalPrivateMiB <= 250/);
  assert.match(source, /completed-private-svg-allocation-diagnostic-not-memory-acceptance/);
  assert.match(source, /clearTimeout\(allocatorTimer\); await pending; await allocatorPending/);
  assert.match(source, /stats.expected, 10/); assert.match(source, /stats.skipped, 0/);
});
test("allocator traces use the existing exact-byte bounded helper and never replace the protected browser conversion pipeline", async () => {
  const source = await read("scripts/test-source-built-svg-candidate.mjs");
  assert.match(source, /captureLiveMemoryInfra\(\{ session: await browser.newBrowserCDPSession\(\)/);
  assert.match(source, /sampleChromiumTree\(chrome.pid\)/);
  assert.match(source, /path.join\(root, "output\/playwright",/);
  assert.match(source, /requireExplicitWasmMaximum\(report.wasmMemory, pins.experimentalMaximumBytes\)/);
  assert.match(source, /"tests\/browser\/image-conversions.spec.ts", "--grep", "svg-to-png\|SVG"/);
  assert.match(source, /protectedOriginalAfter = await originalIdentity\(\)/);
  assert.match(source, /observeOwnedProcessExit\(identity\)/); assert.match(source, /await runtime\?\.close\(\)/);
});
