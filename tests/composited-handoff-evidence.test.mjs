import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { verifyCompositedBuild } from "../scripts/lib/composited-handoff-recipe.mjs";
const root=path.resolve(import.meta.dirname,"..");
test("composited gate rejects changed previous stylesheet and fixed copy limit",async()=>{
  // Actual previous full-test binding; this is a negative schema test, not new browser evidence.
  const proof=JSON.parse(await readFile(path.join(root,"evidence/2026-10-15T11-18-16-969Z-duration-drain-original-full-terminal.json")));
  const raw=JSON.parse(gunzipSync(await readFile(path.join(root,proof.candidate.compressedReport.path))));
  const {url,bytes,sha256}=raw.progressProbe.expectedStylesheet;
  const build={progressCompositingPreserved:true,sourcePins:{},postSourcePins:{},normalSourcesEdited:false,nativeWasmChanged:false,
    copyLoopChanged:false,fixedCopyBufferBytes:524288,assets:[{},{},{}],stylesheet:{url,bytes,sha256}};
  verifyCompositedBuild(build);
  assert.throws(()=>verifyCompositedBuild({...build,stylesheet:{...build.stylesheet,bytes:bytes+1}}));
  assert.throws(()=>verifyCompositedBuild({...build,fixedCopyBufferBytes:1048576}));
});
