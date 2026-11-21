import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { preDocxNumbering } from "../scripts/lib/reviewed-docx-numbering.mjs";
import { preDocxHyperlinks } from "../scripts/lib/reviewed-docx-hyperlinks.mjs";
import { preDocxColors } from "../scripts/lib/reviewed-docx-colors.mjs";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const raw=await readFile("evidence/2026-11-16T14-24-12-204Z-docx-html-qualification.json");
assert.equal(sha(raw),"cd950697c2833e2b8903c4202dffa4d2cade299d1860de4e847272ff4a192a16");
const r=JSON.parse(raw),packed=await readFile(r.nativeArchive.file);
assert.equal(sha(packed),r.nativeArchive.sha256);
const journal=gunzipSync(packed,{maxOutputLength:4194304});assert.equal(sha(journal),r.nativeArchive.decodedSha256);
const samples=JSON.parse(journal),window=record=>samples.filter(s=>Date.parse(s.timestamp)>=Date.parse(record.windowStart)&&Date.parse(s.timestamp)<=Date.parse(record.windowEnd));
test("actual source-pinned headless Word lists pass three repeated outputs and adverse recovery, not route publication",async()=>{
  assert.equal(r.status,"passed-private-docx-numbering-and-recovery-not-scaling-or-promotion");
  assert.deepEqual(r.cases.map(c=>c.kind),["complete","complete","complete","payload-cancel","write-error","complete"]);
  // Historical numbering qualification, not current hyperlink certification.
  for(const file of ["workers/docx-numbering.ts","workers/docx-outline.ts","workers/docx-html-conversion.ts","scripts/lib/docx-numbering-fixtures.py"]){
    const bytes=await readFile(file);
    assert.equal(sha(file==="workers/docx-html-conversion.ts"?preDocxHyperlinks(file,bytes):preDocxColors(file,bytes)),r.sourcePins[file],file);
  }
  assert.equal(r.fixture.bytes,37964);assert.equal(r.tableFixture.generator,"python-docx");assert.equal(r.tableFixture.semanticCases,18);
  assert.equal(r.tableFixture.anchorContentBytes,224000);
  for(const c of r.cases.filter(c=>c.kind==="complete")){
    assert.equal(c.outputBytes,227399);assert.equal(c.validated.sha256,"6bbb8982c6606924add8607351ea68815d378970177b74b58c531f39d2dd37d4");
    assert.equal(c.validated.semanticCases,18);assert.equal(c.validated.independentHardcodedLabelOracle,true);
    assert.equal(c.validated.allLabelsTextLevelsAndValuesVerified,true);assert.equal(c.validated.nestedHtmlListsAndTablesVerified,true);
    assert.ok(c.metrics.maxReadChunkBytes<=262144&&c.metrics.maxWriteChunkBytes<=65536&&c.metrics.peakQueuedBytes<=65536);
    assert.equal(c.metrics.pendingOperations,0);assert.equal(c.metrics.queuedBytes,0);assert.equal(c.metrics.peakPendingOperations,1);
    assert.equal(c.destinationObservation.actualFileHandle,true);
  }
  assert.deepEqual(r.validatorControls.map(c=>c.exitCode),[0,1,1,1,1,1,1,1]);
  assert.equal(r.forbiddenRequests.length,0);assert.equal(r.requestCount,35);
  for(const key of ["headed","browserServicesDisabled","publicPromotion","largeFileScalingVerified","nativeExternalDestinationVerified","speedImprovementProven","nativeConversionUsed"])assert.equal(r[key],false);
});
test("complete native journal independently rederives actual peak and each original per-run cleanup window",()=>{
  for(const s of samples)if(s.privateBytes!==null)assert.equal(s.privateBytes,s.processes.reduce((n,p)=>n+p.privateBytes,0));
  for(const m of [r.memory,...r.cases.filter(c=>c.smallRunMemory).map(c=>c.smallRunMemory)]){
    const rows=window(m),valid=rows.filter(s=>s.privateBytes!==null),peak=Math.max(...valid.map(s=>s.privateBytes));
    assert.equal(valid.length,m.validSamples);assert.equal(rows.length-valid.length,m.unavailableSamples);
    assert.equal(peak,m.peak.privateBytes);assert.equal((peak-r.blankBaseline.privateBytes)/1048576,m.incrementalPrivateMiB);
    assert.ok(m.incrementalPrivateMiB<=250);
    if(m.cleanupStable){assert.equal((m.cleanupStable.privateBytes-r.loadedIdle.privateBytes)/1048576,m.cleanupDeltaFromLoadedMiB);assert.ok(m.cleanupDeltaFromLoadedMiB<=96);}
  }
  assert.equal(r.memory.incrementalPrivateMiB,83.296875);assert.equal(r.memory.validSamples,433);assert.equal(r.memory.unavailableSamples,0);
});
test("owned cleanup handles PID reuse honestly and historical outline integration remains byte-exact",async()=>{
  assert.equal(r.browserBirthReconciliation.allObservedBirthsAbsent,true);assert.equal(r.browserBirthReconciliation.observedPidCount,45);
  assert.equal(r.browserBirthReconciliation.reused.length,3);assert.deepEqual(r.browserBirthReconciliation.unresolved,[]);
  assert.equal(r.browserBirthReconciliation.noProcessesKilled,true);assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.serverCleanup.ownedRootAbsent,true);
  assert.equal(r.browserCleanup.individualChildKills,false);
  assert.deepEqual(r.protectedOriginalBefore,r.protectedOriginalAfter);
  assert.equal(r.protectedOriginalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  const source=await readFile("workers/docx-outline.ts"),previous=preDocxNumbering("workers/docx-outline.ts",source);
  assert.equal(sha(previous),"ad239ccea7a3527b4e4cf7aaa2aeb3d9dd972920d5cd425b23be230ad1dd20e6");
  const unrelated=Buffer.concat([source,Buffer.from("\n// Unreviewed\n")]);assert.equal(preDocxNumbering("workers/docx-outline.ts",unrelated),unrelated);
});
