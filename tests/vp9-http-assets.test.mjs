// Static-file transport/lifecycle controls only; no media converter in Node.
import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdir,writeFile,access,readdir} from "node:fs/promises";
import {createReadStream} from "node:fs";
import {createServer} from "node:http";
import {EventEmitter} from "node:events";
import {createHash} from "node:crypto";
import path from "node:path";
import {createOwnedRuntimeScratch} from "../scripts/lib/owned-runtime-scratch.mjs";
import {createVp9HttpAssets} from "../scripts/lib/vp9-http-assets.mjs";
const names=["within-remux.mjs","within-remux.wasm"],origin="http://127.0.0.1:12345",sha=b=>createHash("sha256").update(b).digest("hex"),
  headers=name=>({"cross-origin-embedder-policy":"require-corp","cross-origin-opener-policy":"same-origin","cross-origin-resource-policy":"same-origin",
    "origin-agent-cluster":"?1","referrer-policy":"no-referrer","x-content-type-options":"nosniff","x-frame-options":"DENY","permissions-policy":"camera=()",
    "content-security-policy":"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'","cache-control":"public, max-age=31536000, immutable",
    "content-type":name.endsWith(".wasm")?"application/wasm":"text/javascript"});
async function setup(run) {
  const runtime=await createOwnedRuntimeScratch("vp9-http-assets-unit-"),root=runtime.directory,assets={runId:12345678,sourceHead:"a".repeat(40),files:{}},data={};
  let http;
  try {
    await mkdir(path.join(root,"dist/client/engines"),{recursive:true});await mkdir(path.join(root,"work/vp9-duration-input-12345678"),{recursive:true});
    for(const name of names){const file=path.join(root,"work/vp9-duration-input-12345678",name),bytes=Buffer.from("mock-static-"+name);await writeFile(file,bytes,{flag:"wx"});
      data[name]=bytes;assets.files[name]={path:file,bytes:bytes.length,sha256:sha(bytes)};}
    http=await createVp9HttpAssets(root,assets);await run({root,assets,data,http,fetcher:async(url,options)=>{
      const name=names.find(n=>new URL(url).pathname.endsWith("/"+n));assert.ok(name);return new Response(options.method==="HEAD"?null:data[name],{status:200,headers:headers(name)});
    }});
  }finally{try{await http?.close();}finally{await runtime.close();}}
}
test("stages only pinned static engines, URL-continues without body injection, and counts only validated actual HTTP responses",async()=>setup(async({root,http,fetcher})=>{
  const report=http.report();assert.deepEqual(report.served,{javascript:0,wasm:0});await http.preflight(origin,fetcher);
  assert.equal(report.httpPreflight.length,2);assert.ok(report.httpPreflight.every(x=>x.beforeBrowserLaunch));
  const context=new EventEmitter();http.attach(context);const calls=[];
  for(const name of names) {
    assert.equal(await http.respond({request:()=>({url:()=>origin+"/engines/remux/"+name,method:()=>"GET"}),continue:async value=>calls.push(value)}),true);
    assert.equal(Object.keys(calls.at(-1)).join(","),"url");assert.ok(calls.at(-1).url.includes("/engines/vp9-http-"));
    context.emit("response",{url:()=>calls.at(-1).url,request:()=>({method:()=>"GET"}),status:()=>200,allHeaders:async()=>headers(name)});
  }
  await http.through();assert.deepEqual(report.served,{javascript:1,wasm:1});assert.deepEqual(report.rewritten,{javascript:1,wasm:1});
  assert.equal(report.devtoolsResponseBodyUsed,false);assert.equal(report.publicAssetReplacement,false);assert.equal(report.userMediaReadOrCopied,false);
  await http.close();await http.close();assert.equal(report.stageRemoved,true);assert.equal(context.listenerCount("response"),0);
  await assert.rejects(access(path.join(root,report.stage)),{code:"ENOENT"});
}));
test("hostile origins/methods/user paths never rewrite or open engine data",async()=>setup(async({http,fetcher})=>{
  await http.preflight(origin,fetcher);
  for(const [url,method]of [["https://example.com/engines/remux/within-remux.wasm","GET"],[origin+"/test.mkv","GET"],
    [origin+"/browser-output.webm","GET"],[origin+"/engines/remux/within-remux.wasm","POST"]]) {
    assert.equal(await http.respond({request:()=>({url:()=>url,method:()=>method}),continue:async()=>assert.fail("must not rewrite")}),false);
  }
  assert.deepEqual(http.report().rewritten,{javascript:0,wasm:0});
}));
test("HTTP preflight rejects changed security or served bytes and still removes owned stage",async()=>{
  for(const fault of ["headers","bytes"])await setup(async({http,fetcher})=>{
    await assert.rejects(http.preflight(origin,async(url,options)=>{
      const response=await fetcher(url,options);
      if(url.includes("vp9-http-")&&(fault==="bytes"?options.method==="GET":options.method==="HEAD")) {
        if(fault==="headers")response.headers.set("cross-origin-resource-policy","cross-origin");else return new Response("wrong static bytes",{headers:response.headers});
      }
      return response;
    }));
    assert.equal(http.report().securityCacheAndMimeHeadersPreserved,false);
  });
});
test("failed response observation preserves explicit error, does not increment served, and cannot skip stage cleanup",async()=>assert.rejects(setup(async({http,fetcher})=>{
  await http.preflight(origin,fetcher);const context=new EventEmitter();http.attach(context);
  context.emit("response",{url:()=>origin+"/engines/remux/within-remux.wasm",request:()=>({method:()=>"GET"}),status:()=>500,allHeaders:async()=>headers(names[1])});
  await assert.rejects(http.through());assert.equal(http.report().served.wasm,0);
  await assert.rejects(http.close(),/Every HTTP observation/);assert.equal(http.report().stageRemoved,true);
  // The setup finally intentionally observes close's existing rejection too.
}),/Every HTTP observation/));
test("wrong static source pin fails before staging another directory",async()=>setup(async({root,assets})=>{
  const before=await readdir(path.join(root,"dist/client/engines")),bad=structuredClone(assets);bad.files["within-remux.wasm"].sha256="0".repeat(64);
  await assert.rejects(createVp9HttpAssets(root,bad));assert.deepEqual(await readdir(path.join(root,"dist/client/engines")),before);
}));
test("response observations have a strict pending cap and never queue more header requests",async()=>assert.rejects(setup(async({http,fetcher})=>{
  await http.preflight(origin,fetcher);const context=new EventEmitter(),releases=[];http.attach(context);
  for(let i=0;i<5;i++)context.emit("response",{url:()=>origin+"/engines/remux/within-remux.wasm",request:()=>({method:()=>"GET"}),status:()=>200,
    allHeaders:()=>new Promise(resolve=>releases.push(()=>resolve(headers(names[1]))))});
  assert.equal(releases.length,4);assert.equal(http.report().responses.length,4);assert.equal(http.report().errors.length,1);
  for(const release of releases)release();await assert.rejects(http.through());
}),/Every HTTP observation/));
test("missing response headers become explicit unavailable error by bounded deadline, never a zero/served sample",async()=>assert.rejects(setup(async({http,fetcher})=>{
  await http.preflight(origin,fetcher);const context=new EventEmitter();http.attach(context);
  context.emit("response",{url:()=>origin+"/engines/remux/within-remux.wasm",request:()=>({method:()=>"GET"}),status:()=>200,allHeaders:()=>new Promise(()=>{})});
  await assert.rejects(http.through());assert.equal(http.report().served.wasm,0);assert.equal(http.report().responses[0].headers,null);
  assert.match(http.report().responses[0].error,/unavailable before deadline/);
}),/Every HTTP observation/));
test("real loopback HTTP preflight streams and authenticates candidate bytes with production header equivalence",async()=>setup(async({root,http})=>{
  const privatePrefix="/engines/"+path.basename(http.report().stage),server=createServer((req,res)=>{
    const u=new URL(req.url,"http://127.0.0.1"),name=names.find(n=>u.pathname===privatePrefix+"/"+n||u.pathname==="/engines/remux/"+n);
    if(!name){res.writeHead(404);res.end();return;}res.writeHead(200,headers(name));
    if(req.method==="HEAD")res.end();else createReadStream(path.join(root,http.report().stage,name),{highWaterMark:65536}).pipe(res);
  });
  try {await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));await http.preflight("http://127.0.0.1:"+server.address().port);
    assert.equal(http.report().securityCacheAndMimeHeadersPreserved,true);assert.ok(http.report().httpPreflight.every(x=>x.bytes>0&&x.maximumChunkBytes<=262144));
  }finally{await new Promise(resolve=>server.close(resolve));}
}));
