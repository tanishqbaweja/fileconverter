// Procedural mock pixels only; no real SVG renderer is executed in Node.
import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { makeSvgStripWorker } from "../scripts/lib/svg-strip-worker-recipe.mjs";
const bundle=await build({stdin:{contents:'export * from "./lib/private-svg-strip-pilot.ts";',loader:"ts",resolveDir:process.cwd()},bundle:true,platform:"node",format:"esm",write:false});
const {runPrivateSvgStripPilot,svgStripPilotObservation,demultiplySvgRgba}=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
function decodePng(parts,width,height){
  const png=Buffer.concat(parts), idat=[];
  for(let offset=8;offset<png.length;){const size=png.readUInt32BE(offset);if(png.toString("ascii",offset+4,offset+8)==="IDAT")idat.push(png.subarray(offset+8,offset+8+size));offset+=size+12;}
  const raw=inflateSync(Buffer.concat(idat)), out=Buffer.alloc(width*height*4), rowBytes=width*4;
  assert.equal(raw.length,(rowBytes+1)*height);
  for(let row=0;row<height;row++){assert.equal(raw[row*(rowBytes+1)],1);for(let col=0;col<rowBytes;col++)out[row*rowBytes+col]=raw[row*(rowBytes+1)+col+1]+(col<4?0:out[row*rowBytes+col-4]);}
  return out;
}
test("alpha conversion preserves opaque/transparent cases and pinned rounding examples",()=>{
  const pixels=new Uint8Array([2,3,5,40,153,99,54,180,10,20,30,255,0,0,0,0,1,1,1,2]);
  demultiplySvgRgba(pixels);assert.deepEqual([...pixels],[13,19,32,40,217,140,77,180,10,20,30,255,0,0,0,0,128,128,128,2]);
  assert.throws(()=>demultiplySvgRgba(new Uint8Array(3)),/Complete RGBA/);
});
test("private viewport prototype emits every central row exactly once, frees native mocks and never keeps a full image",{timeout:10000},async()=>{
  const width=16,height=200,parts=[],observation=svgStripPilotObservation();let boxReleased=0,live=0,peakLive=0,rasterized=0;
  const boxes=[],box={x:0,y:0,width,height,free(){boxReleased++;}}, pixel=(x,y)=>[x%128,y%128,(x+y)%128,128];
  const renderer={getBBox(){return box;},cropByBBox(value){assert.equal(value,box);boxes.push({...value});},render(){
    live++;peakLive=Math.max(peakLive,live);const y=box.y,h=box.height;
    return{width,height:h,get pixels(){const rgba=new Uint8Array(width*h*4);for(let row=0;row<h;row++)for(let x=0;x<width;x++)rgba.set(pixel(x,y+row),(row*width+x)*4);return rgba;},free(){live--;}};
  }};
  let lastRows=0;
  await runPrivateSvgStripPilot({renderer,width,height,observation,assertActive(){},async write(bytes){parts.push(Buffer.from(bytes));},onRows(rows){assert.ok(rows>lastRows);lastRows=rows;},onRasterized(){rasterized++;}});
  const expected=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)expected.set(pixel(x,y),(y*width+x)*4);demultiplySvgRgba(expected);
  assert.deepEqual(decodePng(parts,width,height),Buffer.from(expected));assert.equal(peakLive,1);assert.equal(live,0);assert.equal(boxReleased,1);assert.equal(rasterized,1);
  assert.equal(observation.renderedViewports,4);assert.equal(observation.releasedViewports,4);assert.equal(observation.completedRows,height);assert.equal(lastRows,height);
  assert.ok(boxes.every(value=>value.height<=160));assert.ok(observation.maximumRgbaCopyBytes<=width*160*4);
  assert.equal(observation.generalFilterSupportClaimed,false);
});
test("native pixel failure survives both image and BBox cleanup errors",{timeout:10000},async()=>{
  const primary=new WebAssembly.RuntimeError("mock native primary");let imageReleased=0,boxReleased=0;
  const box={x:0,y:0,width:1,height:1,free(){boxReleased++;throw new Error("mock bbox cleanup");}};
  const renderer={getBBox(){return box;},cropByBBox(){},render(){return{width:1,height:1,get pixels(){throw primary;},free(){imageReleased++;throw new Error("mock image cleanup");}};}};
  await assert.rejects(runPrivateSvgStripPilot({renderer,width:1,height:1,observation:svgStripPilotObservation(),assertActive(){},async write(){},onRows(){},onRasterized(){}}),error=>error===primary);
  assert.equal(imageReleased,1);assert.equal(boxReleased,1);
});
test("private worker overlay reverses to the entire pinned source and changes only SVG block plus writer URL resolution",async()=>{
  const worker=await readFile("workers/conversion.worker.ts"),bridge=await readFile("workers/random-access-destination.ts");
  const result=makeSvgStripWorker(worker,bridge,"/assets/direct-file-writer.worker-Cd6e6fgR.js");
  assert.equal(result.proof.workerWholeSourceReversed,true);assert.equal(result.proof.bridgeOnlyUrlResolutionChanged,true);
  assert.match(result.generated,/new RegExp\(`/);assert.match(result.generated,/runPrivateSvgStripPilot\(\{renderer/);
  assert.match(result.generated,/resvgInitialization \?\?= initResvgWasm/);assert.match(result.generated,/releaseSvgRendererObjects/);
  assert.throws(()=>makeSvgStripWorker(Buffer.concat([worker,Buffer.from("\n")]),bridge,"/assets/direct-file-writer.worker-Cd6e6fgR.js"));
});
