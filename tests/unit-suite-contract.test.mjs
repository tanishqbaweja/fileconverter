import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { loadUnitSuitePlan, planUnitSuites } from "../scripts/lib/unit-suite-contract.mjs";

const files=["tests/public.test.mjs","tests/private.test.mjs","tests/new.test.mjs"];
const manifest={schemaVersion:1,groups:[{id:"private-native",reason:"Needs a separately generated and hash-verified native qualification fixture.",files:[files[1]]}]};
const baseline={schemaVersion:1,files:[files[0]]};
test("new tests stay portable; explicit qualification and portable form the complete disjoint set",()=>{
  const plan=planUnitSuites(files,manifest,baseline);
  assert.deepEqual(plan.portable,[files[2],files[0]]); assert.deepEqual(plan.qualification,[files[1]]);
  assert.deepEqual([...plan.portable,...plan.qualification].sort(),plan.all);
  assert.match(plan.prerequisites[files[1]].reason,/hash-verified/);
});
test("stale, duplicate, invalid, prior-public or production-import exceptions cannot remove a gate",()=>{
  for(const mutate of [
    value=>value.groups[0].files.push(files[1]),value=>value.groups[0].files.push("tests/missing.test.mjs"),
    value=>value.groups[0].files.push("../public.test.mjs"),value=>value.groups[0].files.push(files[0]),
    value=>{value.groups[0].reason="skip it";},value=>value.groups.push(structuredClone(value.groups[0])),
  ]) {const changed=structuredClone(manifest);mutate(changed);assert.throws(()=>planUnitSuites(files,changed,baseline));}
  assert.throws(()=>planUnitSuites(files,manifest,baseline,{[files[1]]:'import { data } from "../lib/capability-registry.ts";'}));
  assert.throws(()=>planUnitSuites(files.slice(1),manifest,baseline));
});
test("actual manifest retains every one of235 prior hosted files plus current public worker/cache/save checks",async()=>{
  const root=path.resolve(import.meta.dirname,".."),plan=await loadUnitSuitePlan(root);
  assert.equal(plan.protectedPriorHostedFiles,235);assert.equal(plan.qualification.length,156);
  for(const file of ["worker-lifecycle","compiled-codec-cache","staged-save-runtime","staged-worker-coordinator",
    "encoder-plane-quality-browser","encoder-plane-bitrate-browser","encoder-plane-recovery-browser","readonly-preflight-unit"])
    assert.ok(plan.portable.includes(`tests/${file}.test.mjs`),file);
  const {stdout}=await promisify(execFile)(process.execPath,["scripts/run-unit-suite.mjs","portable","--list"],
    {cwd:root,windowsHide:true,timeout:15000,maxBuffer:131072});
  const [summary,selection]=stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  assert.equal(summary.selectedFiles,plan.portable.length);assert.deepEqual(selection.files,plan.portable);
  assert.equal(summary.publicAcceptance,false);assert.match(summary.qualificationStatus,/not-implied-passed/);
  const native=await readFile(path.join(root,"tests/lto-native-composition-qualification.test.mjs"),"utf8");
  assert.match(native,/await loadLtoBrowserNative\(root\)/);assert.match(native,/await makeLtoBrowserComposition\(root\)/);
  assert.doesNotMatch(native,/skip\s*:/);
  const current=await readFile(path.join(root,"tests/encoder-plane-current-source-qualification.test.mjs"),"utf8");
  assert.match(current,/sha\(await read\(source\)\),expected/);
  assert.ok(plan.qualification.includes("tests/lto-native-composition-qualification.test.mjs"));
  assert.ok(plan.qualification.includes("tests/encoder-plane-current-source-qualification.test.mjs"));
  await assert.rejects(promisify(execFile)(process.execPath,["scripts/run-unit-suite.mjs","portable","--skip-private"],
    {cwd:root,windowsHide:true,timeout:10000,maxBuffer:4096}),error=>error.code===1);
});
