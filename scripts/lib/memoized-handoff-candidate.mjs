import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeCompositedHandoffApp, makeCompositedHandoffBuilder } from "./composited-handoff-recipe.mjs";
import { makeStableProgressUiSource } from "./stable-progress-ui-recipe.mjs";
import { deriveSaveHandoffCaller, deriveSaveHandoffDriver } from "./save-handoff-control.mjs";

export const OLD_HANDOFF_APP = { url: "/assets/ConverterApp-DPLBacSA.js", bytes: 321036,
  sha256: "e8c717f29d79831e8f706899ca47e6d456dee345432ec0c22c4f97489d056e99" };
export function makeMemoizedHandoffApp(app) {
  const stable = makeStableProgressUiSource(app), handoff = makeCompositedHandoffApp(app);
  const result = exactPatch(stable, handoff.edits);
  return { ...result, baselineSource: app, displayTreeMemoization: true,
    originalJsxAndControlsPreserved: true, progressSamplingChanged: false, codecSettingsChanged: false };
}
export function makeMemoizedHandoffBuilder(source, root) {
  const parent = makeCompositedHandoffBuilder(source, root), uri = file => pathToFileURL(path.join(root, file)).href;
  const result = exactPatch(parent.generated, [
    [`import { makeCompositedHandoffApp as makeStagedHandoffApp, makeProgressCompositingCandidate } from ${JSON.stringify(uri("scripts/lib/composited-handoff-recipe.mjs"))};`,
      `import { makeMemoizedHandoffApp as makeStagedHandoffApp } from ${JSON.stringify(uri("scripts/lib/memoized-handoff-candidate.mjs"))};\nimport { makeProgressCompositingCandidate } from ${JSON.stringify(uri("scripts/lib/composited-handoff-recipe.mjs"))};`],
    ['const files = [', 'const files = ["scripts/build-memoized-handoff.mjs","scripts/lib/memoized-handoff-candidate.mjs","scripts/lib/stable-progress-ui-recipe.mjs","tests/memoized-handoff-candidate.test.mjs",'],
    ['    stylesheet:stylesheetProof, progressCompositingPreserved:true,',
      '    displayTreeMemoization:true,progressSamplingChanged:false,stylesheet:stylesheetProof, progressCompositingPreserved:true,'],
  ]);
  return result.generated.replaceAll('${stamp}-composited-handoff', '${stamp}-memoized-handoff');
}
export function deriveMemoizedHandoffDriver(source, root, wrapper, candidateName, files) {
  const parent = deriveSaveHandoffDriver(source, root, wrapper, candidateName, files);
  const rootLine = `const root = ${JSON.stringify(root)}, MiB = 1024 ** 2;`;
  const load = `
const memoizedBuildPath=process.env.WITHIN_MEMO_HANDOFF_BUILD_PATH;
assert.match(memoizedBuildPath??"",/^evidence\\/\\d{4}-\\d\\d-\\d\\dT[\\d-]+Z-memoized-handoff-build\\.json$/);
const memoizedBuildBytes=await readFile(path.join(root,memoizedBuildPath));
assert.equal(createHash("sha256").update(memoizedBuildBytes).digest("hex"),process.env.WITHIN_MEMO_HANDOFF_BUILD_SHA);
const memoizedBuild=JSON.parse(memoizedBuildBytes);assert.equal(memoizedBuild.displayTreeMemoization,true);
assert.equal(memoizedBuild.nativeWasmChanged,false);assert.equal(memoizedBuild.codecParametersChanged,false);
assert.equal(memoizedBuild.progressSamplingChanged,false);
const memoizedApp=memoizedBuild.assets.find(row=>row.role==="application");
const memoizedAppBinding={url:memoizedApp.url,bytes:memoizedApp.bytes,sha256:memoizedApp.sha256};
`;
  const value = exactPatch(parent.generated, [[rootLine, rootLine + load]]).generated;
  const old = JSON.stringify(OLD_HANDOFF_APP);
  assert.equal(value.split(old).length, 3, "Exactly the observed app and handoff binding change; workers remain byte exact");
  return { generated: value.replaceAll(old, "memoizedAppBinding"), publicAcceptance: false, fullOriginalAcceptance: false };
}
export function deriveMemoizedHandoffCaller(source, root) {
  const parent = deriveSaveHandoffCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveSaveHandoffDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("save-handoff-control.mjs"))};`,
      `import {deriveMemoizedHandoffDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("memoized-handoff-candidate.mjs"))};`],
    ['  const ownFiles=[', '  const ownFiles=["scripts/diagnose-memoized-handoff.mjs","scripts/build-memoized-handoff.mjs","scripts/lib/memoized-handoff-candidate.mjs","tests/memoized-handoff-candidate.test.mjs",'],
    ['"scripts/build-composited-handoff.mjs",stamp,"--for-browser"', '"scripts/build-memoized-handoff.mjs",stamp,"--for-browser"'],
    ['const buildPath=`evidence/${stamp}-composited-handoff-build.json`', 'const buildPath=`evidence/${stamp}-memoized-handoff-build.json`'],
    ['assert.deepEqual(build.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})),qualified.build.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})));',
      'assert.equal(build.displayTreeMemoization,true);assert.equal(build.progressSamplingChanged,false);\n      const unchangedWorkers=rows=>rows.filter(row=>row.role!=="application").map(({role,url,bytes,sha256})=>({role,url,bytes,sha256}));assert.deepEqual(unchangedWorkers(build.assets),unchangedWorkers(qualified.build.assets));'],
    ['      const child=spawn(process.execPath,[path.join(wrapper.directory,"probe.mjs")]',
      '      environment.WITHIN_MEMO_HANDOFF_BUILD_PATH=buildPath;environment.WITHIN_MEMO_HANDOFF_BUILD_SHA=sha(buildBytes);\n      const child=spawn(process.execPath,[path.join(wrapper.directory,"probe.mjs")]'],
  ]);
  const generated = result.generated.replaceAll('${stamp}-save-handoff-control-', '${stamp}-memoized-handoff-control-')
    .replace('|save-handoff-control)-(?:live|terminal)', '|save-handoff-control|memoized-handoff-control)-(?:live|terminal)');
  return { generated, publicAcceptance: false, fullOriginalAcceptance: false };
}
