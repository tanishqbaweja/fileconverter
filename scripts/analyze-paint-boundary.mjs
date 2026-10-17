import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, writeFile, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { inspectWarmCacheFailure } from "./lib/warm-cache-observation.mjs";
import { PAINT_BOUNDARY_CSS, PAINT_BASE_CSS, PAINT_VISUAL_PROOF } from "./lib/paint-boundary-candidate.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const unpack=async record=>{const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
  const raw=gunzipSync(zip,{maxOutputLength:33554432});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);return raw;};
const terminalPath="evidence/2026-10-17T16-43-32-372Z-paint-boundary-control-terminal.json",terminalBytes=await read(terminalPath),terminal=JSON.parse(terminalBytes);
const priorPath="evidence/2026-10-17T04-17-55-073Z-warm-cache-control-terminal.json",priorBytes=await read(priorPath),prior=JSON.parse(priorBytes);
const report=JSON.parse(await unpack(terminal.report)),priorReport=JSON.parse(await unpack(prior.report));
const buildBytes=await read(terminal.build.path),priorBuildBytes=await read(prior.build.path);
assert.equal(sha(buildBytes),terminal.build.sha256);assert.equal(sha(priorBuildBytes),prior.build.sha256);
const build=JSON.parse(buildBytes),priorBuild=JSON.parse(priorBuildBytes);
const analysis=inspectWarmCacheFailure(terminal,report,priorReport,build,priorBuild);
assert.equal(report.progressProbe.paintBoundaryCandidate.css,PAINT_BOUNDARY_CSS);
assert.equal(report.progressProbe.paintBoundaryCandidate.cssSha256,sha(PAINT_BOUNDARY_CSS));
assert.equal(report.progressProbe.paintBoundaryCandidate.nativeChanged,false);
assert.equal(report.progressProbe.paintBoundaryCandidate.progressChanged,false);
assert.ok(report.cssCandidate.css.endsWith(PAINT_BOUNDARY_CSS));
const beforeCss=report.cssCandidate.css.slice(0,-PAINT_BOUNDARY_CSS.length),afterCss=PAINT_BASE_CSS+report.cssCandidate.css;
assert.equal(sha(PAINT_BASE_CSS+beforeCss),priorReport.progressProbe.expectedStylesheet.afterSha256);
assert.equal(sha(afterCss),report.progressProbe.expectedStylesheet.afterSha256);
assert.equal(Buffer.byteLength(afterCss),report.progressProbe.expectedStylesheet.afterBytes);
assert.equal(Buffer.byteLength(PAINT_BOUNDARY_CSS),95);
assert.equal(report.cssCandidate.staticAssets.length,1);
assert.equal(report.cssCandidate.staticAssets[0].afterSha256,sha(afterCss));
const source=await materializeUpdatedFullArchive(root,terminal.sourceArchive);
assert.equal(Object.keys(source.pins).length,791);assert.deepEqual(source.pins,terminal.sourcePins);
assert.deepEqual(source.pins,terminal.postSourcePins);assert.deepEqual(source.pins,report.sourceHashes);
for(const[file,digest]of Object.entries(source.pins))assert.equal(sha(await read(file)),digest,file);
const visualBytes=await read(PAINT_VISUAL_PROOF),visual=JSON.parse(visualBytes);
assert.equal(sha(visualBytes),source.pins[PAINT_VISUAL_PROOF]);assert.equal(visual.css,PAINT_BOUNDARY_CSS);
assert.equal(visual.status,"passed-component-only-paint-boundary-pixels-and-geometry");assert.equal(visual.conversions,0);
assert.equal(visual.cases.length,12);assert.equal(visual.failure,null);assert.deepEqual(visual.cleanupErrors,[]);
for(const row of visual.cases){for(const key of["exactPixels","exactGeometry","textPreserved","noOverflow"])assert.equal(row[key],true);
  assert.equal(row.pngBeforeSha256,row.pngAfterSha256);for(const image of row.images??[]){const bytes=await read(image.path);assert.equal(bytes.length,image.bytes);assert.equal(sha(bytes),image.sha256);}}
const recovered=JSON.parse(await read("evidence/2026-10-17-paint-boundary-visual-recovery.json"));
for(const row of recovered.rows){await unpack(row.source);assert.equal(row.directoryRemoved,true);await assert.rejects(access(row.directory),{code:"ENOENT"});}
const rejected=[];
for(const file of["evidence/2026-10-17-panel-layout-visual.json","evidence/2026-10-17-card-layout-visual.json"]){
  const bytes=await read(file),row=JSON.parse(bytes);assert.equal(row.status,"failed-component-only-paint-boundary-visual");assert.equal(row.runtimeRemoved,true);
  await assert.rejects(access(row.runtimeDirectory),{code:"ENOENT"});rejected.push({path:file,sha256:sha(bytes),cases:row.cases.length,pixelFailure:row.pixelFailure?.changedPixels??null,message:row.failure.message.slice(0,512)});
}
const buildSource=JSON.parse(await unpack(build.sourceArchive));assert.deepEqual(buildSource.sourcePins,build.sourcePins);assert.deepEqual(build.sourcePins,build.postSourcePins);
for(const[file,digest]of Object.entries(build.sourcePins)){assert.equal(sha(Buffer.from(buildSource.preimages[file],"base64")),digest);assert.equal(sha(await read(file)),digest);}
for(const asset of[...build.assets,build.stylesheet]){const bytes=await unpack(asset.archive);assert.equal(bytes.length,asset.bytes);assert.equal(sha(bytes),asset.sha256);}
const helper=report.progressProbe.successfulSaveControl.provenance;assert.equal(sha(await unpack(helper.archive)),helper.generatedJavascriptSha256);
const trace=report.rendererAttributionResult.sessions[0].trace.trace;assert.equal(path.dirname(trace.rawArchive.path),path.join(root,"outputs/reports"));
const traceZip=await readFile(trace.rawArchive.path);assert.equal(sha(traceZip),trace.rawArchive.sha256);const traceRaw=gunzipSync(traceZip,{maxOutputLength:16777216});
assert.equal(sha(traceRaw),trace.sha256);assert.equal(traceRaw.length,trace.serializedBytes);
const directories=[terminal.wrapper,terminal.candidateDirectory,terminal.callerRuntimeDirectory,report.runtimeDirectory,report.cleanup.completedSaveFixture.fixtureDirectory,visual.runtimeDirectory];
for(const directory of directories){assert.ok(directory.startsWith(path.join(root,"work")+path.sep));await assert.rejects(access(directory),{code:"ENOENT"});}
const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command","ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress"],{windowsHide:true,timeout:15000,maxBuffer:2097152});
const current=JSON.parse(stdout),births=terminal.treeCleanupAudit.recordedBirths.map(identity=>{const live=current.find(row=>row.pid===identity.pid);
  assert.ok(!live||Math.abs(Date.parse(live.createdAt)-Date.parse(identity.createdAt))>1);return{identity,status:live?"owned-birth-absent-reused-pid-no-action":"owned-birth-absent"};});
for(const absence of visual.sampledBirthAbsences){assert.equal(absence.status,"owned-identity-absent");const live=current.find(row=>row.pid===absence.identity.pid);assert.ok(!live||Math.abs(Date.parse(live.createdAt)-Date.parse(absence.identity.createdAt))>1);}
for(const row of current)assert.ok(!directories.some(directory=>row.commandLine?.toLowerCase().includes(directory.toLowerCase())));
assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")),"f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const original=path.join(root,"test.mkv"),stat=await lstat(original);assert.equal(stat.size,2958573265);assert.ok(stat.isFile()&&!stat.isSymbolicLink());
const hash=createHash("sha256");for await(const data of createReadStream(original,{highWaterMark:1048576}))hash.update(data);const originalSha256=hash.digest("hex");assert.equal(originalSha256,report.source.sha256);
const checkpoint=report.nativeMemory.durableCheckpoint.file;assert.equal(path.dirname(checkpoint),path.join(root,"outputs/reports"));
const rawCheckpoint=await readFile(checkpoint),zippedCheckpoint=gzipSync(rawCheckpoint,{level:9});assert.deepEqual(JSON.parse(rawCheckpoint).native.identities,report.nativeMemory.identities);
await writeFile(checkpoint+".gz",zippedCheckpoint,{flag:"wx"});assert.deepEqual(gunzipSync(await readFile(checkpoint+".gz")),rawCheckpoint);await rm(checkpoint);
const ownSources={};for(const file of["scripts/analyze-paint-boundary.mjs","scripts/lib/warm-cache-observation.mjs","tests/paint-boundary-observation.test.mjs"]){const bytes=await read(file);ownSources[file]={sha256:sha(bytes),preimage:bytes.toString("base64")};}
const result={recordedAt:new Date().toISOString(),status:"card-layout-candidate-rejected-as-memory-fix",analysis,ownSources,
  terminal:{path:terminalPath,sha256:sha(terminalBytes)},prior:{path:priorPath,sha256:sha(priorBytes)},all791ExecutedCurrentPostPinsEqual:true,
  visual:{path:PAINT_VISUAL_PROOF,sha256:sha(visualBytes),cases:12,componentOnly:true,conversions:0,headedManualValidation:false},rejectedVisuals:rejected,
  report:terminal.report,build:terminal.build,sourceArchive:terminal.sourceArchive,births,visualBirthsChecked:visual.sampledBirthAbsences.length,
  original:{bytes:stat.size,sha256:originalSha256},checkpoint:{path:path.relative(root,checkpoint+".gz").replaceAll(path.sep,"/"),bytes:zippedCheckpoint.length,sha256:sha(zippedCheckpoint),restoredBytes:rawCheckpoint.length,restoredSha256:sha(rawCheckpoint),rawRemoved:true},
  cssAddedBytes:95,cssDeliveredSha256:sha(afterCss),speedGainProven:false,normalProductSourceChanged:false,
  nextAction:"Reject card layout containment as the current memory fix. Do not repeat it or full stress unchanged. Evaluate the distinct combination of bounded compiled-module reuse and previously JSX/fidelity-qualified display-tree memoization against the unchanged six-output/adverse suite; do not infer a causal gain from cross-session timing.",
  publicAcceptance:false,fullOriginalAcceptance:false};
const file="evidence/2026-10-17-paint-boundary-independent-analysis.json";await writeFile(path.join(root,file),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({file,rejectedPeakMiB:analysis.peakIncrementalPrivateMiB,sourceCount:791,birthsChecked:births.length,originalSha256}));
