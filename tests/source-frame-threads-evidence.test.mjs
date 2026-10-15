import assert from "node:assert/strict";
import { access,readFile,stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { queryReliableProcessIdentity } from "../scripts/lib/reliable-owned-identity.mjs";
const root=path.resolve(import.meta.dirname,"..");
test("actual whole-source four-thread validator preserves all frames, fixed deadline, exact source pins and cleanup",async()=>{
  const record=JSON.parse(await readFile(path.join(root,"evidence/2026-10-15T21-54-44-094Z-source-frame-threads.json")));
  assert.equal(record.failure,null);assert.equal(record.status,"full-source-frame-timing-4-threads-passed-not-browser-acceptance");
  assert.equal(record.conversionPerformed,false);assert.equal(record.fullOriginalAcceptance,false);assert.equal(record.publicAcceptance,false);
  assert.equal(record.native.defaultProbeThreads,1);assert.equal(record.native.candidateThreads,4);
  assert.equal(record.control.all96FixtureDecodedPixelsAndTimingsEqual,true);
  assert.equal(record.control.timings[0].frames,96);assert.equal(record.control.timings[1].frames,96);
  assert.equal(record.control.timings[0].orderedTimestampSha256,record.control.timings[1].orderedTimestampSha256);
  assert.equal(record.control.pixelHashes[0].framemd5Sha256,record.control.pixelHashes[1].framemd5Sha256);
  assert.equal(record.sourceResult.frames,296160);assert.equal(record.sourceResult.ignoredLines,0);
  assert.equal(record.sourceResult.orderedTimestampSha256,"4da5643ccd06096fd3b25f4a33eab23303e5e1dd4329427a52c01523272b365c");
  assert.equal(record.sourceResult.firstTimestampSeconds,0);assert.equal(record.sourceResult.lastTimestampSeconds,12339.958);
  assert.ok(record.sourceResult.maximumStepSeconds<=.042001);assert.equal(record.sourceResult.stderrTail,"");
  assert.equal(record.sourceResult.retainedTimestampArray,false);assert.equal(record.sourceResult.maximumBytes,33554432);
  assert.equal(record.launch.maximumMs,1800000);assert.ok(record.exit.elapsedMs<record.launch.maximumMs);
  assert.equal(record.exit.elapsedMs,681309);assert.equal(record.exit.code,0);assert.equal(record.exit.signal,null);
  assert.deepEqual(record.protectedBefore,record.protectedAfter);assert.equal(record.protectedAfter.bytes,2958573265);
  assert.equal(record.protectedAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal((await stat(path.join(root,"test.mkv"))).size,record.protectedAfter.bytes);
  assert.deepEqual(record.sourcePins,record.postSourcePins);assert.equal(Object.keys(record.sourcePins).length,7);
  for(const [file,hash]of Object.entries(record.sourcePins)){
    assert.equal(sha(Buffer.from(record.sourcePreimages[file],"base64")),hash,file);assert.equal(sha(await readFile(path.join(root,file))),hash,file);
  }
  assert.equal(record.runtimeRemoved,true);await assert.rejects(access(record.runtime),{code:"ENOENT"});
  const current=await queryReliableProcessIdentity(record.launch.identity.pid);
  assert.ok(current===null||Date.parse(current.createdAt)!==Date.parse(record.launch.identity.createdAt));
});
