import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeAiffId3DiagnosticRecipe, makeAiffId3DiagnosticLaunchRecipe } from "./aiff-id3-direct-diagnostic-recipe.mjs";
const sha = source => createHash("sha256").update(source).digest("hex");
function patchExactly(base, edits) {
  let generated = base;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2, after); reversed = reversed.replace(after, before); }
  assert.equal(reversed, base, "Native tracing changes only reversible instrumentation, never conversion/fidelity/250MiB/cleanup gates");
  return generated;
}
export function makeAiffId3NativeAttributionRecipe(source, root, directory) {
  const base = makeAiffId3DiagnosticRecipe(source, root, directory), eol = source.includes("\r\n") ? "\r\n" : "\n";
  const uri = pathToFileURL(path.join(root, "scripts/lib/aiff-id3-native-attribution.mjs")).href;
  const edits = [
    ['let diagnosticObserver = null;', `let diagnosticObserver = null;\nlet nativeAttribution = null;\nimport { startAiffNativeAttribution } from ${JSON.stringify(uri)};`],
    ['  nativeObserver.setPhase("loaded-navigation");',
      '  nativeAttribution = await startAiffNativeAttribution(browser, debugPort, serverUrl);\n  await nativeAttribution.dumpOnce("blank-idle", samples.at(-1)?.processes ?? null);\n  nativeObserver.setPhase("loaded-navigation");'],
    ['  for (let run = 1; run <= runCount; run += 1) {',
      '  await nativeAttribution.dumpOnce("loaded-idle", samples.at(-1)?.processes ?? null);\n  for (let run = 1; run <= runCount; run += 1) {'],
    ['    runSummaries.push({', '    await nativeAttribution.dumpOnce(`cleanup-${run}`, samples.at(-1)?.processes ?? null);\n    runSummaries.push({'],
    ['  let pageHeap = null;', '  if (/^conversion-[1-3]$/.test(phase)) await nativeAttribution?.dumpOnce(phase, processes);\n  let pageHeap = null;'],
    ['  process.off("SIGTERM", onSigterm);', '  process.off("SIGTERM", onSigterm);\n' +
      `  if (nativeAttribution) {\n    try {\n      const result = await nativeAttribution.stop();\n      await writeFile(${JSON.stringify(path.join(directory, "native-attribution.json"))}, JSON.stringify(result), { flag: "wx" });\n    } catch (error) {\n      console.error("Native attribution finalization failed: " + String(error).slice(0, 1024));\n      process.exitCode = 1;\n    }\n  }`],
  ].map(pair => pair.map(value => value.replaceAll("\n", eol)));
  const generated = patchExactly(base.generated, edits);
  return { ...base, generated, nativeEdits: edits, nativeBaseSha256: base.generatedSha256,
    generatedSha256: sha(generated), productionAcceptance: false };
}
export function makeAiffId3NativeAttributionLaunchRecipe(source, root) {
  const base = makeAiffId3DiagnosticLaunchRecipe(source, root);
  const uri = file => JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", file)).href);
  const edits = [
    [`import { makeAiffId3DiagnosticRecipe as makeAiffId3StressRecipe } from ${uri("aiff-id3-direct-diagnostic-recipe.mjs")};`,
      `import { makeAiffId3NativeAttributionRecipe as makeAiffId3StressRecipe } from ${uri("aiff-id3-native-attribution-recipe.mjs")};`],
    ['-${mode}-diagnostic.json`;', '-${mode}-native-attribution.json`;'],
    ['-${mode}-diagnostic-${label}.gz`;', '-${mode}-native-attribution-${label}.gz`;'],
    ['  "scripts/diagnose-aiff-id3-direct-stress.mjs",',
      '  "scripts/diagnose-aiff-id3-native-attribution.mjs", "scripts/lib/aiff-id3-native-attribution-recipe.mjs",\n' +
      '  "scripts/lib/aiff-id3-native-attribution.mjs", "scripts/lib/bounded-renderer-attribution.mjs",\n' +
      '  "scripts/lib/memory-infra-attribution.mjs",\n  "scripts/diagnose-aiff-id3-direct-stress.mjs",'],
    ['let diagnosticObserverEvidence = null;', 'let diagnosticObserverEvidence = null, nativeAttributionEvidence = null;'],
    ['    for (const name of reportIdentity ? await readdir(reportDirectory) : [])',
      '    try { nativeAttributionEvidence = await archive("native-attribution.json", await readFile(path.join(runtime.directory, "native-attribution.json"))); }\n' +
      '    catch (error) { if (error.code !== "ENOENT") throw error; }\n    for (const name of reportIdentity ? await readdir(reportDirectory) : [])'],
    ['  diagnosticOnly: true, diagnosticObserverEvidence,', '  diagnosticOnly: true, diagnosticObserverEvidence, nativeAttributionEvidence,'],
  ];
  const generated = patchExactly(base.generated, edits);
  return { ...base, generated, nativeEdits: edits, nativeBaseSha256: base.generatedSha256, generatedSha256: sha(generated) };
}
