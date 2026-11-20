import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { transform } from "esbuild";
import { makeVp9CpuSpecialistQualificationSource } from "../scripts/lib/vp9-cpu-specialist-qualification-recipe.mjs";
const parent = JSON.parse(await readFile("evidence/2026-11-06-vp9-token-packed-http-qualification-42244170876-attempt2-recipe.json"));
const source = gunzipSync(Buffer.from(parent.generatedSourceGzipBase64, "base64"), {maxOutputLength:1048576}).toString();
const root = path.resolve(import.meta.dirname,".."), runId="44735542199";
test("specialist browser derivation reverses exactly to the actual full fallback/fidelity/recovery HTTP control",async()=>{
  const r=makeVp9CpuSpecialistQualificationSource(source,root,runId);let reversed=r.generated;
  for(const [before,after]of r.edits.toReversed()){assert.equal(reversed.split(after).length,2);reversed=reversed.replace(after,before);}
  assert.equal(reversed,source);assert.equal(r.parentSha256,parent.generatedSha256);
  await transform(r.generated,{loader:"js",format:"esm"});
  for(const setting of ['implementation: "automatic"','fallbackCore: "single-thread"','maxWidth: 320, bitRateBps: 600000, frameRateFps: 24',
    'report.memory.incrementalPrivateMiB <= 250','peaks.unavailableSamples === 0','qualifyVp9Recovery({ page, observer',
    'report.storedTiming.output.blocks.length, 48','"82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b"',
    'childrenStarted, 2','candidateTerminationRequestedBeforeFallback, true','normalHttpEngineDelivery=true',
    'screenshots: true, snapshots: false','javascript: 6, wasm: 6']) assert.ok(r.generated.includes(setting),setting);
  for(const name of ['encodingSettingsChanged','strictFidelityOrRecoveryGatesChanged','memoryFormulaOrBaselineChanged',
    'browserServicesDisabled','browserValidated','speedGainProven','fullOriginalOrPublicAcceptance'])assert.equal(r[name],false);
});
test("private native identity cannot alias the packed baseline or use an arbitrary unreviewed parent",()=>{
  for(const changed of [source+"\n",source.replace('bitRateBps: 600000','bitRateBps: 100000')])assert.throws(()=>makeVp9CpuSpecialistQualificationSource(changed,root,runId));
  for(const id of ['42244170876','../44735542199','x'])assert.throws(()=>makeVp9CpuSpecialistQualificationSource(source,root,id));
  const r=makeVp9CpuSpecialistQualificationSource(source,root,runId);
  assert.ok(r.generated.includes('"cpu-specialist")'));assert.ok(r.generated.includes('2026-11-20-vp9-cpu-specialist-native-'+runId+'.json'));
  assert.equal(r.generated.includes('42244170876'),false);
});
test("all observed native browser births must be reconciled before either static stage or runtime can be removed",()=>{
  const r=makeVp9CpuSpecialistQualificationSource(source,root,runId);
  assert.ok(r.generated.includes('identities=report.nativeMemory?.identities??[]'));
  assert.ok(r.generated.includes('reconcileChromiumBirths({identity:chromeBirth,observedPids'));
  assert.ok(r.generated.includes('runtimeRemovalAllowed: browserIdentitiesAbsent()&&report.processCleanup.every'));
  assert.equal(r.generated.includes('[[chrome, chromeBirth], [server, serverBirth]]'),false);
  assert.ok(r.generated.includes('await stopKnown(server,serverBirth)'));
  assert.equal(r.observedBrowserBirthCleanupRequired,true);
});
