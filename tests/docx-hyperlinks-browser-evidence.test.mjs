import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const raw = await readFile("evidence/2026-11-20T11-26-08-834Z-docx-html-qualification.json");
assert.equal(sha(raw),"f2895157d1ef2259b812eaf7736a816942324df1e35e70c18b7e50944394bcfb");
const r = JSON.parse(raw), packed = await readFile(r.nativeArchive.file);
assert.equal(sha(packed),r.nativeArchive.sha256); assert.equal(sha(packed),"61cced87542189f8d835040a8aee1e0cf1b7e7bbebe721ae2ea2f3d9f814d88b");
const journal = gunzipSync(packed,{maxOutputLength:4194304}); assert.equal(sha(journal),r.nativeArchive.decodedSha256);
const samples = JSON.parse(journal);
test("genuine private production Word hyperlink fixture has three repeat outputs, real-payload cancellation, write failure and exact recovery",async()=>{
  assert.equal(r.status,"passed-private-docx-hyperlinks-and-recovery-not-scaling-or-promotion");
  assert.deepEqual(r.cases.map(c=>c.kind),["complete","complete","complete","payload-cancel","write-error","complete"]);
  for(const file of ["workers/docx-hyperlinks.ts","workers/docx-html-conversion.ts","workers/docx-outline.ts","workers/docx-numbering.ts",
    "workers/conversion.worker.ts","lib/capability-registry.ts","scripts/lib/docx-hyperlink-fixtures.py"])
    assert.equal(sha(await readFile(file)),r.sourcePins[file],file);
  assert.equal(r.fixture.bytes,37974); assert.equal(r.tableFixture.generator,"python-docx"); assert.equal(r.tableFixture.version,"1.2.0");
  assert.equal(r.tableFixture.anchorContentBytes,210000); assert.equal(r.tableFixture.realHyperlinkRelationships,true);
  for(const c of r.cases.filter(c=>c.kind==="complete")){
    assert.equal(c.outputBytes,211913); assert.equal(c.validated.sha256,"15445b44944bed785441587f7b18bbb0020e3ca196b434a7f877f9e97e320b90");
    assert.equal(c.validated.semanticCases,10); assert.equal(c.validated.independentHardcodedOracle,true);
    assert.equal(c.validated.allHyperlinksBookmarksTextAndEmphasisVerified,true); assert.equal(c.validated.unsafeTargetsInactive,true);
    assert.equal(c.validated.nestedHtmlTablesVerified,true); assert.equal(c.destinationObservation.actualFileHandle,true);
    assert.ok(c.metrics.maxReadChunkBytes<=262144&&c.metrics.maxWriteChunkBytes<=65536&&c.metrics.peakQueuedBytes<=65536);
    assert.equal(c.metrics.peakPendingOperations,1); assert.equal(c.metrics.pendingOperations,0); assert.equal(c.metrics.queuedBytes,0);
  }
  assert.deepEqual(r.validatorControls.map(c=>c.exitCode),[0,1,1,1,1,1,1,1,1,1]);
  assert.equal(r.cases.find(c=>c.kind==="payload-cancel").armedMetrics.outputBytes>=65536,true);
  assert.ok(r.cases.find(c=>c.kind==="write-error").message);
  assert.equal(r.forbiddenRequests.length,0);
  for(const key of ["headed","browserServicesDisabled","nativeConversionUsed","publicPromotion","largeFileScalingVerified","nativeExternalDestinationVerified","speedImprovementProven"])
    assert.equal(r[key],false,key);
});
test("complete native journal independently rederives global/per-run peaks and original cleanup without rebasing",()=>{
  for(const s of samples)if(s.privateBytes!==null)assert.equal(s.privateBytes,s.processes.reduce((n,p)=>n+p.privateBytes,0));
  for(const m of [r.memory,...r.cases.filter(c=>c.smallRunMemory).map(c=>c.smallRunMemory)]){
    const rows=samples.filter(s=>Date.parse(s.timestamp)>=Date.parse(m.windowStart)&&Date.parse(s.timestamp)<=Date.parse(m.windowEnd));
    const valid=rows.filter(s=>s.privateBytes!==null),peak=Math.max(...valid.map(s=>s.privateBytes));
    assert.equal(valid.length,m.validSamples); assert.equal(rows.length-valid.length,m.unavailableSamples);
    assert.equal(peak,m.peak.privateBytes); assert.equal((peak-r.blankBaseline.privateBytes)/1048576,m.incrementalPrivateMiB);
    assert.ok(m.incrementalPrivateMiB<=250);
    if(m.cleanupStable){assert.equal((m.cleanupStable.privateBytes-r.loadedIdle.privateBytes)/1048576,m.cleanupDeltaFromLoadedMiB);assert.ok(m.cleanupDeltaFromLoadedMiB<=96);}
  }
  assert.equal(r.memory.incrementalPrivateMiB,84.23828125); assert.equal(r.memory.validSamples,445); assert.equal(r.memory.unavailableSamples,0);
  assert.equal(Math.max(...r.cases.filter(c=>c.smallRunMemory).map(c=>c.smallRunMemory.cleanupDeltaFromLoadedMiB)),30.62109375);
});
test("owned cleanup and protected fixture identity are retained; earlier Unicode setup failure is not a conversion result",async()=>{
  assert.equal(r.ownedRuntimeRemoved,true); assert.equal(r.serverCleanup.ownedRootAbsent,true);
  assert.equal(r.browserCleanup.status,"owned-observed-pids-absent"); assert.equal(r.browserCleanup.observedPids.length,48);
  assert.deepEqual(r.browserCleanup.observations.at(-1).current,[]); assert.equal(r.browserCleanup.individualChildKills,false);
  assert.deepEqual(r.protectedOriginalBefore,r.protectedOriginalAfter);
  assert.equal(r.protectedOriginalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  const failed=JSON.parse(await readFile("evidence/2026-11-20T11-24-08-957Z-docx-html-qualification.json"));
  assert.equal(failed.status,"failed-not-acceptance"); assert.deepEqual(failed.cases,[]); assert.equal(failed.ownedRuntimeRemoved,true);
  assert.equal(failed.browserLaunchIdentity,undefined); assert.match(failed.failures.join("\n"),/UnicodeEncodeError/);
});
