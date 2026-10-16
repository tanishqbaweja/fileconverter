import assert from "node:assert/strict";
import path from "node:path";
import { validateInstalledChromePin } from "./installed-chrome-pin.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";

// Re-run the exact sealed four-case browser suite, changing browser identity and
// unique owned paths only. No conversion, validation, or recovery gate edits.
export function deriveUpdatedChromeMedia(parent, root, directory, stamp, pin) {
  validateInstalledChromePin(pin);
  assert.equal(path.dirname(directory), path.join(root,"work"));
  const name=path.basename(directory); assert.match(name,/^packet-cache-media-[A-Za-z0-9]+$/);
  assert.match(stamp,/^\d{4}-\d\d-\d\dT[\d-]+Z$/);
  const oldStamp="2026-10-15T17-20-01-310Z", oldName="packet-cache-media-YrwUfr";
  assert.equal(parent.candidateName,oldName);
  const generated={}, changes={};
  for(const key of ["stage","spec","config","driver"]) {
    const source=parent[key]; assert.ok(typeof source==="string"&&source.includes(oldName));
    let next=source.replaceAll(oldName,name).replaceAll(oldStamp,stamp);
    if(key==="spec") {
      const before='expect(actualBrowserVersion).toBe("155.0.8059.40");';
      const after=`expect(actualBrowserVersion).toBe(${JSON.stringify(pin.version)});`;
      assert.equal(next.split(before).length,2);next=next.replace(before,after);
      assert.equal(next.replace(after,before).replaceAll(name,oldName).replaceAll(stamp,oldStamp),source);
    }else assert.equal(next.replaceAll(name,oldName).replaceAll(stamp,oldStamp),source);
    generated[key]=next;changes[key]={parentSha256:sha(source),sha256:sha(next)};
  }
  assert.ok(generated.config.includes('"headless":true'));
  assert.ok(generated.config.includes('"retries":0'));
  assert.ok(generated.driver.includes('windowsHide: true'));
  generated.candidateName=name;
  generated.handoffLifecycle={...parent.handoffLifecycle,
    buildProofPath:`evidence/${stamp}-composited-handoff-build.json`};
  return {generated,changes,browserPin:pin,onlyBrowserIdentityAndOwnedPathsChanged:true,
    conversionAndValidationGatesChanged:false,publicAcceptance:false,completeChromiumMemoryAcceptance:false};
}
