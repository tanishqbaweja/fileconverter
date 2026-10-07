// ONE changed failure-only hook on the FULL original; no native conversion.
// Every inherited full input/codec/quality/heap/250MiB/validation/cleanup gate stays.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { extractPinnedSplitAdapter } from "./lib/mpeg2-abort-original-recipe.mjs";
import { makeQuiescedBudgetDriver } from "./lib/mpeg2-quiesced-budget-recipe.mjs";
import { makePartialBlinkAttribution } from "./lib/partial-blink-attribution-recipe.mjs";
import { readWasmFunctionNames, symbolizeWasmStack } from "./lib/wasm-stack-symbols.mjs";
const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;
const sha = data => createHash("sha256").update(data).digest("hex");
const proofPath = path.join(root, "evidence/mpeg2-quiesced-budget-original-2026-10-08.json");
await assert.rejects(access(proofPath), { code: "ENOENT" });
const host = await inspectStressHostMemory(); console.log(JSON.stringify({ scope: "changed-quiesced-budget-original-preflight", host }));
if (!host.safeToStart) {
  console.log("Held BEFORE source/profile/staging; no weakened host guard or automatic retry"); process.exitCode = 1;
} else {
  for(const file of["evidence/partial-blink-blocked-control-verification-2026-10-08.json","evidence/partial-blink-quiesced-control-verification-2026-10-08.json"]){
    const verified=JSON.parse(await readFile(path.join(root,file)));
    assert.equal(verified.rawTraceReconstructionAndReparseVerified,true);
    assert.equal(verified.cleanup.sampledNativeBirthsAbsent,true);
    const controlProof=JSON.parse(await readFile(path.join(root,verified.input.path)));
    assert.equal(sha(await readFile(path.join(root,verified.input.path))),verified.input.sha256);
    assert.equal(controlProof.failure,null);assert.deepEqual(controlProof.errors,[]);
    for(const [sourceFile,hash]of Object.entries(controlProof.sourcePins))assert.equal(sha(await readFile(path.join(root,sourceFile))),hash,sourceFile);
    if(file.includes("quiesced")){
      assert.equal(verified.globalDumpSucceeded,true);assert.equal(verified.target.blinkTypesAvailable,true);
      assert.equal(verified.quiescence.actualWorkerCloseObserved,true);assert.equal(verified.quiescence.retainedSyntheticBytes,264*MiB);
    }else{assert.equal(verified.globalDumpSucceeded,false);assert.equal(verified.target.blinkTypesAvailable,false);}
  }
  const terminal=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-staged-abort-terminal-analysis-2026-10-08.json")));
  assert.equal(terminal.nativePeakIncrementalMiB,264.2421875);assert.equal(terminal.actualAbortStacksCaptured,0);
  assert.equal(terminal.cleanup.protectedFullPostHashVerified,true);
  const control = JSON.parse(await readFile(path.join(root, "evidence/wasm-abort-capture-control-origin-checked-2026-10-08.json")));
  assert.equal(control.status, "passed-synthetic-abort-control"); assert.equal(control.failure, null);
  assert.equal(control.cleanup.runtimeProfileRemoved, true); assert.equal(control.cleanup.allSampledNativeBirthsAbsent, true);
  assert.equal(control.result.terminal.capture.first.stackLimitRestored, true);
  assert.equal(control.result.terminal.capture.nativeErrorSuppressed, false);
  for (const [file, hash] of Object.entries(control.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  const previous = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-flex-original-2026-10-07.json")));
  assert.match(previous.failure.message, /Cannot enlarge memory arrays to size 33587200/);
  assert.equal(previous.completeOriginalConversions, 0); assert.equal(previous.allocationObjectOrCallsite, null);
  for (const [file, hash] of Object.entries(previous.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  const golden = JSON.parse(await readFile(path.join(root,"evidence/mpeg2-abort-golden-regression-2026-10-08.json")));
  assert.equal(golden.status,"passed-5-of-5-private-regression");
  assert.equal(golden.conversions.length,3); assert.equal(golden.recovery.length,2);
  assert.equal(golden.emptyCleanupInventories,5); assert.equal(golden.privateAdditionsAbsent,true);
  for(const row of golden.conversions) {
    assert.equal(row.outputCodec,"mpeg2video"); assert.ok(row.ssim>=0.98);
    assert.equal(row.metrics.peakWasmMemoryBytes,50331648); assert.equal(row.metrics.peakPendingOperations,1);
  }
  for(const row of golden.recovery) { assert.equal(row.status,"passed"); assert.deepEqual(row.partialBytes,[]); }
  for(const [file,hash] of Object.entries(golden.sourcePins)) assert.equal(sha(await readFile(path.join(root,file))),hash,file);
  const setupFailure = JSON.parse(await readFile(path.join(root,"evidence/mpeg2-abort-preconversion-analysis-2026-10-08.json")));
  assert.equal(setupFailure.browserConversionsStarted,0); assert.equal(setupFailure.cleanup.protectedFullPostHashVerified,true);
  assert.equal(setupFailure.cleanup.allSampledNativeBirthsAbsent,true); assert.equal(setupFailure.cleanup.bothRuntimeDirectoriesAbsent,true);
  assert.equal(process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR, "mpeg2-split-pipeline-37479749443");
  const candidate = path.join(root, "work", process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR);
  const manifest = JSON.parse(await readFile(path.join(candidate, "build-manifest.json")));
  assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], control.result.actualBinarySha256);
  const helper = await readFile(path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "utf8");
  const adapter = extractPinnedSplitAdapter(await readFile(path.join(root, "scripts/stage-mpeg2-split-direct.mjs"), "utf8"));
  const runtime = await createOwnedRuntimeScratch("mpeg2-quiesced-budget-driver-");
  let generated, generatedTraceHelper, report, rawPath;
  try {
    const traceArchivePath=path.join(root,"outputs/reports",new Date().toISOString().replace(/[:.]/g,"-")+"-quiesced-budget-partial-blink-trace.json.gz");
    generatedTraceHelper=makePartialBlinkAttribution(await readFile(path.join(root,"scripts/lib/bounded-renderer-attribution.mjs"),"utf8"),root,traceArchivePath);
    const traceHelperPath=path.join(runtime.directory,"trace-helper.mjs");
    await writeFile(traceHelperPath,generatedTraceHelper,{flag:"wx"});
    generated = makeQuiescedBudgetDriver(await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8"),
      root, s => import.meta.resolve(s), adapter, helper,pathToFileURL(traceHelperPath).href);
    const file = path.join(runtime.directory, "full-source.mjs"); await writeFile(file, generated, { flag: "wx" });
    const completed = await import(pathToFileURL(file).href); report = completed.completedReport; rawPath = completed.completedReportPath;
  } finally { await runtime.close(); }
  await assert.rejects(access(runtime.directory), { code: "ENOENT" }); assert.ok(report && rawPath);
  assert.ok((await stat(rawPath)).size <= 32 * MiB);
  const rawHash = createHash("sha256");
  for await (const chunk of createReadStream(rawPath, { highWaterMark: 65536 })) rawHash.update(chunk);
  const conversionPhases = (report.nativeMemory?.phases ?? []).filter(p => /^pre-conversion-|^conversion-/.test(p.phase));
  const peaks = conversionPhases.map(p => p.peak).filter(Boolean).sort((a, b) => b[3] - a[3]);
  const peak = peaks[0] ?? null;
  const peakReport = peak && { sequence: peak[0], timestamp: peak[1], phase: peak[2], privateBytes: peak[3], rssBytes: peak[4],
    processes: peak[7].map(([index, privateBytes, rssBytes]) => ({ ...report.nativeMemory.identities[index], privateBytes, rssBytes })) };
  assert.ok(report.abortDiagnostic.records.length <= 8);
  const actualStackSymbols = [];
  for (const row of report.abortDiagnostic.records) {
    const artifact = row.role === "decoder" ? "within-mpeg2-split.wasm" : "split-encoder.wasm";
    const bytes = await readFile(path.join(candidate, artifact)); assert.equal(sha(bytes), manifest.artifacts[artifact]);
    const names = readWasmFunctionNames(bytes);
    // Preserve the complete bounded actual stack, explicitly omit excess frames
    // ONLY from the <=32-frame symbol join; never invent names or change the cap.
    let wasmFramesSeen = 0;
    const joinLines = row.stack.split("\n").filter(line => {
      if (!/wasm-function\[\d+\]:0x[0-9a-f]+/i.test(line)) return true;
      return ++wasmFramesSeen <= 32;
    });
    actualStackSymbols.push({role:row.role,observedAt:row.observedAt,binarySha256:sha(bytes),actualBinaryNames:names.size,
      wasmFramesSeen,omittedWasmFrames:Math.max(0,wasmFramesSeen-32),frames:symbolizeWasmStack(joinLines.join("\n"),names),
      failedIndividualAllocationBytes:null,heapLiveBytes:null,causalOriginalAllocationSizeClaim:null});
  }
  const domRows = report.samples.filter(s => s.dom).map(s => ({ phase:s.phase,timestamp:s.timestamp,jobState:s.jobState,
    dom:s.dom,cdpIsolateHeaps:s.cdpIsolateHeaps,metrics:s.metrics }));
  const proof = { recordedAt:new Date().toISOString(),status:"terminal-private-full-original-quiesced-budget-diagnostic-not-acceptance",
    rawStatus:report.status,rawReport:{path:path.relative(root,rawPath).replaceAll("\\","/"),bytes:(await stat(rawPath)).size,sha256:rawHash.digest("hex")},
    generatedSource:generated,generatedSourceSha256:sha(generated),generatedTraceHelper,generatedTraceHelperSha256:sha(generatedTraceHelper),sourcePins:report.sourceHashes,hostPreflight:host,
    source:{path:"test.mkv",bytes:report.source.bytes,sha256:report.source.sha256},browserVersion:report.browserVersion,
    formula:report.formula,limitMiB:report.limitMiB,requestedRuns:report.requestedRuns,
    startupSettlement:report.startupSettlement,blankBaseline:report.blankBaseline,loadedIdle:report.loadedIdle,
    cssCandidate:report.cssCandidate,abortDiagnostic:report.abortDiagnostic,actualStackSymbols,nativeFailureCapture:report.nativeFailureCapture,
    quiescedBudgetCapture:report.quiescedBudgetCapture,rendererAttributionResult:report.rendererAttributionResult,
    nativePeak:peakReport,nativePeakIncrementalMiB:peak&&report.blankBaseline?(peak[3]-report.blankBaseline.privateBytes)/MiB:null,
    nativeObserverAvailable:Boolean(report.nativeMemory),nativeObserverError:report.nativeMemory?.error??null,
    nativePhaseCoverage:conversionPhases.map(p=>({phase:p.phase,validSamples:p.validSamples,unavailableSamples:p.unavailableSamples})),
    domSamplerReport:report.domSamplerReport,boundedDomRows:domRows,rawSamplesEvicted:report.samplesEvicted,
    runs:report.runs,splitFinalSamples:report.splitFinalSamples,nativeStackSamples:report.nativeStackSamples,
    failure:report.failure,cleanup:report.cleanup,forbiddenRequests:report.forbiddenRequests,browserLocalRequests:report.browserLocalRequests,
    ownedPids:report.ownedPids,sampledNativeIdentities:report.nativeMemory?.identities??null,runtimeDirectory:report.runtimeDirectory,
    generatedRuntimeDirectory:runtime.directory,outerGeneratedRuntimeRemoved:true,
    completeOriginalConversions:report.runs.filter(r=>r.state?.jobState==="complete"&&r.independentValidation).length,
    publicAcceptance:false,originalFullSourceMemoryAcceptance:false,conversionSpeedAcceptance:false,
    noDetailedHeapDumpBeforeBudgetFailure:true,noForcedGc:true,noDocker:true,nativeConverterUsed:false,
    caveat:"Same FULL original/unchanged actual decoder+encoder/fixed32+16MiB/14flags/full-tree250MiB/lowerfive-minute blank/threefullruns/six-hour deadline/full independent fidelity/recovery/finally. Same proven staged adapter/abort capture PLUS failure-only normal production cancellation/worker-close/detailed partial-capable dump with bounded recoverable raw trace; delayed post-cancel allocator/type records NOT peak-time object/live/callsite or earlier failure cause; original reads/writes/codec settings/progress/call mapping preserved. No synthetic malloc/debugger/GC. Failure hook diagnostic cannot certify memory, speed or public support. Actual binary-symbol join is a call path, not individual allocation size, live heap, fragmentation or a proof that every older failure had this cause. Historical243-frame allocation proof does not stand in for this changed long-run stack." };
  const json = JSON.stringify(proof,null,2)+"\n"; assert.ok(Buffer.byteLength(json)<4*MiB);
  await writeFile(proofPath,json,{flag:"wx"});
  console.log(JSON.stringify({file:proofPath,failure:proof.failure?.message,nativePeakMiB:proof.nativePeakIncrementalMiB,
    completeOriginalConversions:proof.completeOriginalConversions,actualStackSymbols,cleanup:proof.cleanup}));
}
