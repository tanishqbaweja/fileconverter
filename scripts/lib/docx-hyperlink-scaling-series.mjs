import assert from "node:assert/strict";
import { assertInstalledChromePinsEqual } from "./installed-chrome-pin.mjs";

function rederive(r, samples, m) {
  const rows=samples.filter(s=>Date.parse(s.timestamp)>=Date.parse(m.windowStart)&&Date.parse(s.timestamp)<=Date.parse(m.windowEnd));
  const valid=rows.filter(s=>s.privateBytes!==null&&Array.isArray(s.processes));
  assert.ok(valid.length>0);for(const s of valid){assert.ok(Number.isFinite(s.privateBytes)&&s.privateBytes>0&&!s.sampleError);assert.equal(s.privateBytes,s.processes.reduce((n,p)=>n+p.privateBytes,0));}
  const peak=valid.reduce((a,b)=>a.privateBytes>=b.privateBytes?a:b);
  assert.equal(valid.length,m.validSamples);assert.equal(rows.length-valid.length,m.unavailableSamples);
  assert.equal(peak.privateBytes,m.peak.privateBytes);assert.equal((peak.privateBytes-r.blankBaseline.privateBytes)/1048576,m.incrementalPrivateMiB);
  assert.ok(m.incrementalPrivateMiB<=250);
  if(m.cleanupStable){assert.equal(m.cleanupStable.stable,true);assert.equal((m.cleanupStable.privateBytes-r.loadedIdle.privateBytes)/1048576,m.cleanupDeltaFromLoadedMiB);assert.ok(m.cleanupDeltaFromLoadedMiB<=96);}
}
export function deriveDocxHyperlinkScalingSeries(reports,journals) {
  assert.equal(reports.length,2);assert.equal(journals.length,2);const [a,b]=reports;
  assert.equal(a.status,"passed-private-docx-hyperlink-scaling-repeats-not-full-route");
  assert.equal(b.status,"passed-private-docx-hyperlink-fresh-largest-control-not-full-route");
  assert.equal(a.hyperlinkScaling.freshLargestOnly,false);assert.equal(b.hyperlinkScaling.freshLargestOnly,true);
  assert.deepEqual(a.scalingPlan.paragraphs,[2048,32768]);assert.equal(a.scalingPlan.repeats,3);
  assert.deepEqual(b.scalingPlan.paragraphs,[32768]);assert.equal(b.scalingPlan.repeats,1);
  assert.deepEqual(a.sourcePins,b.sourcePins);assertInstalledChromePinsEqual(a.browserBefore,b.browserBefore);
  assert.notDeepEqual(a.browserLaunchIdentity,b.browserLaunchIdentity);assert.ok(Date.parse(a.finishedAt)<Date.parse(b.startedAt));
  const rows=[];
  for(const [session,r]of reports.entries()){
    assert.equal(r.blankBaseline.stable,true);assert.equal(r.loadedIdle.stable,true);
    for(const k of ["headed","browserServicesDisabled","nativeConversionUsed","publicPromotion","nativeExternalDestinationVerified","speedImprovementProven"])assert.equal(r[k],false);
    assert.deepEqual(r.protectedOriginalBefore,r.protectedOriginalAfter);assert.deepEqual(r.protectedOriginalBefore,a.protectedOriginalBefore);
    assert.equal(r.protectedOriginalBefore.bytes,2958573265);assert.equal(r.protectedOriginalBefore.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
    assert.deepEqual(r.failures,[]);assert.deepEqual(r.forbiddenRequests,[]);
    assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.serverCleanup.ownedRootAbsent,true);assert.equal(r.browserCleanup.individualChildKills,false);
    assert.ok(r.browserCleanup.status==="owned-observed-pids-absent"||r.browserBirthReconciliation?.allObservedBirthsAbsent===true);
    const samples=journals[session];assert.ok(samples.length<=12000);rederive(r,samples,r.memory);
    assert.ok(r.scalingValidatorControls.length>=8&&r.scalingValidatorControls[0].exitCode===0&&r.scalingValidatorControls.slice(1).every(c=>c.exitCode!==0));
    for(const c of r.cases.filter(c=>c.runMemory)){
      rederive(r,samples,c.runMemory);assert.equal(c.kind,"complete");const source=r.scalingInputs.find(i=>i.paragraphs===c.paragraphs);assert.ok(source);
      assert.equal(source.generated.zipMethod,"stored");assert.equal(source.generated.hyperlinkRelationships,1024);assert.equal(source.generated.bookmarkNames,64);
      assert.equal(c.sourceSha256,source.sha256);assert.equal(c.sourceBytes,source.bytes);assert.equal(c.outputBytes,c.validated.bytes);
      assert.equal(c.validated.allParagraphsAndLinksComparedInOrder,true);assert.equal(c.validated.paragraphs,c.paragraphs);assert.equal(c.validated.links,c.paragraphs*2);assert.equal(c.validated.bookmarkNames,64);
      assert.ok(c.metrics.maxReadChunkBytes<=262144&&c.metrics.maxWriteChunkBytes<=65536&&c.metrics.peakQueuedBytes<=65536);
      assert.equal(c.metrics.peakPendingOperations,1);assert.equal(c.metrics.pendingOperations,0);assert.equal(c.metrics.queuedBytes,0);assert.equal(c.destinationObservation.actualFileHandle,true);
      rows.push({session:session+1,paragraphs:c.paragraphs,repeat:c.repeat,sourceBytes:c.sourceBytes,outputBytes:c.outputBytes,outputSha256:c.validated.sha256,
        elapsedMs:c.metrics.elapsedMs,incrementalPrivateMiB:c.runMemory.incrementalPrivateMiB,cleanupDeltaFromOriginalLoadedMiB:c.runMemory.cleanupDeltaFromLoadedMiB});
    }
    assert.ok(r.cases.some(c=>c.kind==="payload-cancel")&&r.cases.some(c=>c.kind==="write-error"));
    const recovery=r.cases.find(c=>c.kind==="complete"&&!c.runMemory);assert.ok(recovery?.validated.allHyperlinksBookmarksTextAndEmphasisVerified);
  }
  assert.deepEqual(rows.map(r=>[r.session,r.paragraphs]),[[1,2048],[1,2048],[1,2048],[1,32768],[1,32768],[1,32768],[2,32768]]);
  for(const n of [2048,32768])assert.equal(new Set(rows.filter(r=>r.paragraphs===n).map(r=>r.outputSha256)).size,1);
  const firstLarge=a.scalingInputs.find(i=>i.paragraphs===32768),fresh=b.scalingInputs[0];
  for(const k of ["sha256","bytes","paragraphs"])assert.equal(firstLarge[k],fresh[k]);
  assert.ok(firstLarge.bytes>100*1048576&&rows.filter(r=>r.paragraphs===32768).every(r=>r.outputBytes>100*1048576));
  return {schemaVersion:1,scope:"Current-model private hyperlink scaling3x2 plus independent clean largest1x; not full Word/native destination/browser/public acceptance",
    crossSessionSameSourceAndOutputVerified:true,rows,peakCompleteControlIncrementalPrivateMiB:Math.max(...reports.map(r=>r.memory.incrementalPrivateMiB)),
    maximumPerRunCleanupDeltaMiB:Math.max(...rows.map(r=>r.cleanupDeltaFromOriginalLoadedMiB)),primaryLimitMiB:250,cleanupLimitMiB:96,
    measuredBoundsPassed:true,universalFlatMemoryClaim:false,matchedSpeedupProven:false,publicPromotion:false,wholeGoalComplete:false};
}
export function renderDocxHyperlinkScalingSeries(s) {
  const fields=["session","paragraphs","repeat","sourceBytes","outputBytes","elapsedMs","incrementalPrivateMiB","cleanupDeltaFromOriginalLoadedMiB"];
  assert.ok(s.rows.length===7&&s.rows.every(r=>fields.every(k=>Number.isFinite(r[k]))));
  const csv=[fields.join(","),...s.rows.map(r=>fields.map(k=>r[k]).join(","))].join("\n")+"\n";
  const chart=field=>{const maximum=Math.max(1,...s.rows.map(r=>r[field]));return `<svg viewBox="0 0 480 180" role="img" aria-label="Ordered measured runs; ${field}"><polyline fill="none" stroke="#3266b0" stroke-width="3" points="${s.rows.map((r,i)=>`${30+i*65},${150-r[field]/maximum*120}`).join(" ")}"/></svg>`;};
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Private DOCX hyperlink scaling</title></head><body><h1>Private DOCX hyperlink scaling</h1><p>Seven genuine completed large-document outputs, fixed1024relationships/64bookmarks. Every paragraph/link independently validated. Same original250/96MiB limits, no disabled services, excluded processes, forced GC or rebase. This is not public/full Word/native picker/external-drive/broader-browser qualification, a matched speedup or universal flat-memory proof.</p><table><tr>'+fields.map(k=>`<th>${k}</th>`).join('')+'</tr>'+s.rows.map(r=>'<tr>'+fields.map(k=>`<td>${r[k]}</td>`).join('')+'</tr>').join('')+'</table><h2>Input/output bytes</h2>'+chart('sourceBytes')+chart('outputBytes')+'<h2>Whole-tree incremental MiB</h2>'+chart('incrementalPrivateMiB')+'<h2>Conversion milliseconds</h2>'+chart('elapsedMs')+'<h2>Cleanup MiB above original loaded idle</h2>'+chart('cleanupDeltaFromOriginalLoadedMiB')+'</body></html>\n';
  return {csv,html};
}
