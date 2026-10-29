// Fixed synthetic diagnostics; never rewrites a user SVG or replaces original6M acceptance.
import assert from "node:assert/strict";
import { svgFilterPrecisionVariants } from "./svg-filter-precision-variants.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export function svgFilterIntegrationVariants(bytes){
  const [identity]=svgFilterPrecisionVariants(bytes),source=bytes.toString();
  const before='<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>';
  const after='<feMerge><feMergeNode in="shadow"/></feMerge>';
  assert.equal(source.split(before).length-1,1);
  const shadow=source.replace(before,after);
  assert.equal(sha(shadow.replace(after,before)),sha(source));
  return [{...identity,name:"identity-default"},
    {name:"effects-default",source,bytes:bytes.length,sha256:sha(bytes),changes:{originalSourceUnchanged:true}},
    {name:"shadow-only",source:shadow,bytes:Buffer.byteLength(shadow),sha256:sha(shadow),changes:{finalMergeSourceGraphicRemoved:1}}];
}
