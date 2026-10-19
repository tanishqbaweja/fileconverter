// Existing captured-word validator, bound to the actual new static layout.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { loadLtoBrowserNative } from "./lto-browser-native.mjs";
const root=path.resolve(import.meta.dirname,"../.."),native=await loadLtoBrowserNative(root);
const source=await readFile(path.join(root,"scripts/lib/mvf-arena-full-failure.mjs"),"utf8");
const recipe=exactPatch(source,[
  ['const root = path.resolve(import.meta.dirname, "../..");',`const root = ${JSON.stringify(root)};`],
  ['import { MVF_DECODER_SHA256 } from "./mvf-arena-browser-components.mjs";',`const MVF_DECODER_SHA256=${JSON.stringify(native.proof.decoder.sha256)};`],
  ["evidence/mvf-arena-native-38643550000.json","evidence/lto-native-sources-39279724223.json"],
]);
const generated=recipe.generated.replace(/^(import[^\r\n]*?\bfrom )"(\.[^"\r\n]+)"/gm,
  (_,prefix,file)=>prefix+JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",file)).href));
const factory=await import("data:text/javascript;base64,"+Buffer.from(generated).toString("base64"));
assert.deepEqual(factory.ebmlFailureDerivation.currentNativeAddresses,native.proof.layout);
export const validateCompositeAllocationFailureRecord=factory.validateCompositeAllocationFailureRecord;
export const ltoFailureDerivation={...recipe,capturedWordGuardsChanged:false,currentNativeAddresses:native.proof.layout,
  actualRuntimeFatalRequalified:false,publicAcceptance:false};
