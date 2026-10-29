// Synthetic diagnostic inputs only. Never rewrite a user's SVG or accepted stress fixture.
import assert from "node:assert/strict";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export function svgFilterPrecisionVariants(bytes){
  assert.equal(bytes.length,11194);
  assert.equal(sha(bytes),"afebfa848cd052fcd656cfdda7605c6c191edf845087759ca3421cf44880981d");
  const source=bytes.toString(),begin=source.indexOf('<feGaussianBlur '),end=source.indexOf('</filter>');
  assert.ok(begin>0&&end>begin);assert.equal(source.split('</filter>').length-1,1);
  const primitives=source.slice(begin,end),identity='<feMerge><feMergeNode in="SourceGraphic"/></feMerge>\n';
  assert.equal((primitives.match(/<fe[A-Z]/g)??[]).length,7);
  const identityDefault=source.slice(0,begin)+identity+source.slice(end);
  assert.equal(sha(identityDefault.replace(identity,primitives)),sha(source));
  const srgb=text=>{
    const anchor='<filter id="bounded-shadow"',changed='<filter color-interpolation-filters="sRGB" id="bounded-shadow"';
    assert.equal(text.split(anchor).length-1,1);const result=text.replace(anchor,changed);
    assert.equal(sha(result.replace(changed,anchor)),sha(text));return result;
  };
  return [["identity-default",identityDefault,{identityMergeOnly:true,colorInterpolationFilters:"default"}],
    ["identity-srgb",srgb(identityDefault),{identityMergeOnly:true,colorInterpolationFilters:"sRGB"}],
    ["effects-srgb",srgb(source),{originalEffectsChain:true,colorInterpolationFilters:"sRGB"}]]
    .map(([name,text,changes])=>({name,source:text,bytes:Buffer.byteLength(text),sha256:sha(text),changes}));
}
