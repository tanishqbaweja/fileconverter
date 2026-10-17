import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeCompositedHandoffApp, makeCompositedHandoffBuilder } from "./composited-handoff-recipe.mjs";
import { makeStagedHandoffWorker } from "./staged-worker-handoff-recipe.mjs";
import { deriveSaveHandoffCaller, deriveSaveHandoffDriver } from "./save-handoff-control.mjs";
const files = ["lib/compiled-codec-cache.ts", "scripts/build-compiled-cache.mjs", "scripts/diagnose-compiled-cache.mjs",
  "scripts/lib/compiled-cache-candidate.mjs", "tests/compiled-codec-cache.test.mjs", "tests/compiled-cache-candidate.test.mjs"];
const oldApp = { url: "/assets/ConverterApp-DPLBacSA.js", bytes: 321036, sha256: "e8c717f29d79831e8f706899ca47e6d456dee345432ec0c22c4f97489d056e99" };
const oldCodec = { url: "/assets/conversion.worker-D_waeFU2.js", bytes: 292839, sha256: "d4dd7158c753b733bfcf2f531958d0ded981c09fae4b3fceba6583496e3e409b" };
export function makeCompiledCacheApp(app) {
  const parent = makeCompositedHandoffApp(app);
  const result = exactPatch(parent.generated, [
    ['"use client";', '"use client";\nimport { bindCompiledCodecCache } from "../../lib/compiled-codec-cache";'],
    ['() => new Worker(new URL("../../workers/conversion.worker.ts", import.meta.url), { name: "within-conversion" })',
      '() => bindCompiledCodecCache(new Worker(new URL("../../workers/conversion.worker.ts", import.meta.url), { name: "within-conversion" }))'],
  ]);
  return { ...result, parentEdits: parent.edits, maximumCompiledCodecModules: 2, userDataCached: false };
}
export function makeCompiledCacheWorker(worker) {
  const parent = makeStagedHandoffWorker(worker);
  const result = exactPatch(parent.generated, [
    ['/// <reference lib="webworker" />', '/// <reference lib="webworker" />\nimport { installCompiledCodecCache } from "../lib/compiled-codec-cache";'],
    ['const workerScope: DedicatedWorkerGlobalScope = self as never;',
      'const workerScope: DedicatedWorkerGlobalScope = self as never;\ninstallCompiledCodecCache(workerScope);'],
  ]);
  return { ...result, parentEdits: parent.edits, originalCodecSettingsChanged: false, maximumCompiledCodecModules: 2 };
}
export function makeCompiledCacheBuilder(source, root) {
  const parent = makeCompositedHandoffBuilder(source, root), uri = file => pathToFileURL(path.join(root, file)).href;
  const result = exactPatch(parent.generated, [
    [`import { makeStagedHandoffWorker } from ${JSON.stringify(uri("scripts/lib/staged-worker-handoff-recipe.mjs"))};`,
      `import { makeCompiledCacheWorker as makeStagedHandoffWorker } from ${JSON.stringify(uri("scripts/lib/compiled-cache-candidate.mjs"))};`],
    [`import { makeCompositedHandoffApp as makeStagedHandoffApp, makeProgressCompositingCandidate } from ${JSON.stringify(uri("scripts/lib/composited-handoff-recipe.mjs"))};`,
      `import { makeCompiledCacheApp as makeStagedHandoffApp } from ${JSON.stringify(uri("scripts/lib/compiled-cache-candidate.mjs"))};\nimport { makeProgressCompositingCandidate } from ${JSON.stringify(uri("scripts/lib/composited-handoff-recipe.mjs"))};`],
    ['const files = [', `const files = [${files.map(JSON.stringify).join(",")},`],
    ['    stylesheet:stylesheetProof, progressCompositingPreserved:true,',
      '    compiledModuleReuse:true,maximumCompiledCodecModules:2,userDataCached:false,instancesShared:false,wasmMemoriesSharedAcrossJobs:false,progressSamplingChanged:false,stylesheet:stylesheetProof, progressCompositingPreserved:true,'],
    ['  const assets = [];', '  assert.ok(main.bytes.toString().includes("compiled-codec-modules"));assert.ok(codec.bytes.toString().includes("prime-compiled-codec-modules"));\n  const assets = [];'],
  ]);
  return result.generated.replaceAll('${stamp}-composited-handoff', '${stamp}-compiled-cache');
}
export function deriveCompiledCacheDriver(source, root, wrapper, candidateName, extensionFiles) {
  const parent = deriveSaveHandoffDriver(source, root, wrapper, candidateName, extensionFiles);
  const marker = `const root = ${JSON.stringify(root)}, MiB = 1024 ** 2;`;
  const load = `
const compiledCacheBuildPath=process.env.WITHIN_COMPILED_CACHE_BUILD_PATH;
assert.match(compiledCacheBuildPath??"",/^evidence\\/\\d{4}-\\d\\d-\\d\\dT[\\d-]+Z-compiled-cache-build\\.json$/);
const compiledCacheBuildBytes=await readFile(path.join(root,compiledCacheBuildPath));
assert.equal(createHash("sha256").update(compiledCacheBuildBytes).digest("hex"),process.env.WITHIN_COMPILED_CACHE_BUILD_SHA);
const compiledCacheBuild=JSON.parse(compiledCacheBuildBytes);
assert.equal(compiledCacheBuild.compiledModuleReuse,true);assert.equal(compiledCacheBuild.maximumCompiledCodecModules,2);
for(const key of ["nativeWasmChanged","codecParametersChanged","userDataCached","instancesShared","wasmMemoriesSharedAcrossJobs","progressSamplingChanged"])assert.equal(compiledCacheBuild[key],false,key);
const cacheBinding=role=>{const row=compiledCacheBuild.assets.find(asset=>asset.role===role);return {url:row.url,bytes:row.bytes,sha256:row.sha256};};
const cachedAppBinding=cacheBinding("application"),cachedCodecBinding=cacheBinding("codec-worker");
`;
  const observe = `  progressProbe.compiledCacheEvents=[];
  page.on("console",message=>{const text=message.text(),prefix="WITHIN_COMPILED_CODE_CACHE ";if(!text.startsWith(prefix))return;
    assert.ok(text.length<=512&&progressProbe.compiledCacheEvents.length<64);progressProbe.compiledCacheEvents.push({...JSON.parse(text.slice(prefix.length)),observedAt:Date.now()});});
`;
  let generated = exactPatch(parent.generated, [[marker, marker + load], ['  await page.goto("about:blank");', observe + '  await page.goto("about:blank");'],
    ['  assert.deepEqual(forbiddenRequests, []);',
      '  assert.equal(progressProbe.compiledCacheEvents.filter(row=>row.event==="compiled").length,2);assert.equal(progressProbe.compiledCacheEvents.filter(row=>row.event==="reused").length,6);\n  assert.deepEqual(forbiddenRequests, []);'],
  ]).generated;
  assert.equal(generated.split(JSON.stringify(oldApp)).length, 3); assert.equal(generated.split(JSON.stringify(oldCodec)).length, 2);
  generated = generated.replaceAll(JSON.stringify(oldApp), "cachedAppBinding").replace(JSON.stringify(oldCodec), "cachedCodecBinding");
  return { generated, publicAcceptance: false, fullOriginalAcceptance: false };
}
export function deriveCompiledCacheCaller(source, root) {
  const parent = deriveSaveHandoffCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveSaveHandoffDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("save-handoff-control.mjs"))};`,
      `import {deriveCompiledCacheDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("compiled-cache-candidate.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
    ['"scripts/build-composited-handoff.mjs",stamp,"--for-browser"', '"scripts/build-compiled-cache.mjs",stamp,"--for-browser"'],
    ['const buildPath=`evidence/${stamp}-composited-handoff-build.json`', 'const buildPath=`evidence/${stamp}-compiled-cache-build.json`'],
    ['assert.deepEqual(build.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})),qualified.build.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})));',
      'assert.equal(build.compiledModuleReuse,true);assert.equal(build.maximumCompiledCodecModules,2);\n      const saver=rows=>rows.filter(row=>row.role==="save-worker").map(({role,url,bytes,sha256})=>({role,url,bytes,sha256}));assert.deepEqual(saver(build.assets),saver(qualified.build.assets));'],
    ['      const child=spawn(process.execPath,[path.join(wrapper.directory,"probe.mjs")]',
      '      environment.WITHIN_COMPILED_CACHE_BUILD_PATH=buildPath;environment.WITHIN_COMPILED_CACHE_BUILD_SHA=sha(buildBytes);\n      const child=spawn(process.execPath,[path.join(wrapper.directory,"probe.mjs")]'],
  ]);
  return { generated: result.generated.replaceAll('${stamp}-save-handoff-control-', '${stamp}-compiled-cache-control-')
    .replace('|save-handoff-control)-(?:live|terminal)', '|save-handoff-control|compiled-cache-control|memoized-handoff-control)-(?:live|terminal)'),
  publicAcceptance: false, fullOriginalAcceptance: false };
}
