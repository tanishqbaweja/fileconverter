// Live source identity is distinct from portable verification of archived preimages.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
test("all99 actual current MVF qualification source bytes still match the original executed seal",async()=>{
  const root=path.resolve(import.meta.dirname,".."),proof=JSON.parse(await readFile(path.join(root,"evidence/mvf-arena-native-38643550000.json")));
  for(const [file,expected]of Object.entries(proof.currentSourcePins))assert.equal(sha(await readFile(path.join(root,file))),expected,file);
});
