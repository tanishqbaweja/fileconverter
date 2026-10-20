import { readPreCatalogueUi } from "./helpers/historical-published-ui.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { makeCompositedHandoffApp, makeCompositedHandoffBuilder, makeProgressCompositingCandidate } from "../scripts/lib/composited-handoff-recipe.mjs";
import { makeCompositedMediaCaller, COMPOSITED_MEDIA_FILES } from "../scripts/lib/composited-handoff-media.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file),"utf8");
test("Historical combined private app keeps exact prior progress patch and only qualified lifecycle changes",async()=>{
  const app=await readPreCatalogueUi("app/converter/ConverterApp.tsx"),css=await readPreCatalogueUi("app/globals.css");
  const combined=makeCompositedHandoffApp(app), progress=makeProgressCompositingCandidate(app,css);
  assert.ok(combined.generated.includes(progress.appPatch[1]));
  assert.ok(combined.generated.includes("createStagedWorkerCoordinator"));
  let reversed=combined.generated;for(const [before,after]of combined.edits.toReversed())reversed=reversed.replace(after,before);
  assert.equal(reversed,app);assert.equal(combined.edits.length,4);
});
test("Historical generated builder and four-case caller keep ownership, source caps and finally restoration",async()=>{
  const builder=makeCompositedHandoffBuilder(await read("scripts/build-staged-handoff-candidate.mjs"),root);
  const caller=makeCompositedMediaCaller(await read("scripts/qualify-ebml-reuse-media.mjs"),root);
  for(const source of [builder.generated,caller.generated]) {
    const check=spawnSync(process.execPath,["--check","--input-type=module"],{input:source,encoding:"utf8",windowsHide:true,timeout:5000});
    assert.equal(check.status,0,check.stderr);
  }
  for(const file of COMPOSITED_MEDIA_FILES){await read(file);assert.ok(caller.generated.includes(JSON.stringify(file)));}
  for(const token of ["supplemental.length<=128","raw.length<=2097152","legacyFiles.length,255"])assert.ok(caller.generated.includes(token));
  assert.ok(builder.generated.includes("worker: { plugins: () => [overlayPlugin()] }"));
  assert.ok(builder.generated.includes("await builder.buildApp()"));assert.ok(builder.generated.includes("if (started && !forBrowser)"));
  assert.ok(builder.generated.includes("cssRecipe.css"));
});
