// Original live-workspace checks separated from portable archived-evidence checks.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
for(const [kind,file]of [["quality","evidence/2026-10-11T07-11-32-834Z-encoder-plane-quality-diagnostic.json"],
  ["recovery","evidence/2026-10-11T07-51-01-110Z-encoder-plane-recovery-diagnostic.json"]]) {
  test(`${kind} original live-workspace source identity (not implied by portable historical evidence)`,async()=>{
    const proof=JSON.parse(await read(file));
    for(const [source,expected]of Object.entries(proof.sourcePins))assert.equal(sha(await read(source)),expected,source);
    if(kind==="recovery")for(const directory of [proof.cleanup.ownedWrapper,proof.cleanup.helpers.runtime]) {
      assert.equal(path.dirname(directory),path.join(root,"work"));
      await assert.rejects(access(directory),{code:"ENOENT"});
    }
  });
}
