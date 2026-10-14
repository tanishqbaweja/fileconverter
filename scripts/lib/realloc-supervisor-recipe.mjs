// Same hidden/birth-qualified/no-restart bounded supervisor, new exact target.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export function makeReallocSupervisorRecipe(source,root) {
  assert.equal(sha(source),"c95abee71c947ebb995cea85405c48f9d3a2d06382feb712b28f98bb0e33bf0f");
  const edits=[
    ["packet-largest-idle-supervisor","realloc-supervisor",3],
    ["scripts/run-packet-largest-idle-original-full.mjs","scripts/run-realloc-original-full.mjs",2],
    ['const root = path.resolve(import.meta.dirname, ".."), own = "scripts/launch-realloc-supervisor.mjs";',
      `const root = ${JSON.stringify(root)}, own = "scripts/launch-realloc-supervisor.mjs";`,1],
  ];
  let generated=source;for(const [before,after,count] of edits){assert.equal(generated.split(before).length-1,count);generated=generated.replaceAll(before,after);}
  let reverse=generated;for(const [before,after,count] of edits.toReversed()){assert.equal(reverse.split(after).length-1,count);reverse=reverse.replaceAll(after,before);}
  assert.equal(reverse,source,"No changed launch/birth/heartbeat/no-restart/finally/headless behavior");
  generated=generated.replace(/from "(\.\/lib\/[^"\r\n]+)"/g,(_,name)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",name)).href)}`);
  return {generated,generatedSha256:sha(generated),parentSourceSha256:sha(source),edits,noAutomaticRestart:true,publicAcceptance:false};
}
