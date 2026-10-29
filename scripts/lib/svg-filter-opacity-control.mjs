// Fixed-opacity diagnostic only. No native implementation, user-input rewrite or6M substitute.
import assert from "node:assert/strict";
import { svgFilterIntegrationVariants } from "./svg-filter-integration-variants.mjs";
import { makeSvgPrecisionIntegrationControl } from "./svg-filter-precision-qualification.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact opacity diagnostic anchor");return source.split(before).join(after);};
export function svgFilterOpacityVariants(bytes){
  svgFilterIntegrationVariants(bytes); // Full original byte-count/SHA validation.
  const source=bytes.toString(),start=source.indexOf('<feGaussianBlur '),end=source.indexOf('</filter>');
  assert.ok(start>0&&end>start);const original=source.slice(start,end);
  return [["flood-opacity-100","1"],["flood-opacity-065","0.65"],["flood-opacity-090","0.9"]].map(([name,opacity])=>{
    const body='<feFlood flood-color="#08121d" flood-opacity="'+opacity+'" result="constant"/>\n'+
      '<feComposite in="constant" in2="SourceAlpha" operator="in" result="shadow"/>\n'+
      '<feMerge><feMergeNode in="shadow"/></feMerge>\n';
    const text=source.slice(0,start)+body+source.slice(end);
    assert.equal(sha(text.replace(body,original)),sha(source));
    return {name,source:text,bytes:Buffer.byteLength(text),sha256:sha(text),changes:{floodCompositeOnly:true,opacity:Number(opacity),floodRgb:[8,18,29],blurAndOffsetRemoved:true}};
  });
}
export function makeSvgPrecisionOpacityControl(options){
  const base=makeSvgPrecisionIntegrationControl({...options,integrationDiagnostics:true});
  const old=svgFilterIntegrationVariants(options.componentSourceBytes),variants=svgFilterOpacityVariants(options.componentSourceBytes);
  let suite=replace(base.suite,'const variants='+JSON.stringify(old)+';','const variants='+JSON.stringify(variants)+';');
  suite=replace(suite,'svg-filter-integration-control','svg-filter-opacity-control',3);
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,'"--grep", "svg-filter-integration-control",','"--grep", "svg-filter-opacity-control",');
  driver=replace(driver,'const repeat = "svg-filter-integration-control";','const repeat = "svg-filter-opacity-control";');
  driver=replace(driver,'components:3,integrationDiagnostics:true};','components:3,integrationDiagnostics:true,opacityDiagnostics:true};');
  driver=replace(driver,'"Three small precision integration controls with bounded pixel evidence; same full worker/UI/direct IO, never6M acceptance"',
    '"Three fixed-opacity flood/composite diagnostics with bounded pixels and matching references; not original6M acceptance"');
  driver=replace(driver,'"scripts/lib/svg-filter-integration-variants.mjs"','"scripts/lib/svg-filter-integration-variants.mjs", "scripts/lib/svg-filter-opacity-control.mjs"');
  const fragmentStart=suite.lastIndexOf('test("svg-filter-opacity-control",');assert.ok(fragmentStart>0);
  return {...base,suite,driver,proof:{...base.proof,suiteSha256:sha(suite),driverSha256:sha(driver),
    controlTestSha256:sha(suite.slice(fragmentStart)),opacityDiagnostics:true,
    componentVariants:variants.map(({source,...pin})=>{void source;return pin;}),
    scope:"Fixed opacity1/0.65/0.9 conversion-order diagnostic only; native bytes/6M/quality/memory gates unchanged",publicPromotion:false}};
}
