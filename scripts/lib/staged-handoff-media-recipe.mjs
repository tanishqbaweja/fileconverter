// Same actual native modules/four media+recovery cases. Change lifecycle only.
import assert from "node:assert/strict";
import path from "node:path";
import { loadDurationDrainMediaComponents } from "./duration-drain-media-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export const HANDOFF_MEDIA_FILES = ["scripts/qualify-staged-handoff-media.mjs", "scripts/lib/staged-handoff-media-caller.mjs",
  "scripts/lib/staged-handoff-media-recipe.mjs", "scripts/build-staged-handoff-candidate.mjs", "scripts/lib/staged-worker-handoff-recipe.mjs",
  "lib/staged-copy-protocol.ts", "lib/staged-worker-coordinator.ts", "workers/staged-save-runtime.ts", "workers/staged-save.worker.ts",
  "tests/staged-worker-coordinator.test.mjs", "tests/staged-save-runtime.test.mjs", "tests/staged-handoff-media-recipe.test.mjs"];
export const ebmlMediaParts = async root => (await loadDurationDrainMediaComponents(root)).ebmlMediaParts(root);
export const verifyEbmlMediaCandidate = async (root, directory) => (await loadDurationDrainMediaComponents(root)).verifyEbmlMediaCandidate(root, directory);
export function withStagedHandoffSpec(source) {
  const lifecycle = `
let handoffWorkerEvents: Array<{role:string,event:string,url:string,observedAt:number}> = [];
test.beforeEach(async ({page}) => {
  const events: typeof handoffWorkerEvents=[];handoffWorkerEvents=events;
  page.on("worker",worker=>{
    const role=worker.url().includes("/assets/staged-save.worker-")?"save":worker.url().includes("/assets/conversion.worker-")?"codec":null;
    if(!role)return;
    const record=(event:string)=>{expect(events.length).toBeLessThan(32);events.push({role,event,url:worker.url().slice(0,512),observedAt:Date.now()});};
    record("created");worker.once("close",()=>record("closed"));
  });
});
test.afterEach(async()=>{rows.push({kind:"actual-staged-worker-handoff-lifecycle",events:[...handoffWorkerEvents],
  observedEventsNotPhysicalMemoryReleaseProof:true,publicAcceptance:false});});
`;
  return exactPatch(source, [
    [source, source + lifecycle],
    ["expect(state.metrics?.wasmMemoryBytes).toBe(expectedMemoryBytes);", `if(adapter.destination === "direct") {
        expect(state.metrics?.wasmMemoryBytes).toBe(0);
        expect(state.metrics?.sharedArrayBufferBytes).toBe(4);
      } else expect(state.metrics?.wasmMemoryBytes).toBe(expectedMemoryBytes);`],
  ]);
}
export function withStagedHandoffDriver(source, root, stamp) {
  assert.equal(typeof root, "string"); assert.match(stamp, /^\d{4}-\d\d-\d\dT[\d-]+Z$/);
  const marker = '  await exec(process.execPath, [';
  const start = source.indexOf(marker, source.indexOf('const environment = ')); assert.ok(start > 0);
  const builder = `  handoffBuildStarted=true;
  await exec(process.execPath,["scripts/build-staged-handoff-candidate.mjs",${JSON.stringify(stamp)},"--for-browser"],
    {cwd:root,env:environment,windowsHide:true,timeout:180000,maxBuffer:2097152});
`;
  const replaced = source.slice(0, start) + builder + source.slice(start);
  return exactPatch(source, [
    [source, replaced],
    ["let runtime, server, runner, staged = false;", "let runtime, server, runner, staged = false, handoffBuildStarted=false;"],
    ["  } finally { if (runtime) await runtime.close(); }", `  } finally {
    try { if(handoffBuildStarted)await exec(process.execPath,["node_modules/vinext/dist/cli.js","build"],
      {cwd:root,env:runtime?.env,windowsHide:true,timeout:180000,maxBuffer:2097152}); }
    finally { if(runtime)await runtime.close(); }
  }`],
  ]);
}
export async function makeEbmlMediaBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  const parent = await (await loadDurationDrainMediaComponents(root)).makeEbmlMediaBrowserRecipe(sources, root, runtime, stamp, branch, build);
  const spec = withStagedHandoffSpec(parent.spec), driver = withStagedHandoffDriver(parent.driver, root, stamp);
  return { ...parent, spec: spec.generated, driver: driver.generated,
    handoffLifecycle: { specEdits: spec.edits, driverEdits: driver.edits,
      buildProofPath: `evidence/${stamp}-staged-worker-handoff-build.json`, nativeSettingsUnchanged: true,
      currentWasmReleasedAtSaveWorker: true, nativePeakWasmGateUnchanged: true, fullMemoryAcceptance: false, publicAcceptance: false } };
}
export async function inspectEbmlMediaReport(report, baseline, build) {
  const components = await loadDurationDrainMediaComponents(path.resolve(import.meta.dirname, "../.."));
  const previous = await components.inspectEbmlMediaReport(report, baseline, build);
  const events = report.rows.filter(row => row.kind === "actual-staged-worker-handoff-lifecycle"); assert.equal(events.length, 4);
  for (const row of events) {
    assert.ok(row.events.length <= 32); assert.equal(row.observedEventsNotPhysicalMemoryReleaseProof, true);
    for (const saver of row.events.filter(event => event.role === "save" && event.event === "created")) {
      assert.ok(row.events.some(event => event.role === "codec" && event.event === "closed"));
      assert.ok(row.events.some(event => event.role === "save" && event.event === "closed" && event.url === saver.url));
    }
  }
  assert.ok(events.flatMap(row => row.events).filter(event => event.role === "save" && event.event === "created").length >= 4);
  return { ...previous, actualHandoffLifecycleRows: events, currentSaveWorkerWasmBytes: 0,
    nativePeakWasmBytes: 50331648, physicalReleaseBeforeCopyProven: false, fullOriginalAcceptance: false, publicAcceptance: false };
}
