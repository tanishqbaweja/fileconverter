// Small, source-controlled ablations only. Never substitutes for original6M acceptance.
import assert from "node:assert/strict";
import { makeSvgSmallFidelityControl } from "./svg-small-fidelity-control.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
import { svgFilterPrecisionVariants } from "./svg-filter-precision-variants.mjs";
import { svgFilterIntegrationVariants } from "./svg-filter-integration-variants.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact component diagnostic anchor: "+before.slice(0,100));return source.split(before).join(after);};
export function svgComponentVariants(bytes){
  assert.equal(bytes.length,11194);
  assert.equal(sha(bytes),"afebfa848cd052fcd656cfdda7605c6c191edf845087759ca3421cf44880981d");
  const source=bytes.toString(),opening='<g mask="url(#bounded-mask)"><g filter="url(#bounded-shadow)">';
  const noFilter=replace(source,'<g filter="url(#bounded-shadow)">','<g>');
  assert.equal(replace(noFilter,'<g mask="url(#bounded-mask)"><g>',opening),source);
  const start=source.indexOf(opening),end=source.indexOf('</g></g>',start)+8;
  assert.ok(start>0&&end>start);assert.equal(source.split(opening).length-1,1);
  assert.equal(source.split('</g></g>').length-1,1);
  const removed=source.slice(start,end),background=source.slice(0,start)+source.slice(end);
  assert.equal(background.slice(0,start)+removed+background.slice(start),source);
  let changed=0;
  const square=noFilter.replace(/(<rect\b[^>]*?) rx="10"/g,(_all,prefix)=>{changed++;return prefix;});
  assert.equal(changed,144,"Every tile, and no ellipse or definition, loses its rectangle corner radius");
  const squareRestored=square.replace(/(<rect x="\d+" y="\d+" width="5[678]" height="5[678]")/g,'$1 rx="10"');
  assert.equal(sha(squareRestored),sha(noFilter));
  return [["no-filter",noFilter,{filterUseRemoved:1}],
    ["background-only",background,{geometryGroupRemoved:1}],
    ["no-filter-square",square,{filterUseRemoved:1,roundedRectangleRadiiRemoved:144}]]
    .map(([name,text,changes])=>({name,source:text,bytes:Buffer.byteLength(text),sha256:sha(text),changes}));
}
export function assertSvgComponentControlNotCompleted(ledger,{nativeWasmSha256,variants,filterPrecision=false,integrationDiagnostics=false}){
  assert.match(nativeWasmSha256,/^[a-f0-9]{64}$/);assert.equal(variants.length,3);
  const pins=variants.map(({name,sha256})=>{assert.match(sha256,/^[a-f0-9]{64}$/);return {name,sha256};});
  assert.equal(typeof filterPrecision,"boolean");
  assert.equal(typeof integrationDiagnostics,"boolean");assert.ok(!(filterPrecision&&integrationDiagnostics));
  const done=integrationDiagnostics?ledger.completedPrecisionIntegrationControl:filterPrecision?ledger.completedFilterPrecisionControl:ledger.completedComponentControl;
  assert.ok(!(done?.nativeWasmSha256===nativeWasmSha256&&JSON.stringify(done?.variants)===JSON.stringify(pins)),
    "This exact component control is already complete; inspect "+done?.evidence+" instead of replaying it.");
}
export function makeSvgComponentFidelityControl(options){
  const base=makeSvgSmallFidelityControl(options),body=options.controlTestBytes.toString();
  assert.ok(!(options.filterPrecision&&options.integrationDiagnostics));
  const variants=(options.integrationDiagnostics?svgFilterIntegrationVariants:options.filterPrecision?svgFilterPrecisionVariants:svgComponentVariants)(options.componentSourceBytes);
  let fragment=replace(body,'test("paired-svg-fidelity-control",','test("svg-component-fidelity-control",');
  fragment=replace(fragment,'const sourcePath = path.join(projectRoot,"fixtures/images/test-pattern-effects.svg");','const originalSourcePath = path.join(projectRoot,"fixtures/images/test-pattern-effects.svg");');
  fragment=replace(fragment,'const sourceBytes = await readFile(sourcePath);','const originalBytes = await readFile(originalSourcePath);');
  fragment=replace(fragment,'sourceBytes.length','originalBytes.length');
  fragment=replace(fragment,'update(sourceBytes)','update(originalBytes)');
  fragment=replace(fragment,'  const referencePath=path.join(privateSvg.runtime,"small-fresh-reference.png");','  const variants='+JSON.stringify(variants)+';');
  fragment=replace(fragment,'mode:string;rgbaSha256:string;','component:string;sourcePin:unknown;referencePin:unknown;mode:string;rgbaSha256:string;');
  fragment=replace(fragment,'    const equal=results.length===2&&results[0].rgbaSha256===results[1].rgbaSha256;','');
  fragment=replace(fragment,'referencePin,results,exactFullVsStripRgbaEqual:equal,','results,componentsCollected:results.length,');
  fragment=replace(fragment,'independentlyValidatedEffects:equal&&results.every','independentlyValidatedEffects:results.length===3&&results.every');
  fragment=replace(fragment,'small-full-vs-strip-control','svg-component-fidelity-control',2);
  fragment=replace(fragment,'  try{\n    await page.goto',
    '  try{\n    for(const component of variants){\n      const sourcePath=path.join(privateSvg.runtime,component.name+".svg"),referencePath=path.join(privateSvg.runtime,component.name+"-reference.png");\n      const sourceBytes=Buffer.from(component.source);\n      expect(sourceBytes.length).toBe(component.bytes);expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(component.sha256);\n      await writeFile(sourcePath,sourceBytes,{flag:"wx"});\n      try{\n    await page.goto');
  fragment=replace(fragment,'for(const mode of ["full","strip"])','for(const mode of ["full"])');
  fragment=replace(fragment,'"small-"+mode+".png"','component.name+".png"');
  fragment=replace(fragment,'["test-pattern-effects.png"]','[component.name+".png"]');
  fragment=replace(fragment,'await transfer("test-pattern-effects.png")','await transfer(component.name+".png")');
  fragment=replace(fragment,'results.push({mode,rgbaSha256,','results.push({component:component.name,sourcePin:{bytes:component.bytes,sha256:component.sha256,changes:component.changes},referencePin,mode,rgbaSha256,');
  fragment=replace(fragment,'await page.evaluate(async()=>{const root=await navigator.storage.getDirectory();await root.removeEntry("test-pattern-effects.png").catch(()=>{});})',
    'await page.evaluate(async name=>{const root=await navigator.storage.getDirectory();await root.removeEntry(name).catch(()=>{});},component.name+".png")');
  fragment=replace(fragment,'    await save();expect(results.length).toBe(2);expect(results[0].rgbaSha256).toBe(results[1].rgbaSha256);',
    '      }finally{if(validationSink){validationSink.destroy();validationSink=null;}await rm(referencePath,{force:true});await rm(sourcePath,{force:true});}\n    }\n    await save();expect(results.length).toBe(3);');
  fragment=replace(fragment,'}finally{await save();if(validationSink){validationSink.destroy();validationSink=null;}await rm(referencePath,{force:true});}',
    '}finally{await save();if(validationSink){validationSink.destroy();validationSink=null;}}');
  if(options.filterPrecision||options.integrationDiagnostics){
    fragment=replace(fragment,'metrics:unknown}[]','metrics:unknown;pixelSamples?:unknown}[]');
    fragment=replace(fragment,'        const rgbaSha256=createHash("sha256").update(decoded.stdout).digest("hex");',
      '        const rgbaSha256=createHash("sha256").update(decoded.stdout).digest("hex");\n'+
      '        const referenceDecoded=await execFileAsync("ffmpeg",["-v","error","-threads","1","-i",referencePath,"-pix_fmt","rgba","-f","rawvideo","-"],{cwd:projectRoot,windowsHide:true,maxBuffer:960*540*4+65536,encoding:"buffer"});\n'+
      '        expect(referenceDecoded.stdout.length).toBe(960*540*4);\n'+
      '        const quantizedRoundTrip=(value:number)=>{const srgb=value/255,linear=srgb<=0.04045?srgb/12.92:((srgb+0.055)/1.055)**2.4;const rounded=Math.round(linear*255)/255;return Math.round(255*(rounded<=0.0031308?rounded*12.92:1.055*rounded**(1/2.4)-0.055));};\n'+
      '        const pixelSamples=Array.from({length:16},(_unused,index)=>{const x=30+60*index,y=30,at=(960*y+x)*4;const referenceRgba=[...referenceDecoded.stdout.subarray(at,at+4)],outputRgba=[...decoded.stdout.subarray(at,at+4)];return {x,y,referenceRgba,outputRgba,predicted8BitLinearRoundTripRgb:referenceRgba.slice(0,3).map(quantizedRoundTrip)};});');
    fragment=replace(fragment,'alphaExact:bands.alphaExact,metrics:','alphaExact:bands.alphaExact,pixelSamples,metrics:');
    fragment=replace(fragment,'svg-component-fidelity-control','svg-filter-precision-control',3);
  }
  if(options.integrationDiagnostics){
    fragment=replace(fragment,'svg-filter-precision-control','svg-filter-integration-control',3);
    fragment=replace(fragment,'metrics:unknown;pixelSamples?:unknown','metrics:unknown;pixelSamples?:unknown;rgbDifference?:unknown');
    const sample='const pixelSamples=Array.from({length:16},(_unused,index)=>{const x=30+60*index,y=30,at=(960*y+x)*4;';
    fragment=replace(fragment,sample,
      'const coordinates=Array.from({length:64},(_unused,index)=>{const tile=index%16,kind=Math.floor(index/16);return kind===0?{kind:"center",x:30+60*tile,y:30}:kind===1?{kind:"corner",x:2+60*tile,y:2}:kind===2?{kind:"shadow-gap",x:59+60*tile,y:30}:{kind:"bottom-shadow",x:30+60*tile,y:59};});\n'+
      '        const pixelSamples=coordinates.map(({kind,x,y})=>{const at=(960*y+x)*4;');
    fragment=replace(fragment,'return {x,y,referenceRgba,outputRgba,predicted8BitLinearRoundTripRgb:',
      'return {kind,x,y,referenceRgba,outputRgba,predicted8BitLinearRoundTripRgb:');
    const marker='        const comparison=await execFileAsync("ffmpeg",';
    fragment=replace(fragment,marker,
      '        const differenceCounts=Array.from({length:256},()=>0);let maximumChannelDifference=0,totalDifference=0;\n'+
      '        const worstPixels:{x:number;y:number;totalDifference:number;referenceRgba:number[];outputRgba:number[]}[]=[];\n'+
      '        for(let at=0;at<decoded.stdout.length;at+=4){let pixelDifference=0;for(let channel=0;channel<3;channel++){const difference=Math.abs(decoded.stdout[at+channel]-referenceDecoded.stdout[at+channel]);differenceCounts[difference]++;maximumChannelDifference=Math.max(maximumChannelDifference,difference);totalDifference+=difference;pixelDifference+=difference;}\n'+
      '          if(worstPixels.length<12||pixelDifference>worstPixels[worstPixels.length-1].totalDifference){worstPixels.push({x:(at/4)%960,y:Math.floor(at/4/960),totalDifference:pixelDifference,referenceRgba:[...referenceDecoded.stdout.subarray(at,at+4)],outputRgba:[...decoded.stdout.subarray(at,at+4)]});worstPixels.sort((a,b)=>b.totalDifference-a.totalDifference);if(worstPixels.length>12)worstPixels.pop();}}\n'+
      '        const rgbDifference={maximumChannelDifference,meanAbsoluteChannelDifference:totalDifference/(960*540*3),differenceCounts,worstPixels};\n'+marker);
    fragment=replace(fragment,'alphaExact:bands.alphaExact,pixelSamples,metrics:',
      'alphaExact:bands.alphaExact,pixelSamples,rgbDifference,metrics:');
  }
  const suite=replace(base.suite,body,fragment);
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,'"--grep", "paired-svg-fidelity-control",','"--grep", "svg-component-fidelity-control",');
  driver=replace(driver,'const repeat = "small-full-vs-strip-control";','const repeat = "svg-component-fidelity-control";');
  driver=replace(driver,'report.smallFidelityControl={diagnosticOnly:true,sourceWidth:960,sourceHeight:540,original6MStressReplaced:false};',
    'report.componentFidelityControl={diagnosticOnly:true,sourceWidth:960,sourceHeight:540,original6MStressReplaced:false,components:3};');
  driver=replace(driver,'"Small960x540 paired full-frame versus strip diagnostic through production UI/IO; never original6M stress acceptance"',
    '"Three small component ablations, full-frame production worker/UI/direct IO; never original6M stress acceptance"');
  driver=replace(driver,'"Small paired diagnostic including fresh reference and validation; never stress or release acceptance"',
    '"Component diagnostics including fresh references and strict validation; never stress or release acceptance"');
  driver=replace(driver,'"fixtures/images/test-pattern-effects.svg.json"];','"fixtures/images/test-pattern-effects.svg.json", "scripts/lib/svg-component-fidelity-control.mjs"];');
  if(options.filterPrecision){
    driver=replace(driver,'"--grep", "svg-component-fidelity-control",','"--grep", "svg-filter-precision-control",');
    driver=replace(driver,'const repeat = "svg-component-fidelity-control";','const repeat = "svg-filter-precision-control";');
    driver=replace(driver,'components:3};','components:3,filterPrecision:true};');
    driver=replace(driver,'"Three small component ablations, full-frame production worker/UI/direct IO; never original6M stress acceptance"',
      '"Three small filter precision controls, same full-frame worker/UI/direct IO; not original6M acceptance"');
    driver=replace(driver,'"scripts/lib/svg-component-fidelity-control.mjs"];','"scripts/lib/svg-component-fidelity-control.mjs", "scripts/lib/svg-filter-precision-variants.mjs"];');
  }
  if(options.integrationDiagnostics){
    driver=replace(driver,'"--grep", "svg-component-fidelity-control",','"--grep", "svg-filter-integration-control",');
    driver=replace(driver,'const repeat = "svg-component-fidelity-control";','const repeat = "svg-filter-integration-control";');
    driver=replace(driver,'components:3};','components:3,integrationDiagnostics:true};');
    driver=replace(driver,'"Three small component ablations, full-frame production worker/UI/direct IO; never original6M stress acceptance"',
      '"Three small precision integration controls with bounded pixel evidence; same full worker/UI/direct IO, never6M acceptance"');
    driver=replace(driver,'"scripts/lib/svg-component-fidelity-control.mjs"];','"scripts/lib/svg-component-fidelity-control.mjs", "scripts/lib/svg-filter-integration-variants.mjs", "scripts/lib/svg-filter-precision-variants.mjs"];');
  }
  return {...base,suite,driver,proof:{...base.proof,suiteSha256:sha(suite),driverSha256:sha(driver),controlTestSha256:sha(fragment),
    bothModesSameNativeBytesAndProductionIo:false,fullFrameProductionWorkerOnly:true,
    componentVariants:variants.map(({source,...pin})=>{void source;return pin;}),
    filterPrecisionControl:options.filterPrecision===true,eachVariantHasItsOwnMatchingChromiumReference:true,
    integrationDiagnostics:options.integrationDiagnostics===true,
    scope:"Small component ablations only; original6M acceptance unaltered and not exercised",publicPromotion:false}};
}
