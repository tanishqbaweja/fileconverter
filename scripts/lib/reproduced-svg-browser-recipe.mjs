// Exact adaptation of existing qualification sources, not a separate converter.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export const reproducedSvgBasePins = Object.freeze({
  "scripts/test-source-built-svg-candidate.mjs": "81c23573e917ad6ad534d48757e1265333281663429f54c6cc31d3c1a272583c",
  "tests/browser/image-conversions.spec.ts": "262ec202fde2f1029bc32a86a4b8d5c5afdb948255bae6b7366baa22d9a15f49",
});
const replaceExactly = (source, before, after, count = 1) => {
  assert.equal(source.split(before).length - 1, count, "Exact qualification source anchor: " + before);
  return source.split(before).join(after);
};
export function makeReproducedSvgBrowserQualification({ root, runtime, driverBytes, suiteBytes, lifecycleDiagnostic = false }) {
  assert.equal(typeof lifecycleDiagnostic, "boolean");
  assert.equal(root, path.resolve(import.meta.dirname, "../.."));
  assert.equal(path.dirname(runtime), path.join(root, "work"));
  assert.match(path.basename(runtime), /^svg-reproduced-qualification-[A-Za-z0-9]{6}$/);
  assert.equal(sha(driverBytes), reproducedSvgBasePins["scripts/test-source-built-svg-candidate.mjs"]);
  assert.equal(sha(suiteBytes), reproducedSvgBasePins["tests/browser/image-conversions.spec.ts"]);
  const driverPath = path.join(runtime, "driver.mjs"), suitePath = path.join(runtime, "image-conversions.spec.ts"), configPath = path.join(runtime, "playwright.config.mts");
  let suite = suiteBytes.toString();
  suite = replaceExactly(suite, 'const projectRoot = path.resolve(import.meta.dirname, "..", "..");', `const projectRoot = ${JSON.stringify(root)};`);
  suite = replaceExactly(suite, "images/resvg-source/processed-candidate-input.json", "images/resvg-source/repeated-processed-input.json");
  let driver = driverBytes.toString();
  driver = replaceExactly(driver, 'const root = path.resolve(import.meta.dirname, ".."),', `const root = ${JSON.stringify(root)},`);
  driver = replaceExactly(driver, "images/resvg-source/processed-candidate-input.json", "images/resvg-source/repeated-processed-input.json", 2);
  driver = replaceExactly(driver, 'assert.equal(receipt.status, "processed-private-source-candidate-not-rendering-or-browser-acceptance");',
    'assert.equal(receipt.status, "repeated-source-and-processed-private-candidate-byte-identical-before-browser-acceptance");\n' +
    '  assert.equal(receipt.twoSourceBuildReceiptsAndRawEqualityVerified, true);\n' +
    '  assert.equal(receipt.processedWasmAndGlueByteIdentical, true);');
  const generatedProof = `report.generatedQualification = { recipe: "scripts/lib/reproduced-svg-browser-recipe.mjs",\n` +
    `  driverSha256: sha(await readFile(import.meta.filename)), suiteSha256: ${JSON.stringify(sha(suite))},\n` +
    `  baseSourcePins: ${JSON.stringify(reproducedSvgBasePins)},\n` +
    '  assertionsChanged: false, thresholdsChanged: false, newCandidateBytes: true, publicPromotion: false };';
  driver = replaceExactly(driver, "report.candidatePin = pins;", "report.candidatePin = pins;\n" + generatedProof);
  driver = replaceExactly(driver, '"test", "tests/browser/image-conversions.spec.ts", "--grep",',
    `"test", "image-conversions.spec.ts", ${JSON.stringify("--config=" + configPath)}, "--grep",`);
  driver = driver.replace(/((?:from\s+|import\s*)["'])(\.\.?\/[^"']+)(["'])/g, (_all, start, name, end) => {
    const resolved = path.resolve(root, "scripts", name); assert.ok(resolved.startsWith(root + path.sep));
    return start + pathToFileURL(resolved).href + end;
  });
  if (lifecycleDiagnostic) {
    const observe = `report.lifecycleDiagnostic = { acceptanceMetric: false, perturbsMemory: true, events: [], overflow: false, observations: [] };\n` +
      `  await context.exposeBinding("__withinLifecycleObservation", (_source, event) => {\n` +
      `    if (report.lifecycleDiagnostic.events.length >= 128) { report.lifecycleDiagnostic.overflow = true; return; }\n` +
      `    report.lifecycleDiagnostic.events.push({ receivedAt: new Date().toISOString(), ...event });\n` +
      `  });\n` +
      `  await context.addInitScript(() => {\n` +
      `    for (const type of ["pagehide", "pageshow"]) addEventListener(type, event => {\n` +
      `      void globalThis.__withinLifecycleObservation({ type, persisted: event.persisted, href: location.href, timestamp: new Date().toISOString() }).catch(() => {});\n` +
      `    });\n` +
      `  });\n`;
    driver = replaceExactly(driver, "  realms = await connectPlaywrightRealmSampler(browser, origin);", observe + "  realms = await connectPlaywrightRealmSampler(browser, origin);");
    const inspect = `  report.memory.diagnosticPerturbed = true;\n` +
      `  const lifecyclePageSession = await context.newCDPSession(page), lifecycleBrowserSession = await browser.newBrowserCDPSession();\n` +
      `  try {\n` +
      `    for (const method of ["Memory.getDOMCounters", "Page.getNavigationHistory", "Page.getFrameTree"]) {\n` +
      `      try { report.lifecycleDiagnostic.observations.push({ method, result: await lifecyclePageSession.send(method) }); }\n` +
      `      catch (error) { report.lifecycleDiagnostic.observations.push({ method, result: null, unavailable: String(error).slice(0, 512) }); }\n` +
      `    }\n` +
      `    const result = await lifecycleBrowserSession.send("Target.getTargets");\n` +
      `    const targets = result.targetInfos.filter(target => target.url.startsWith(origin + "/")); assert.ok(targets.length <= 32);\n` +
      `    report.lifecycleDiagnostic.observations.push({ method: "Target.getTargets", result: targets });\n` +
      `  } finally { await lifecyclePageSession.detach(); await lifecycleBrowserSession.detach(); }\n`;
    driver = replaceExactly(driver, '  assert.equal(report.runnerSignal, null); assert.equal(report.runnerExitCode, 0, runnerLog);', inspect + '  assert.equal(report.runnerSignal, null); assert.equal(report.runnerExitCode, 0, runnerLog);');
    driver = replaceExactly(driver, '"passed-ten-private-small-svg-browser-cases-not-public-stress-acceptance";', '"completed-reproduced-svg-lifecycle-diagnostic-not-memory-acceptance";');
  }
  const config = `import original from ${JSON.stringify(pathToFileURL(path.join(root, "playwright.config.ts")).href)};\n` +
    `export default { ...original, testDir: ${JSON.stringify(runtime)}, testMatch: "**/image-conversions.spec.ts", outputDir: ${JSON.stringify(path.join(runtime, "artifacts"))} };\n`;
  return { driverPath, suitePath, configPath, driver, suite, config,
    proof: { baseSourcePins: reproducedSvgBasePins, driverSha256: sha(driver), suiteSha256: sha(suite), configSha256: sha(config),
      sameTenCasesAndAllAssertions: true, memoryFormulaAndThresholdUnchanged: true, lifecycleDiagnostic,
      normalBrowserServicesUnchanged: true, baseFilesModified: false,
      changes: ["absolute owned-generation paths/imports", "new exact pinned engine artifact", "new source-repeat receipt requirements", "generated provenance fields"] } };
}
