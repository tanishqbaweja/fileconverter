import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {gunzipSync} from "node:zlib";
import {deriveUpdatedChromeMedia} from "../scripts/lib/updated-chrome-media.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const proof=JSON.parse(await read("evidence/2026-10-15T17-20-01-310Z-composited-handoff-media.json"));
const parent=JSON.parse(gunzipSync(await read(proof.generatedArchive.path),{maxOutputLength:8388608})).generated;
const pin=JSON.parse(await read("evidence/2026-10-16T16-36-10-030Z-threaded-validation-reboot-recovery.json")).browserNow;
const stamp="2026-10-16T17-00-00-000Z",directory=path.join(root,"work/packet-cache-media-testABC");
test("actual sealed suite changes only unique paths and new runtime version",()=>{
  const result=deriveUpdatedChromeMedia(parent,root,directory,stamp,pin);
  assert.equal(result.onlyBrowserIdentityAndOwnedPathsChanged,true);
  assert.equal(result.conversionAndValidationGatesChanged,false);
  assert.ok(result.generated.spec.includes('expect(actualBrowserVersion).toBe("155.0.8059.80")'));
  for(const key of ["stage","spec","config","driver"])assert.ok(!result.generated[key].includes(parent.candidateName));
  assert.ok(result.generated.config.includes('"retries":0'));
  assert.ok(result.generated.spec.includes("expect(state.metrics?.peakWasmMemoryBytes).toBe(expectedMemoryBytes)"));
  assert.ok(result.generated.spec.includes("expect(state.metrics?.wasmMemoryBytes).toBe(0)"));
  assert.equal(result.publicAcceptance,false);
});
test("reject arbitrary cleanup targets and changed browser assertion preimages",()=>{
  for(const target of [root,path.join(root,"work"),path.join(root,"other/packet-cache-media-abc"),path.join(root,"work/other-abc")])
    assert.throws(()=>deriveUpdatedChromeMedia(parent,root,target,stamp,pin));
  const changed={...parent,spec:parent.spec.replace('expect(actualBrowserVersion).toBe("155.0.8059.40");',"")};
  assert.throws(()=>deriveUpdatedChromeMedia(changed,root,directory,stamp,pin));
});
