// Local static engines only. Never serves/copies user inputs or conversion output.
import assert from "node:assert/strict";
import path from "node:path";
import {constants,createReadStream} from "node:fs";
import {copyFile,lstat,mkdtemp,realpath,rm} from "node:fs/promises";
import {createHash} from "node:crypto";
const names=["within-remux.mjs","within-remux.wasm"],security=["cross-origin-embedder-policy","cross-origin-opener-policy",
  "cross-origin-resource-policy","origin-agent-cluster","referrer-policy","x-content-type-options","x-frame-options","permissions-policy","content-security-policy","cache-control","content-type"];
const hashFile=async file=>{const h=createHash("sha256");for await(const bytes of createReadStream(file,{highWaterMark:262144}))h.update(bytes);return h.digest("hex");};
function localOrigin(origin) {const u=new URL(origin);assert.equal(u.origin,origin);assert.equal(u.protocol,"http:");assert.equal(u.hostname,"127.0.0.1");assert.ok(Number(u.port)>0);}
export async function createVp9HttpAssets(root,assets) {
  assert.ok(path.isAbsolute(root));assert.match(String(assets.runId),/^\d{8,14}$/);assert.match(assets.sourceHead,/^[0-9a-f]{40}$/);
  const parent=path.join(root,"dist/client/engines"),source=path.join(root,"work/vp9-duration-input-"+assets.runId);
  assert.equal(await realpath(parent),parent);assert.equal(await realpath(source),source);
  for(const name of names) {
    const pin=assets.files[name],file=path.join(source,name),info=await lstat(file);
    assert.equal(pin.path,file);assert.ok(info.isFile()&&!info.isSymbolicLink());assert.equal(await realpath(file),file);
    assert.ok(info.size>0&&info.size<=(name.endsWith(".wasm")?16777216:2097152));
    assert.equal(info.size,pin.bytes);assert.equal(await hashFile(file),pin.sha256);
  }
  const directory=await mkdtemp(path.join(parent,"vp9-http-")),identity=await lstat(directory,{bigint:true}),prefix="/engines/"+path.basename(directory),
    responses=[],errors=[],pending=new Set(),served={javascript:0,wasm:0},rewritten={javascript:0,wasm:0},expectedHeaders={};
  let closed=false,context,listener,origin,preflightComplete=false,closing;
  const report={runId:assets.runId,sourceHead:assets.sourceHead,served,rewritten,responses,errors,
    files:Object.fromEntries(names.map(name=>[name,{bytes:assets.files[name].bytes,sha256:assets.files[name].sha256}])),
    stage:path.relative(root,directory).replaceAll("\\","/"),maximumRequests:16,maximumPendingResponses:4,maximumResponseHeaderWaitMs:2000,
    staticReadChunkBytes:262144,normalProductionHttpDelivery:true,devtoolsResponseBodyUsed:false,
    publicAssetReplacement:false,cachePolicyChanged:false,securityCacheAndMimeHeadersPreserved:false,
    httpPreflight:[],stageRemoved:false,userMediaReadOrCopied:false,acceptanceMetric:false};
  const remove=async()=>{
    assert.equal(path.dirname(directory),parent);assert.equal(await realpath(parent),parent);
    const now=await lstat(directory,{bigint:true});assert.ok(now.isDirectory()&&!now.isSymbolicLink());
    assert.equal(now.dev,identity.dev);assert.equal(now.ino,identity.ino);assert.equal(await realpath(directory),directory);
    await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});report.stageRemoved=true;
  };
  try {
    for(const name of names){const target=path.join(directory,name);await copyFile(assets.files[name].path,target,constants.COPYFILE_EXCL);assert.equal(await hashFile(target),assets.files[name].sha256);}
  }catch(error){await remove();throw error;}
  const findName=url=>{const u=new URL(url);if(u.origin!==origin)return null;return names.find(n=>u.pathname==="/engines/remux/"+n||u.pathname===prefix+"/"+n)??null;};
  const through=async()=>{await Promise.all([...pending]);assert.deepEqual(errors,[],"HTTP engine response validation failed");};
  return {
    report:()=>report,
    async preflight(selectedOrigin,fetcher=fetch) {
      assert.equal(closed,false);assert.equal(preflightComplete,false);localOrigin(selectedOrigin);origin=selectedOrigin;
      for(const name of names) {
        const options={method:"HEAD",headers:{"Accept-Encoding":"identity"},redirect:"error",signal:AbortSignal.timeout(10000)},
          canonical=await fetcher(origin+"/engines/remux/"+name,options),candidate=await fetcher(origin+prefix+"/"+name,options);
        assert.equal(canonical.status,200);assert.equal(candidate.status,200);
        expectedHeaders[name]=Object.fromEntries(security.map(h=>{const value=candidate.headers.get(h);assert.equal(value,canonical.headers.get(h),h);return[h,value];}));
        assert.equal(expectedHeaders[name]["cross-origin-embedder-policy"],"require-corp");assert.equal(expectedHeaders[name]["cross-origin-opener-policy"],"same-origin");
        assert.equal(expectedHeaders[name]["cross-origin-resource-policy"],"same-origin");assert.equal(expectedHeaders[name]["x-content-type-options"],"nosniff");
        assert.ok(expectedHeaders[name]["content-security-policy"]?.includes("default-src 'self'"));
        assert.equal(expectedHeaders[name]["cache-control"],"public, max-age=31536000, immutable");
        assert.match(expectedHeaders[name]["content-type"]??"",name.endsWith(".wasm")?/^application\/wasm(?:;|$)/:/^(?:text|application)\/javascript(?:;|$)/);
        const response=await fetcher(origin+prefix+"/"+name,{...options,method:"GET",signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);
        const reader=response.body.getReader(),hash=createHash("sha256");let bytes=0,maximumChunkBytes=0;
        try {for(;;){const {done,value}=await reader.read();if(done)break;assert.ok(value.byteLength>0&&value.byteLength<=262144);
          bytes+=value.byteLength;maximumChunkBytes=Math.max(maximumChunkBytes,value.byteLength);assert.ok(bytes<=assets.files[name].bytes);hash.update(value);}}
        finally{await reader.cancel();}
        assert.equal(bytes,assets.files[name].bytes);const sha256=hash.digest("hex");assert.equal(sha256,assets.files[name].sha256);
        report.httpPreflight.push({name,canonicalStatus:canonical.status,candidateStatus:candidate.status,bytes,sha256,maximumChunkBytes,
          headers:expectedHeaders[name],beforeBrowserLaunch:true,bodyReadOnlyByNodeForStaticEngineAuthentication:true});
      }
      preflightComplete=true;report.securityCacheAndMimeHeadersPreserved=true;
    },
    attach(selectedContext) {
      assert.equal(closed,false);assert.equal(preflightComplete,true);assert.equal(context,undefined);context=selectedContext;
      listener=response=>{
        const name=findName(response.url());if(!name||response.request().method()!=="GET")return;
        if(responses.length>=16||pending.size>=4){if(errors.length<16)errors.push("Bounded HTTP response observation exceeded");return;}
        const row={name,status:response.status(),headers:null,error:null};responses.push(row);
        const operation=(async()=>{let timer;try {
          assert.equal(row.status,200);const headers=await Promise.race([response.allHeaders(),new Promise((_,reject)=>{
            timer=setTimeout(()=>reject(new Error("Static response headers unavailable before deadline")),2000);
          })]);row.headers=Object.fromEntries(security.map(h=>[h,headers[h]??null]));
          assert.deepEqual(row.headers,expectedHeaders[name]);served[name.endsWith(".wasm")?"wasm":"javascript"]++;
        }catch(error){row.error=String(error).slice(0,1024);if(errors.length<16)errors.push(row.error);}finally{clearTimeout(timer);}})();
        pending.add(operation);operation.finally(()=>pending.delete(operation));
      };context.on("response",listener);
    },
    async respond(route) {
      assert.equal(closed,false);assert.equal(preflightComplete,true);
      const request=route.request(),u=new URL(request.url()),name=names.find(n=>u.pathname==="/engines/remux/"+n);
      if(u.origin!==origin||!["GET","HEAD"].includes(request.method())||!name)return false;
      assert.ok(rewritten.javascript+rewritten.wasm<16,"Bound private static URL rewrites");
      await route.continue({url:origin+prefix+"/"+name});rewritten[name.endsWith(".wasm")?"wasm":"javascript"]++;return true;
    },
    through,
    close() {
      closing??=(async()=>{closed=true;if(context)context.off("response",listener);
        const outcomes=await Promise.allSettled([through(),remove()]);const failures=outcomes.filter(x=>x.status==="rejected").map(x=>x.reason);
        if(failures.length)throw new AggregateError(failures,"Every HTTP observation/static-stage cleanup attempted");})();return closing;
    },
  };
}
