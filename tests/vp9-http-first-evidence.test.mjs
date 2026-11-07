import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),sha=b=>createHash("sha256").update(b).digest("hex"),
  r=await json("evidence/2026-11-06-vp9-token-packed-http-qualification-42244170876.json"),a=await json("evidence/2026-11-06-vp9-http-first-localization.json");
test("first HTTP-only control retains genuine byte-exact independently valid output but wholeChrome264MiB keeps it failed",()=>{
  assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.outputSha256,"82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b");
  assert.equal(r.independentFidelity.passed,true);assert.equal(r.browserResult.metrics.outputBytes,99413);assert.equal(r.recovery,undefined);
  assert.equal(r.memory.incrementalPrivateMiB,264.25390625);assert.equal(r.memory.validSamples,21);assert.equal(r.memory.unavailableSamples,0);
  assert.equal((r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576,r.memory.incrementalPrivateMiB);
  assert.equal(a.processes.reduce((n,p)=>n+p.peakPrivateBytes,0),r.memory.peak.privateBytes);assert.equal(r.publicAcceptance,false);
});
test("committed HTTP receipts agree on source/header observations, trace-body pins and cleanup without asserting allocation ownership",async()=>{
  assert.equal(r.privateCpuOverride.devtoolsResponseBodyUsed,false);assert.equal(r.privateCpuOverride.securityCacheAndMimeHeadersPreserved,true);
  assert.deepEqual(r.privateCpuOverride.served,{javascript:1,wasm:1});assert.deepEqual(r.privateCpuOverride.errors,[]);
  assert.ok(r.privateCpuOverride.httpPreflight.every(x=>x.beforeBrowserLaunch&&x.maximumChunkBytes<=262144));
  assert.deepEqual(a.trace.wasmBodies.map(x=>x.bytes).sort((x,y)=>x-y),[5561904,9877633]);assert.equal(a.exactTraceOverheadPrivateBytes,null);
  assert.equal(a.trace.wholeEngineBodiesCaptured,true);assert.equal(a.trace.userMediaBodiesCaptured,false);
  assert.deepEqual(r.failureTrace,{path:a.trace.path,bytes:a.trace.bytes,sha256:a.trace.sha256});
  assert.equal(a.trace.sha256,"94c1b1b2ede53707128c4a58f134595d8e1530aade87f3d7d36e85b788de073e");assert.equal(r.privateCpuOverride.stageRemoved,true);
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.ok(r.processCleanup.every(x=>x.status==="owned-identity-absent"));
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.deepEqual(r.forbiddenRequests,[]);
  const raw=gunzipSync(await read(r.rawArchive.file),{maxOutputLength:4194304});assert.equal(sha(raw),r.rawArchive.decodedSha256);
});
