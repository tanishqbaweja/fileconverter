// Exact npm source/map audit, not execution of untrusted archives or user files.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import ts from "typescript";
import { TraceMap,decodedMappings } from "@jridgewell/trace-mapping";
const root=path.resolve(import.meta.dirname,".."),destination=path.join(root,"evidence/2026-10-29-og-embedded-zip-source-map.json");
await assert.rejects(access(destination),{code:"ENOENT"});
const sha=b=>createHash("sha256").update(b).digest("hex");
const report={schemaVersion:1,startedAt:new Date().toISOString(),scope:"Source-map evidence for exact upstreamOG1.0.3 embedded fflate ZIP64 functions only; not complete security or conversion acceptance",cases:[],applicationGraphChanged:false};
try{
  const response=await fetch("https://registry.npmjs.org/@vercel/og/-/og-1.0.3.tgz",{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);
  const chunks=[];let received=0;
  for await(const bytes of response.body){received+=bytes.length;assert.ok(received<=8388608);chunks.push(bytes);}
  const packed=Buffer.concat(chunks),integrity="sha512-"+createHash("sha512").update(packed).digest("base64");
  assert.equal(integrity,"sha512-/iYJ34PDu4lty1TXdL86qHEw8viveHTllG1PWLuJX8tSFfqKL7kyVJeUORJmQ250bHB0h+alcalXUlza3c/NSA==");
  report.archive={bytes:packed.length,integrity,sha256:sha(packed)};
  const tar=gunzipSync(packed,{maxOutputLength:16777216}),members={};let entries=0;
  for(let at=0;at+512<=tar.length;){
    const name=tar.subarray(at,at+100).toString().replace(/\0.*$/s,"");if(!name)break;
    const bytes=parseInt(tar.subarray(at+124,at+136).toString().replace(/\0.*$/s,"").trim(),8);assert.ok(Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=8388608);
    assert.ok(++entries<=40&&at+512+bytes<=tar.length);
    if(/^package\/dist\/index\.(node|edge)\.js(?:\.map)?$/.test(name))members[name]=tar.subarray(at+512,at+512+bytes);
    at+=512+Math.ceil(bytes/512)*512;
  }
  for(const kind of ["node","edge"]){
    const entry="package/dist/index."+kind+".js",code=members[entry],mapBytes=members[entry+".map"];
    assert.ok(code&&mapBytes);const raw=JSON.parse(mapBytes),map=new TraceMap(raw),mappings=decodedMappings(map);
    const sourceCases=[];
    for(let index=0;index<raw.sources.length;index++){
      if(!/fflate\/(?:esm|lib)\//.test(raw.sources[index]))continue;
      const text=raw.sourcesContent[index];assert.equal(typeof text,"string");
      const parsed=ts.createSourceFile("fflate.js",text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS),ranges=[];
      const visit=node=>{
        if((ts.isFunctionDeclaration(node)||ts.isVariableDeclaration(node))&&node.name&&ts.isIdentifier(node.name)&&["unzipSync","z64e"].includes(node.name.text))
          ranges.push({name:node.name.text,startLine:parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line,endLine:parsed.getLineAndCharacterOfPosition(node.end).line,mappedSegments:0});
        ts.forEachChild(node,visit);
      };visit(parsed);assert.equal(ranges.length,2,"Both actual upstream ZIP64 entry/walker must be found before claiming exclusion");
      let retainedMappings=0;
      for(const line of mappings)for(const segment of line)if(segment.length>=4&&segment[1]===index){
        retainedMappings++;for(const range of ranges)if(segment[2]>=range.startLine&&segment[2]<=range.endLine)range.mappedSegments++;
      }
      assert.ok(retainedMappings>0,"Map must actually retain other fflate code; missing maps are not absence evidence");
      sourceCases.push({source:raw.sources[index],sourceSha256:sha(text),retainedMappings,ranges});
    }
    assert.ok(sourceCases.length>0&&sourceCases.length<=4,"Exact fflate source maps required");
    const value={kind,entryBytes:code.length,entrySha256:sha(code),mapBytes:mapBytes.length,mapSha256:sha(mapBytes),sourceCases};report.cases.push(value);
    assert.ok(sourceCases.every(source=>source.ranges.every(range=>range.mappedSegments===0)),"Do not apply an audit-only override if vulnerable ZIP64 code remains in a consumer bundle");
  }
  report.status="exact-node-and-edge-bundles-exclude-both-fflate-unzipSync-and-zip64-walker";
}catch(error){report.status="failed-or-inconclusive-embedded-zip-source-audit";report.failure=String(error.stack??error);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(destination,JSON.stringify(report,null,2)+"\n",{flag:"wx"});}
console.log(JSON.stringify({path:path.relative(root,destination),status:report.status,cases:report.cases.length,failure:report.failure}));
