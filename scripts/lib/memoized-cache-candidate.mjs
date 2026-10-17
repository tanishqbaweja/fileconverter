// Distinct combined candidate. The rejected CSS containment is NOT included.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeCompiledCacheApp, makeCompiledCacheBuilder } from "./compiled-cache-candidate.mjs";
import { makeStableProgressUiSource } from "./stable-progress-ui-recipe.mjs";
import { deriveWarmCacheDriver, deriveWarmCacheCaller } from "./warm-cache-qualification.mjs";
const files = ["scripts/lib/memoized-cache-candidate.mjs", "scripts/build-memoized-cache.mjs", "scripts/qualify-memoized-cache.mjs",
  "tests/memoized-cache-candidate.test.mjs", "tests/stable-progress-ui.test.mjs", "tests/stable-progress-ui-render.test.mjs"];
export function makeMemoizedCacheApp(app) {
  const stable = makeStableProgressUiSource(app), cache = makeCompiledCacheApp(app);
  const result = exactPatch(stable, [...cache.parentEdits, ...cache.edits]);
  return { ...result, displayTreeMemoization: true, compiledModuleReuse: true,
    maximumCompiledCodecModules: 2, userDataCached: false, originalJsxAndControlsPreserved: true,
    progressSamplingChanged: false, codecSettingsChanged: false };
}
export function makeMemoizedCacheBuilder(source, root) {
  const parent = makeCompiledCacheBuilder(source, root), uri = file => pathToFileURL(path.join(root, file)).href;
  return exactPatch(parent, [
    [`import { makeCompiledCacheApp as makeStagedHandoffApp } from ${JSON.stringify(uri("scripts/lib/compiled-cache-candidate.mjs"))};`,
      `import { makeMemoizedCacheApp as makeStagedHandoffApp } from ${JSON.stringify(uri("scripts/lib/memoized-cache-candidate.mjs"))};`],
    ['const files = [', `const files = [${files.map(JSON.stringify).join(",")},`],
    ['    compiledModuleReuse:true,maximumCompiledCodecModules:2,', '    displayTreeMemoization:true,originalJsxAndControlsPreserved:true,compiledModuleReuse:true,maximumCompiledCodecModules:2,'],
    ['  const assets = [];', '  assert.equal(sha(codec.bytes),"4f2ef88023d984d79d2eb04bdaa8628fc48b71b927369c0c2b8f864b28ab49ab","Compiled-cache worker remains exact");\n  const assets = [];'],
  ]).generated;
}
export function deriveMemoizedCacheDriver(...args) {
  const parent = deriveWarmCacheDriver(...args);
  return exactPatch(parent.generated, [
    ['assert.equal(compiledCacheBuild.compiledModuleReuse,true);assert.equal(compiledCacheBuild.maximumCompiledCodecModules,2);',
      'assert.equal(compiledCacheBuild.compiledModuleReuse,true);assert.equal(compiledCacheBuild.maximumCompiledCodecModules,2);\nassert.equal(compiledCacheBuild.displayTreeMemoization,true);assert.equal(compiledCacheBuild.originalJsxAndControlsPreserved,true);'],
  ]);
}
export function deriveMemoizedCacheCaller(source, root) {
  const parent = deriveWarmCacheCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveWarmCacheDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("warm-cache-qualification.mjs"))};`,
      `import {deriveMemoizedCacheDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("memoized-cache-candidate.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
    ['"scripts/build-compiled-cache.mjs",stamp,"--for-browser"', '"scripts/build-memoized-cache.mjs",stamp,"--for-browser"'],
    ['assert.equal(build.compiledModuleReuse,true);assert.equal(build.maximumCompiledCodecModules,2);',
      'assert.equal(build.compiledModuleReuse,true);assert.equal(build.maximumCompiledCodecModules,2);assert.equal(build.displayTreeMemoization,true);assert.equal(build.originalJsxAndControlsPreserved,true);'],
  ]);
  return { generated: result.generated.replaceAll('${stamp}-warm-cache-control-', '${stamp}-memoized-cache-control-')
    .replace('|warm-cache-control|memoized-handoff-control)', '|warm-cache-control|memoized-cache-control|paint-boundary-control|lifecycle-warm-control|memoized-handoff-control)'),
    publicAcceptance: false, fullOriginalAcceptance: false };
}
