// Explicit control OR media mode; no automatic conversion retry/downgrade.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeInstalledChromeControlCaller,makeInstalledChromeMediaCallerFromJournaled } from "./lib/installed-chrome-realloc-recipe.mjs";
const args=process.argv.slice(2);assert.ok((args.length===1&&args[0]==="--control")||(args.length===2&&args[0]==="--media"));
const root=path.resolve(import.meta.dirname,".."),runtime=await createOwnedRuntimeScratch("installed-chrome-realloc-");
try {
  let recipe;
  if(args[0]==="--control")recipe=makeInstalledChromeControlCaller(await readFile(path.join(root,"scripts/check-realloc-abort-control.mjs"),"utf8"),root);
  else {
    assert.match(args[1],/^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-installed-chrome-realloc-control-executed-sources\.json$/);
    process.env.WITHIN_INSTALLED_CHROME_CONTROL_RECEIPT=args[1];
    const {makeJournaledReallocMediaCaller}=await import("./lib/journaled-realloc-media-recipe.mjs");
    recipe=makeInstalledChromeMediaCallerFromJournaled(makeJournaledReallocMediaCaller(await readFile(path.join(root,"scripts/validate-mpeg2-encoder-plane-goldens.mjs"),"utf8"),root),root);
  }
  // Keep the old caller's exact no-arguments acceptance gate, after consuming
  // this wrapper's explicit mode/qualified-witness selection.
  process.argv.splice(2);
  const file=path.join(runtime.directory,"caller.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);
}finally{await runtime.close();}
