import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { deriveDocxHyperlinkScalingSeries,renderDocxHyperlinkScalingSeries } from "../scripts/lib/docx-hyperlink-scaling-series.mjs";
import { reconcileChromiumBirths } from "../scripts/lib/reconcile-chromium-births.mjs";
import { preDocxColors } from "../scripts/lib/reviewed-docx-colors.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const seriesFile="evidence/2026-11-20T11-46-04-089Z-docx-hyperlink-scaling-series.json",raw=await readFile(seriesFile);
assert.equal(sha(raw),"91558d4cf0367104185aed16e0cfd093b23bf18ee6ef87364cd55a8825018bae");
const series=JSON.parse(raw),reports=[],journals=[];
for(const [i,ref]of series.references.entries()){
  const b=await readFile(ref.file);assert.equal(sha(b),ref.sha256);
  assert.equal(sha(b),["71ef91ef096dadb7619c660d4194e23644a14d4d17de4aca6182701710630096","2272446702b171610c5ebcc10b9cb9e52d37726518a607cdef8fcb3d7d4b51ab"][i]);
  const r=JSON.parse(b),packed=await readFile(r.nativeArchive.file);assert.equal(sha(packed),r.nativeArchive.sha256);
  const journal=gunzipSync(packed,{maxOutputLength:16*1048576});assert.equal(sha(journal),r.nativeArchive.decodedSha256);
  reports.push(r);journals.push(JSON.parse(journal));
}
test("actual source-pinned current hyperlink scaling3x2 plus distinct clean largest1x independently reproduces every row and report",async()=>{
  const derived=deriveDocxHyperlinkScalingSeries(reports,journals);
  assert.deepEqual({...derived,references:series.references,generatedAt:series.generatedAt},series);
  assert.equal(derived.rows.length,7);assert.equal(derived.peakCompleteControlIncrementalPrivateMiB,187.2734375);
  assert.equal(derived.maximumPerRunCleanupDeltaMiB,69.6875);assert.equal(derived.universalFlatMemoryClaim,false);
  const [small,large]=reports[0].scalingInputs;assert.equal(small.bytes,9462927);assert.equal(large.bytes,148388967);
  assert.deepEqual(derived.rows.map(r=>r.outputBytes),[9295737,9295737,9295737,148682577,148682577,148682577,148682577]);
  const rendered=renderDocxHyperlinkScalingSeries(series);
  for(const [suffix,contents]of Object.entries(rendered))assert.equal(contents,(await readFile(seriesFile.replace(/\.json$/,"."+suffix))).toString());
  for(const [file,pin]of Object.entries(reports[0].sourcePins))assert.equal(sha(preDocxColors(file, await readFile(file))),pin,file);
});
test("all1768 native rows are retained; missing2 active samples remain unavailable and are not converted to zeros",()=>{
  assert.deepEqual(journals.map(j=>j.length),[1226,542]);
  assert.deepEqual(reports.map(r=>r.memory.validSamples),[998,323]);assert.deepEqual(reports.map(r=>r.memory.unavailableSamples),[1,1]);
  for(const samples of journals)for(const s of samples)if(s.privateBytes!==null)assert.equal(s.privateBytes,s.processes.reduce((n,p)=>n+p.privateBytes,0));
  const missing=journals[0].find(s=>s.privateBytes===null&&Date.parse(s.timestamp)>=Date.parse(reports[0].memory.windowStart)&&Date.parse(s.timestamp)<=Date.parse(reports[0].memory.windowEnd));assert.ok(missing);
  const changed=structuredClone(journals);changed[0]=changed[0].filter(s=>s!==missing&&s.sequence!==missing.sequence);
  assert.throws(()=>deriveDocxHyperlinkScalingSeries(reports,changed));
});
test("failed status, rebasing, process subtraction, changed sources, fake clean birth and nonidentical outputs cannot be stitched into acceptance",()=>{
  for(const mutate of [r=>r[0].status="failed-not-acceptance",r=>r[0].blankBaseline.privateBytes+=1048576,
    r=>r[1].sourcePins["workers/docx-hyperlinks.ts"]="changed",r=>r[1].browserLaunchIdentity=structuredClone(r[0].browserLaunchIdentity),
    r=>r[1].cases.find(c=>c.runMemory).validated.sha256="different",
    r=>{const m=r[0].cases.find(c=>c.runMemory).runMemory;m.cleanupStable.privateBytes=r[0].loadedIdle.privateBytes+97*1048576;m.cleanupDeltaFromLoadedMiB=97;}]){
    const r=structuredClone(reports);mutate(r);assert.throws(()=>deriveDocxHyperlinkScalingSeries(r,journals));
  }
  const j=structuredClone(journals),s=j[0].find(s=>s.privateBytes!==null&&Date.parse(s.timestamp)>=Date.parse(reports[0].memory.windowStart)&&Date.parse(s.timestamp)<=Date.parse(reports[0].memory.windowEnd));
  assert.ok(s?.processes.length>1);s.processes.pop();assert.throws(()=>deriveDocxHyperlinkScalingSeries(reports,j));
});
test("retained birth evidence explains one reused PID without killing it; both sessions clean up and genuinely cancel hyperlink-rich payload",()=>{
  const [a,b]=reports,current=a.browserCleanup.observations.at(-1).current;
  assert.deepEqual(reconcileChromiumBirths({identity:a.browserLaunchIdentity,observedPids:a.browserCleanup.observedPids,samples:journals[0],current}),a.browserBirthReconciliation);
  assert.equal(a.browserBirthReconciliation.allObservedBirthsAbsent,true);assert.deepEqual(a.browserBirthReconciliation.reused.map(p=>p.pid),[7108]);
  assert.equal(a.browserBirthReconciliation.noProcessesKilled,true);assert.equal(b.browserCleanup.status,"owned-observed-pids-absent");
  for(const r of reports){assert.equal(r.hyperlinkCancellationFixture.linksPerParagraph,2);assert.equal(r.hyperlinkCancellationFixture.hyperlinkRelationships,1024);
    assert.ok(r.cases.find(c=>c.kind==="payload-cancel").armedMetrics.outputBytes>0);assert.equal(r.ownedRuntimeRemoved,true);
    assert.equal(r.serverCleanup.ownedRootAbsent,true);assert.deepEqual(r.forbiddenRequests,[]);assert.equal(r.publicPromotion,false);}
});
