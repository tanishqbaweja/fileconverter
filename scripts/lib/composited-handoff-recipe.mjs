import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeStagedHandoffApp } from "./staged-worker-handoff-recipe.mjs";
import { makeProgressCompositingCandidate } from "./progress-compositing-recipe.mjs";
export { makeProgressCompositingCandidate };
export function makeCompositedHandoffApp(app) {
  const handoff = makeStagedHandoffApp(app);
  return exactPatch(app, [...handoff.edits,
    ['style={{ width: `${progress}%` }}', 'style={{ transform: `scaleX(${progress / 100})` }}']]);
}
export function makeCompositedHandoffBuilder(source, root) {
  const uri = file => pathToFileURL(path.join(root, file)).href;
  const relocated = source.replace(/from "(\.[^"\r\n]+)"/g, (_, file) => `from ${JSON.stringify(uri(path.join("scripts", file)))}`);
  const named = relocated.replaceAll("${stamp}-staged-worker-handoff", "${stamp}-composited-handoff");
  return exactPatch(source, [[source, named],
    ['const root = path.resolve(import.meta.dirname, ".."), stamp = process.argv[2];', `const root = ${JSON.stringify(root)}, stamp = process.argv[2];`],
    [`import { makeStagedHandoffApp, makeStagedHandoffWorker } from ${JSON.stringify(uri("scripts/lib/staged-worker-handoff-recipe.mjs"))};`,
      `import { makeStagedHandoffWorker } from ${JSON.stringify(uri("scripts/lib/staged-worker-handoff-recipe.mjs"))};\nimport { makeCompositedHandoffApp as makeStagedHandoffApp, makeProgressCompositingCandidate } from ${JSON.stringify(uri("scripts/lib/composited-handoff-recipe.mjs"))};`],
    ['const originals = new Map([[appFile, app], [workerFile, worker]]);',
      'const cssFile="app/globals.css", css=await readFile(path.join(root,cssFile),"utf8"), cssRecipe=makeProgressCompositingCandidate(app,css);\nconst originals = new Map([[appFile, app], [workerFile, worker], [cssFile,css]]);'],
    ['const files = [', 'overlays.set(path.join(root,cssFile).toLowerCase(),cssRecipe.css);\nconst files = ["scripts/build-composited-handoff.mjs","scripts/lib/composited-handoff-recipe.mjs","tests/composited-handoff.test.mjs",'],
    ['  const sources = Buffer.from(JSON.stringify({ sourcePins, preimages, appRecipe, workerRecipe }));',
      '  const stylesheet=await select(/^index-.*\\.css$/);\n  assert.ok(stylesheet.bytes.toString().includes("transition:transform .16s linear"));\n  const stylesheetProof={url:stylesheet.url,bytes:stylesheet.bytes.length,sha256:sha(stylesheet.bytes),archive:await archive("style.css",stylesheet.bytes)};\n  const sources = Buffer.from(JSON.stringify({ sourcePins, preimages, appRecipe, workerRecipe, cssRecipe }));'],
    ['    privateAppEdits: appRecipe.edits.length,', '    stylesheet:stylesheetProof, progressCompositingPreserved:true, privateAppEdits: appRecipe.edits.length,'],
  ]);
}
export function verifyCompositedBuild(build) {
  assert.equal(build.progressCompositingPreserved, true);
  assert.deepEqual(build.sourcePins, build.postSourcePins);
  assert.equal(build.normalSourcesEdited, false); assert.equal(build.nativeWasmChanged, false); assert.equal(build.copyLoopChanged, false);
  assert.equal(build.fixedCopyBufferBytes, 524288); assert.equal(build.assets.length, 3);
  // This is the exact prior full-test stylesheet, not a changed UI layout.
  assert.deepEqual({ url: build.stylesheet.url, bytes: build.stylesheet.bytes, sha256: build.stylesheet.sha256 },
    { url: "/assets/index-CxGQ2N3s.css", bytes: 26354, sha256: "3c4c62c528d98b5bd03492134f40bdca249e9c2896a5b607a63ca29ae46c34a6" });
}
