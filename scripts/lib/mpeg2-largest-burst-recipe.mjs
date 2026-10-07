// Explicit reversible derivative. Historical actual drivers remain unchanged.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeBurstAttributionDriver } from "./mpeg2-burst-attribution-recipe.mjs";
export function makeLargestBurstDriver(source, root, resolvePackage, helperUrl) {
  const prior = makeBurstAttributionDriver(source, root, resolvePackage);
  const uri = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  const patches = [
    [`import { startBoundedRendererAttribution } from ${uri("bounded-renderer-attribution")};`,
      `import { startBoundedRendererAttribution } from ${JSON.stringify(helperUrl)};\nimport { createIndependentBlinkSessions } from ${uri("independent-blink-sessions")};\nimport { observeOwnedProcessExit } from ${uri("owned-process-exit-observation")};\nlet completedReport, completedReportPath;\nexport { completedReport, completedReportPath };`],
    ['const sourceFiles = ["scripts/mpeg2-burst-attribution.mjs",',
      'const sourceFiles = ["scripts/mpeg2-largest-burst-attribution.mjs", "scripts/lib/mpeg2-largest-burst-recipe.mjs", "scripts/lib/largest-burst-prerequisites.mjs", "scripts/lib/independent-blink-sessions.mjs", "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/largest-blink-attribution-recipe.mjs", "scripts/lib/largest-blink-type-summary.mjs", "scripts/lib/bounded-detailed-blink-type-summary.mjs", "scripts/lib/complete-blink-heap-summary.mjs", "evidence/largest-blink-type-control-2026-10-07.json", "evidence/ui-largest-blink-types-2026-10-07.json", "scripts/mpeg2-burst-attribution.mjs",'],
    ['-private-mpeg2-burst-attribution-native-100ms', '-private-mpeg2-largest-burst-attribution-native-100ms'],
    ['"mpeg2-burst-attribution-runtime-"', '"mpeg2-largest-burst-runtime-"'],
    ['rendererAttribution = await startBoundedRendererAttribution(await browser.newBrowserCDPSession(), realms);',
      'rendererAttribution = createIndependentBlinkSessions({ createSession: () => browser.newBrowserCDPSession(), startAttribution: startBoundedRendererAttribution, realms });'],
    ['await rendererAttribution.dump("pre-conversion-attribution", first.processes); attributionDumpCount++;',
      'assert.equal((await rendererAttribution.dump("pre-conversion-attribution", first.processes)).success, true, "Complete independent pre-conversion detailed dump required"); attributionDumpCount++;'],
    ['if (rendererAttribution) rendererAttributionResult = await rendererAttribution.stop();',
      'if (rendererAttribution) { rendererAttributionResult = await rendererAttribution.stop();\n      assert.equal(rendererAttributionResult.status, "completed-diagnostic", "Every independently closed dump must be complete"); }'],
    ["const { stdout } = await exec(\"powershell.exe\", [\"-NoProfile\", \"-NonInteractive\", \"-Command\",\n        `@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${chrome.pid}').Count`]);\n      assert.equal(Number(stdout.trim()), 0, \"Owned Chrome root must actually be absent\");",
      'const identity = samples.flatMap(row => row.processes ?? []).find(row => row.pid === chrome.pid);\n      assert.ok(identity, "Actual owned root birth required for exit observation");\n      cleanup.chromeRootExitObservation = await observeOwnedProcessExit(identity);\n      assert.equal(cleanup.chromeRootExitObservation.status, "owned-identity-absent", "Actual owned Chrome birth must be absent");'],
    ['at most seven light dumps,70min deadline.', 'at most seven independently closed detailed largest64 dumps,70min deadline.'],
    ['  process.stdout.write(`${report.status}: ${reportBase}.json\\n`);',
      '  completedReport = report; completedReportPath = `${reportBase}.json`;\n  process.stdout.write(`${report.status}: ${reportBase}.json\\n`);'],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only independent detailed measurement/provenance/identity-exit changes");
  return result;
}
