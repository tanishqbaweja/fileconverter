import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),
  base="evidence/2026-11-06-webcodecs-vp9-original-startup-42231818045",r=await json(base+".json");
test("actual original platform path encodes94frames but whole-Chrome335MiB forces failure and cancellation, never full conversion acceptance",()=>{
  assert.equal(r.executedHead,"bb1edb14050d722065265875d750871e096e0c46");assert.equal(r.nativeTool.runId,42231818045);
  assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.browserResult.sourceFileBytes,2958573265);
  assert.equal(r.browserResult.sourceCopied,false);assert.equal(r.browserResult.nativeBrowserPlatformOnly,true);assert.equal(r.browserResult.nativeBrowserCpuOnly,false);
  const e=r.browserResult.encoder;assert.equal(e.frames,94);assert.equal(e.packets,94);assert.equal(e.framesClosed,94);
  assert.equal(e.supportProbeCount,2);assert.equal(e.hardwarePreferredSupported,false);assert.equal(e.selectedHardwarePreference,"no-preference");
  assert.equal(e.physicalHardwareSelectionProven,false);assert.equal(e.peakPackedBytes,2315520);assert.equal(e.peakPacketBytes,247789);
  assert.equal(e.maximumFramesInFlight,1);assert.equal(e.maximumPacketsInFlight,1);assert.equal(e.currentPackedBytes,0);assert.equal(e.pendingPacketBytes,0);
  assert.equal(r.browserResult.metrics.wasmMemoryBytes,33554432);assert.equal(r.browserResult.metrics.sharedArrayBufferBytes,4);
  assert.equal(r.blankBaseline.privateBytes,348413952);assert.equal(r.memory.peak.privateBytes,700108800);
  assert.equal(r.memory.incrementalPrivateMiB,335.40234375);assert.equal(r.memory.validSamples,23);assert.equal(r.memory.unavailableSamples,0);
  assert.equal(r.memory.incrementalPrivateMiB,(r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576);
  assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");assert.equal(r.originalStartup.cancellationRequested,true);
  assert.equal(r.originalStartup.fullOriginalConverted,false);assert.equal(r.originalStartup.independentFullFidelityPassed,false);
  assert.equal(r.browserResult.partialOutputBytes,0);assert.equal(r.browserResult.metrics.outputBytes,485);
  assert.equal(r.publicAcceptance,false);assert.equal(r.speedGainProven,false);
});
test("process localization retains every peak byte and unknown allocator ownership, not a fake smaller metric or frame-leak claim",async()=>{
  const a=await json("evidence/2026-11-06-webcodecs-vp9-original-memory-localization.json");
  assert.equal(a.primary.incrementalPrivateMiB,335.40234375);assert.equal(a.primary.excessBytes,89550848);
  assert.equal(a.processes.length,10);assert.equal(a.processes.reduce((n,p)=>n+p.peakPrivateBytes,0),700108800);
  assert.equal(a.primary.allPeakProcessBytesIncluded,true);
  assert.equal(a.largestRenderer.pid,34644);assert.equal(a.largestRenderer.typeFromSameBirthLoadedCensus,"renderer");
  assert.equal(a.largestRenderer.peakPrivateBytes,337477632);assert.equal(a.largestRenderer.loadedIdlePrivateBytes,46116864);
  assert.equal(a.largestRenderer.deltaFromLoadedBytes,291360768);
  assert.equal(a.loadedDeltasAreDiagnosticNotAcceptance,true);assert.equal(a.nativeCodecAllocationOwners,null);
  assert.equal(a.jsRealmHeapOwnership,null);assert.equal(a.frameLeakProven,false);assert.equal(a.publicAcceptance,false);
});
test("cancelled original output/profile/stage removed and source unchanged, raw diagnostics retained losslessly",async()=>{
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.equal(r.browserResult.cleanupComplete,true);
  assert.ok(r.processCleanup.length===3&&r.processCleanup.every(p=>p.status==="owned-identity-absent"));
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(r.forbiddenRequests,[]);assert.equal(r.failures.length,1);assert.match(r.failures[0],/exceeded exact250MiB/);
  const raw=gunzipSync(await read(r.rawArchive.file),{maxOutputLength:8388608});assert.equal(raw.length,273374);
  assert.equal(createHash("sha256").update(raw).digest("hex"),r.rawArchive.decodedSha256);
  assert.equal((await json("evidence/2026-11-06-webcodecs-vp9-original-startup-control-42231818045-archive.json")).retainedBytes,98774);
});
