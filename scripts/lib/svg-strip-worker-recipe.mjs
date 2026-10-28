import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { build, version as esbuildVersion } from "esbuild";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export const stripWorkerPins = Object.freeze({
  "workers/conversion.worker.ts": "fbdbd631d791420f6af3a8dcaa9871fb367a04dbeb456999441b6f9c2a7ae833",
  "workers/random-access-destination.ts": "f46a4db401daabeb40a0b9eaa9feb256b623c21d2a7f41af549b6797842b4375",
});
const replace = (text,before,after) => { assert.equal(text.split(before).length-1,1,"Exact strip source anchor: "+before); return text.replace(before,after); };
export function makeSvgStripWorker(worker, bridge, writerUrl) {
  assert.equal(sha(worker),stripWorkerPins["workers/conversion.worker.ts"]);
  assert.equal(sha(bridge),stripWorkerPins["workers/random-access-destination.ts"]);
  assert.match(writerUrl,/^\/assets\/direct-file-writer\.worker-[\w-]+\.js$/);
  const original = worker.toString(), begin = original.indexOf("async function runSvgToPng("), end = original.indexOf("\nasync function runImageConversion(",begin);
  assert.ok(begin>0 && end>begin);
  const body=original.slice(begin,end), start=body.indexOf('    emitProgress(jobId, "Encoding PNG", metrics, startedAt, true);');
  const finish=body.indexOf("    metrics.inputBytes = file.size;",start); assert.ok(start>0 && finish>start);
  const before=body.slice(start,finish), after=`    if (!/<svg\\b[^>]*\\bviewBox=["']0 0 ${"${expected.width}"} ${"${expected.height}"}["']/i.test(source))
      throw new Error("Private strip pilot requires the original 1:1 zero-origin viewBox.");
    const stripObservation = svgStripPilotObservation(); Object.assign(metrics, {svgStripPilot: stripObservation});
    await runPrivateSvgStripPilot({renderer, width: expected.width, height: expected.height,
      observation: stripObservation, assertActive,
      write: bytes => writeBounded(destination, bytes, jobId, "Writing PNG strips", metrics, startedAt),
      onRows: rows => emitProgress(jobId, "Rasterizing SVG strips: " + rows + "/" + expected.height + " rows", metrics, startedAt, false),
      onViewport: () => observeSvgMemory(metrics, "rasterized", getInitializedResvgMemory()),
      onRasterized: () => observeSvgMemory(metrics, "rasterized", getInitializedResvgMemory()),
    });
    observeSvgMemory(metrics, "encoded", getInitializedResvgMemory());
    assertActive();
`;
  // A dynamic RegExp is required for dimensions; no fixture hash or element removal.
  const corrected=after.replace('!/<svg\\b[^>]*\\bviewBox=["\']0 0 ${expected.width} ${expected.height}["\']/i.test(source)',
    '!new RegExp(`<svg\\\\b[^>]*\\\\bviewBox=["\']0 0 ${expected.width} ${expected.height}["\']`, "i").test(source)');
  assert.notEqual(corrected,after);
  const importLine='import { runPrivateSvgStripPilot, svgStripPilotObservation } from "../lib/private-svg-strip-pilot";\n';
  const generated=importLine+replace(original,before,corrected);
  assert.equal(replace(generated.slice(importLine.length),corrected,before),original,"Whole worker source reversibility");
  const bridgeBefore='new URL("./direct-file-writer.worker.ts", import.meta.url)', bridgeAfter=JSON.stringify(writerUrl);
  const generatedBridge=replace(bridge.toString(),bridgeBefore,bridgeAfter);
  assert.equal(replace(generatedBridge,bridgeAfter,bridgeBefore),bridge.toString());
  return {generated,generatedBridge,proof:{workerOriginalSha256:sha(worker),workerGeneratedSha256:sha(generated),
    bridgeOriginalSha256:sha(bridge),bridgeGeneratedSha256:sha(generatedBridge),
    workerWholeSourceReversed:true,bridgeOnlyUrlResolutionChanged:true,writerUrl,
    originalReadDirectWriteCancelErrorLifecycleRetained:true,publicSourceFilesEdited:false}};
}
export async function buildSvgStripWorker({root,runtime,centralRows=64}) {
  assert.ok([64,80].includes(centralRows));
  assert.equal(path.dirname(runtime.directory),path.join(root,"work"));
  assert.match(path.basename(runtime.directory),/^svg-reproduced-qualification-[A-Za-z0-9]{6}$/);
  assert.equal(esbuildVersion,"0.28.1");
  const assets=await readdir(path.join(root,"dist/client/assets")), writers=assets.filter(name=>/^direct-file-writer\.worker-[\w-]+\.js$/.test(name));
  assert.equal(writers.length,1); const writerUrl="/assets/"+writers[0], writer=await readFile(path.join(root,"dist/client",writerUrl));
  assert.equal(sha(writer),"b4feabf1df1d40cbf39236cbf5cb6b9b9d027d83b470323a2d42d3cb2618286c");
  const entries=await Promise.all(Object.keys(stripWorkerPins).map(file=>readFile(path.join(root,file))));
  const recipe=makeSvgStripWorker(...entries,writerUrl), loads=[];
  const sources={};
  const result=await build({absWorkingDir:root,entryPoints:["workers/conversion.worker.ts"],bundle:true,platform:"browser",format:"esm",target:"es2022",
    minify:true,write:false,metafile:true,plugins:[{name:"private-svg-strip-source-overlay",setup(api){api.onLoad({filter:/\.(?:ts|mts|mjs|js)$/},async args=>{
      const relative=path.relative(root,args.path).replaceAll("\\","/");
      if(relative.startsWith("node_modules/")) return;
      assert.ok(!relative.startsWith("../")); const bytes=await readFile(args.path); assert.ok(bytes.length<=1048576);
      sources[relative]={bytes:bytes.length,sha256:sha(bytes)};
      let contents;
      if(relative==="workers/conversion.worker.ts") contents=recipe.generated;
      if(relative==="workers/random-access-destination.ts") contents=recipe.generatedBridge;
      if(relative==="lib/private-svg-strip-pilot.ts"&&centralRows!==64)
        contents=replace(bytes.toString(),"export const SVG_PILOT_ROWS = 64;",`export const SVG_PILOT_ROWS = ${centralRows};`);
      if(contents!==undefined){loads.push(relative);return {contents,loader:"ts",resolveDir:path.dirname(args.path)};}
    });}}]});
  assert.deepEqual(loads.sort(),[...Object.keys(stripWorkerPins),...(centralRows===64?[]:["lib/private-svg-strip-pilot.ts"])].sort()); assert.equal(result.outputFiles.length,1);
  const bytes=result.outputFiles[0].contents; assert.ok(bytes.length<=1048576); assert.ok(Buffer.from(bytes).includes(Buffer.from("Rasterizing SVG strips")));
  const file=path.join(runtime.directory,"private-svg-strip-worker.mjs"); await writeFile(file,bytes,{flag:"wx"});
  const archives=Object.fromEntries([["worker",recipe.generated],["bridge",recipe.generatedBridge]].map(([key,text])=>[key,{bytes:Buffer.byteLength(text),sha256:sha(text),gzipBase64:gzipSync(text,{level:9}).toString("base64")}])) ;
  if(centralRows!==64){
    const helper=replace((await readFile(path.join(root,"lib/private-svg-strip-pilot.ts"))).toString(),"export const SVG_PILOT_ROWS = 64;",`export const SVG_PILOT_ROWS = ${centralRows};`);
    archives.viewportHelper={bytes:Buffer.byteLength(helper),sha256:sha(helper),gzipBase64:gzipSync(helper,{level:9}).toString("base64")};
  }
  for(const [relative,pin] of Object.entries(sources))assert.equal(sha(await readFile(path.join(root,relative))),pin.sha256,relative);
  return {file,bytes:bytes.length,sha256:sha(bytes),centralRows,esbuildVersion,sourceClosure:sources,generatedSourceArchives:archives,
    recipe:recipe.proof,writer:{url:writerUrl,bytes:writer.length,sha256:sha(writer)},publicPromotion:false,
    privateCompilerDiffersFromVite:true,memoryAcceptance:false};
}
