import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeAiffId3StressRecipe } from "./aiff-id3-stress-recipe.mjs";

export function makeAiffId3DiagnosticRecipe(source, root, directory) {
  const base = makeAiffId3StressRecipe(source, root, directory), eol = source.includes("\r\n") ? "\r\n" : "\n";
  const observer = pathToFileURL(path.join(root, "scripts/lib/aiff-id3-direct-diagnostic-observer.mjs")).href;
  const edits = [
    ['const sourceHashes = {};', `const sourceHashes = {};\nlet diagnosticObserver = null;\nimport { createAiffDirectDiagnosticObserver } from ${JSON.stringify(observer)};`],
    ['      "--headless=new",', '      "--headless=new",\n      "--enable-logging=stderr",'],
    ['      env: runtimeScratch.env,\n      stdio: "ignore",\n      windowsHide: true,',
      '      env: runtimeScratch.env,\n      stdio: ["ignore", "ignore", "pipe"],\n      windowsHide: true,'],
    ['  await recordLaunch(chromeProcess.pid, "headless-chrome");',
      '  await recordLaunch(chromeProcess.pid, "headless-chrome");\n  diagnosticObserver = createAiffDirectDiagnosticObserver(chromeProcess.stderr);'],
    ['  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);',
      '  await diagnosticObserver.connect(debugPort, serverUrl);\n  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);'],
    ['async function takeSample(rootPid, page, phase) {\n  nativeObserver?.setPhase(phase);',
      'async function takeSample(rootPid, page, phase) {\n  nativeObserver?.setPhase(phase);\n  const diagnosticSample = diagnosticObserver?.sample(phase);'],
    ['    realms: { pageUsedJSHeapBytes: pageHeap, workers: workerHeaps },',
      '    realms: { pageUsedJSHeapBytes: pageHeap, workers: workerHeaps },\n    diagnosticHeaps: await diagnosticSample,'],
    ['  process.off("SIGTERM", onSigterm);', '  process.off("SIGTERM", onSigterm);\n' +
      `  if (diagnosticObserver) await writeFile(${JSON.stringify(path.join(directory, "diagnostic-observer.json"))}, JSON.stringify(diagnosticObserver.close()), { flag: "wx" });`],
  ].map(([before, after]) => [before.replaceAll("\n", eol), after.replaceAll("\n", eol)]);
  let generated = base.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2, after); reversed = reversed.replace(after, before); }
  assert.equal(reversed, base.generated, "Every actual conversion/250MiB/fidelity/cleanup gate remains byte-exact");
  return { ...base, generated, diagnosticEdits: edits, diagnosticOnly: true,
    diagnosticBaseSha256: base.generatedSha256, generatedSha256: createHash("sha256").update(generated).digest("hex") };
}

export const AIFF_STRESS_LAUNCH_SHA = "1d1729ca34208bbc772ede5c537f30a6d97cbc4fa7a05943fa274b12bb85fd9d";
export function makeAiffId3DiagnosticLaunchRecipe(source, root) {
  assert.equal(createHash("sha256").update(source).digest("hex"), AIFF_STRESS_LAUNCH_SHA);
  const uri = name => JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", name)).href);
  const edits = [
    ['import { makeAiffId3StressRecipe } from "./lib/aiff-id3-stress-recipe.mjs";',
      `import { makeAiffId3DiagnosticRecipe as makeAiffId3StressRecipe } from ${uri("aiff-id3-direct-diagnostic-recipe.mjs")};`],
    ['const root = path.resolve(import.meta.dirname, ".."), mode = process.argv[2];', `const root = ${JSON.stringify(root)}, mode = process.argv[2];`],
    ['assert.equal(process.argv.length, 3); assert.ok(["sync-opfs", "direct-handle"].includes(mode));',
      'assert.equal(process.argv.length, 3); assert.equal(mode, "direct-handle");'],
    ['-${mode}-stress.json`;', '-${mode}-diagnostic.json`;'],
    ['-${mode}-${label}.gz`;', '-${mode}-diagnostic-${label}.gz`;'],
    ['  "public/engines/remux/build-manifest.json",',
      '  "scripts/diagnose-aiff-id3-direct-stress.mjs", "scripts/lib/aiff-id3-direct-diagnostic-recipe.mjs",\n' +
      '  "scripts/lib/aiff-id3-direct-diagnostic-observer.mjs", "scripts/lib/cdp-realm-memory.mjs",\n  "public/engines/remux/build-manifest.json",'],
    ['let host = null,', 'let diagnosticObserverEvidence = null;\nlet host = null,'],
    ['    for (const name of reportIdentity ? await readdir(reportDirectory) : [])',
      '    try { diagnosticObserverEvidence = await archive("observer.json", await readFile(path.join(runtime.directory, "diagnostic-observer.json"))); }\n' +
      '    catch (error) { if (error.code !== "ENOENT") throw error; }\n    for (const name of reportIdentity ? await readdir(reportDirectory) : [])'],
    ['"passed-three-private-aiff-stress-repeats-and-cancellation"', '"diagnostic-gates-passed-not-production-acceptance"'],
    ['  publicAcceptance: false,', '  diagnosticOnly: true, diagnosticObserverEvidence,\n  publicAcceptance: false,'],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2, after); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source, "Fixture/source/core/host/disk/staging/three repeats/cleanup stays exact");
  generated = generated.replace(/^(import[^\n]+from) "\.\/lib\/([^"\n]+)";/gm, (_, prefix, file) => `${prefix} ${uri(file)};`);
  return { generated, edits, baseSha256: AIFF_STRESS_LAUNCH_SHA,
    generatedSha256: createHash("sha256").update(generated).digest("hex") };
}
