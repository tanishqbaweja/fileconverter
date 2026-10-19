// Changed candidate, unchanged six content validations and adverse recovery.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { deriveJspiBrowserDriver,deriveJspiBrowserCaller } from "./jspi-browser-control.mjs";
import { loadLtoBrowserNative } from "./lto-browser-native.mjs";
import { loadLtoBrowserAdapter } from "./lto-browser-adapter.mjs";
const ownFiles=["scripts/lib/lto-browser-native.mjs","scripts/lib/lto-browser-adapter.mjs","scripts/lib/lto-browser-control.mjs",
  "scripts/lib/lto-full-failure.mjs","scripts/qualify-lto-browser.mjs","scripts/retain-lto-native-sources.mjs",
  "tests/lto-browser-control.test.mjs","tests/lto-native-evidence.test.mjs","scripts/inspect-lto-adapter-bindings.mjs",
  "scripts/inspect-lto-browser-preparation.mjs"];
export async function deriveLtoBrowserDriver(...args){
  const parent=await deriveJspiBrowserDriver(...args),root=args[1],uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const adapter=await loadLtoBrowserAdapter(root),oldHash=sha(adapter.original),nextHash=sha(adapter.recipe.generated);
  const oldBytes=Buffer.byteLength(adapter.original),nextBytes=Buffer.byteLength(adapter.recipe.generated);
  const scope=parent.generated.match(/scope: "Six fully independently validated[^\r\n]+/)[0];
  return{...exactPatch(parent.generated,[
    [`import { verifyJspiBrowserCandidate as verifyAttemptPlaneCandidate } from ${JSON.stringify(uri("jspi-browser-native.mjs"))};`,
      `import { verifyLtoBrowserCandidate as verifyAttemptPlaneCandidate } from ${JSON.stringify(uri("lto-browser-native.mjs"))};`],
    [uri("jspi-full-failure.mjs"),uri("lto-full-failure.mjs")],
    [`assert.equal((await stat(file)).size,${oldBytes});`,`assert.equal((await stat(file)).size,${nextBytes});`],
    [`assert.equal(await shaFile(file),${JSON.stringify(oldHash)},`,`assert.equal(await shaFile(file),${JSON.stringify(nextHash)},`],
    [`bytes:${oldBytes},sha256:${JSON.stringify(oldHash)}`,`bytes:${nextBytes},sha256:${JSON.stringify(nextHash)}`],
    ['"six-small-jspi-outputs-and-adverse-recovery-not-full-acceptance"','"six-small-lto-outputs-and-adverse-recovery-not-full-acceptance"'],
    ['"failed-jspi-browser-qualification"','"failed-lto-browser-qualification"'],
    [scope,'scope: "Six fully independently validated production-browser outputs and three same-page adverse recoveries using decoder-library LTO, exact qualified plane encoder, rebound actual native slots/functions, unchanged validators/quality/AVIO/UI/lower blank/all-process250MiB. No full original/scaling/paired speed/public acceptance.",'],
  ]),adapterRecipe:adapter.recipe,allContentAndAdverseValidationGatesUnchanged:true,publicAcceptance:false,fullOriginalAcceptance:false};
}
export async function deriveLtoBrowserCaller(source,root){
  const parent=await deriveJspiBrowserCaller(source,root),uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const native=await loadLtoBrowserNative(root),files=[...new Set([...ownFiles,...Object.keys(native.build.manifest.sources),
    native.envelope.path,native.proof.proof.path,native.proof.branch.path,...native.proof.layers.map(row=>row.archive.path)])];
  const named=parent.generated.replaceAll('${stamp}-jspi-control-','${stamp}-lto-control-')
    .replace('|jspi-control|paint-boundary-control','|jspi-control|lto-control|paint-boundary-control');
  return exactPatch(named,[
    [`import {copyJspiBrowserCandidate as copyUpdatedChromeCandidate} from ${JSON.stringify(uri("jspi-browser-native.mjs"))};`,
      `import {copyLtoBrowserCandidate as copyUpdatedChromeCandidate} from ${JSON.stringify(uri("lto-browser-native.mjs"))};`],
    [`import {deriveJspiBrowserStager as deriveUpdatedChromeFullStager} from ${JSON.stringify(uri("jspi-browser-adapter.mjs"))};`,
      `import {deriveLtoBrowserStager as deriveUpdatedChromeFullStager} from ${JSON.stringify(uri("lto-browser-adapter.mjs"))};`],
    [`import {deriveJspiBrowserDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("jspi-browser-control.mjs"))};`,
      `import {deriveLtoBrowserDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("lto-browser-control.mjs"))};`],
    ['  const ownFiles=[',`  const ownFiles=[${files.map(file=>JSON.stringify(file)).join(",")},`],
    ['assert.equal(row.status,"six-small-jspi-outputs-and-adverse-recovery-not-full-acceptance");',
      'assert.equal(row.status,"six-small-lto-outputs-and-adverse-recovery-not-full-acceptance");'],
    ['"jspi-small-output-controls-finished-pending-audit-not-acceptance"','"lto-small-output-controls-finished-pending-audit-not-acceptance"'],
    ['requestedStartupControls:3,requestedCompletedConversions:0,requestedRuns:3,',
      'requestedStartupControls:0,requestedCompletedConversions:0,requestedSmallCompletedConversions:6,requestedRuns:0,'],
  ]);
}
