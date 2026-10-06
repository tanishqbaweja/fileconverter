// One changed diagnostic of the full original, not an acceptance retry. Preserve
// historical executed drivers and every source/quality/full-tree/cleanup gate.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeStaticUiOriginalDriver } from "./mpeg2-static-ui-original-recipe.mjs";
export function makeBurstAttributionDriver(source, root, resolvePackage) {
  const original = makeStaticUiOriginalDriver(source, root, resolvePackage);
  const uri = name => pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href;
  const patches = [
    ["const diagnosticOnly = false;", "const diagnosticOnly = true;"],
    ["let startupSettlement = null;", `import { startBurstMemoryObserver } from ${JSON.stringify(uri("burst-memory-observer"))};
import { startBoundedRendererAttribution } from ${JSON.stringify(uri("bounded-renderer-attribution"))};
let rendererAttribution = null, rendererAttributionResult = null, nativeBurstResult = null;
let attributionDumpCount = 0, skippedBurstDumps = 0, attributionClosing = false;
let startupSettlement = null;`],
    ['const sourceFiles = ["scripts/mpeg2-static-ui-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-burst-attribution.mjs", "scripts/lib/mpeg2-burst-attribution-recipe.mjs", "scripts/lib/burst-memory-observer.mjs", "scripts/lib/native-memory-bursts.mjs", "scripts/lib/bounded-renderer-attribution.mjs", "scripts/lib/memory-infra-attribution.mjs", "evidence/native-burst-control-passed-2026-10-07.json", "evidence/original-renderer-burst-2026-10-07.json", "scripts/mpeg2-static-ui-original-memory.mjs",'],
    ["-private-mpeg2-static-ui-original-native-100ms", "-private-mpeg2-burst-attribution-native-100ms"],
    ['"mpeg2-static-ui-original-runtime-"', '"mpeg2-burst-attribution-runtime-"'],
    ["observer = await startParallelMemoryObserver(chrome.pid, runtime.directory);", `observer = await startBurstMemoryObserver(chrome.pid, runtime.directory, {
    minimumIncreaseBytes: 32 * MiB,
    onBurst: async event => {
      if (!rendererAttribution || attributionClosing || attributionDumpCount >= 7) {
        skippedBurstDumps++;
        return { skipped: true, reason: "attribution unavailable, closing or fixed dump budget exhausted" };
      }
      attributionDumpCount++;
      return rendererAttribution.dump("native-burst-" + event.after.sequence, event.after.processes);
    },
  });`],
    ["await page.locator('[data-testid=\"convert-button\"]').click();", `// Instrumentation setup is pre-conversion, still INCLUDED in the same peak
    // selection below; establish an actual conversion-phase row before click.
    observer.setPhase("pre-conversion-" + number);
    rendererAttribution = await startBoundedRendererAttribution(await browser.newBrowserCDPSession(), realms);
    await rendererAttribution.dump("pre-conversion-attribution", first.processes); attributionDumpCount++;
    await observer.through(Date.now());
    const conversionPhaseAt = observer.setPhase("conversion-" + number);
    await observer.through(conversionPhaseAt);
    await page.locator('[data-testid="convert-button"]').click();`],
    ["const deadline = Date.now() + 6 * 60 * 60_000;", "const deadline = Date.now() + 70 * 60_000;"],
    ["assert.ok(run.incrementalPrivateMiB <= 250,", `assert.equal(skippedBurstDumps, 0, "Diagnostic dump budget exhausted; no silent attribution gap");
      assert.equal(observer.burstReport().eventsDiscarded, 0, "Native burst retention exhausted; no unchanged retry");
      assert.ok(observer.burstReport().callbacks.every(row => !["failed", "skipped-busy-no-queue"].includes(row.status)),
        "Diagnostic callback unavailable or busy; record failure rather than queue requests");
      assert.ok(run.incrementalPrivateMiB <= 250,`],
    ["cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page);", `// Keep the native sampler live during dump/trace finalization. This remains
    // conversion-phase memory, never excluded from the complete tree peak.
    attributionClosing = true;
    if (rendererAttribution) rendererAttributionResult = await rendererAttribution.stop();
  });
  await attempt(async () => {
    cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page);`],
    ["finally { nativeMemory = observer.report(); }", "finally { nativeMemory = observer.report(); nativeBurstResult = observer.burstReport(); }"],
    ["nativeMemory, failure, logs, forbiddenRequests,", "nativeMemory, nativeBurstResult, rendererAttributionResult, skippedBurstDumps, failure, logs, forbiddenRequests,"],
    ["Full protected original after measured static405card UI reuse, unchanged codec/settings/Chrome/allprocesses250MiB/formula/three runs/fidelity/cleanup, fixed five-minute startup settling/no larger denominator. No native OS-picker or conversion-speed-A/B certification",
      "ONE full-source changed native-burst attribution diagnostic:100ms native drains,32MiB adjacent trigger,at most seven light dumps,70min deadline. Same static UI/codecs/settings/fixed heaps/quality/prospective lower blank/full250MiB tree formula/cancel/finally. Instrumentation perturbs memory/time, no public/fidelity/speed/acceptance certification."],
  ];
  let generated = original;
  for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of patches) { assert.equal(reversed.split(after).length, 2, after); reversed = reversed.replace(after, before); }
  assert.equal(reversed, original, "Only explicit diagnostic changes, no codec/baseline/source/quality changes");
  return generated;
}
