// Bounded, perturbing allocation evidence. Not conversion acceptance or stacks.
import assert from "node:assert/strict";
import path from "node:path";
import {captureLiveMemoryInfra} from "./live-memory-infra.mjs";
export const PLATFORM_ALLOCATION_PHASES=Object.freeze(["loaded-idle","webcodecs-vp9-ready","encoder-configured","first-frame-encoded"]);
export function createPlatformVp9AllocationDiagnostic({root,runId,realms,createSession,sampleProcesses,capture=captureLiveMemoryInfra}) {
  assert.ok(path.isAbsolute(root));assert.match(runId,/^\d{8,14}$/);
  assert.equal(typeof realms.sample,"function");assert.equal(typeof realms.close,"function");
  const checkpoints=[];let busy=false,closed=false;
  return {
    report:()=>({checkpoints,maximumCaptures:4,maximumPending:1,queuedRequests:0,captureDeadlineMs:1500,
      workerCheckpointDeadlineMs:4000,perturbsMemoryAndTiming:true,noForcedGc:true,
      acceptanceMetric:false,allocationStackAttribution:false,summedAllocatorTotal:null}),
    async capture(label,metrics=null) {
      assert.equal(closed,false,"Diagnostic is closed");
      if(!PLATFORM_ALLOCATION_PHASES.includes(label))return false;
      assert.equal(busy,false,"Snapshots may not overlap or queue");
      assert.ok(checkpoints.length<4&&!checkpoints.some(row=>row.label===label),"No duplicate allocation snapshot");
      busy=true;
      const row={label,startedAt:new Date().toISOString(),finishedAt:null,metrics,processSample:null,realms:null,result:null,error:null};
      checkpoints.push(row);
      try {
        // Independent observations run together; preserve either even if its peer fails.
        const observations=await Promise.allSettled([sampleProcesses(),realms.sample()]);
        if(observations[0].status==="fulfilled")row.processSample=observations[0].value;
        if(observations[1].status==="fulfilled")row.realms=observations[1].value;
        const errors=observations.filter(x=>x.status==="rejected").map(x=>x.reason);
        if(errors.length)throw new AggregateError(errors,"Allocation observation unavailable",{cause:errors[0]});
        assert.ok(Array.isArray(row.processSample.processes)&&row.processSample.processes.length>0&&row.processSample.processes.length<=64);
        // The tracing helper owns and detaches this session, including on timeout.
        row.result=await capture({session:await createSession(),phase:label,processes:row.processSample.processes,
          captureMs:1500,archivePath:path.join(root,"evidence",`2026-11-06-webcodecs-vp9-original-allocation-${runId}-${label}.trace.json.gz`)});
        return true;
      } catch(error) {row.error=String(error.stack??error).slice(0,2048);throw error;}
      finally {row.finishedAt=new Date().toISOString();busy=false;}
    },
    close() {assert.equal(busy,false,"Cannot close an active capture");if(!closed){closed=true;realms.close();}},
  };
}
