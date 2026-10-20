import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import report from "../scripts/lib/unit-inventory-reporter.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";

test("diagnostic reporter consumes all outcomes, bounds failure examples and retains truthful skips/summary", async () => {
  const runtime = await createOwnedRuntimeScratch("unit-reporter-test-"), previous = process.env.WITHIN_UNIT_INVENTORY_REPORT;
  try {
    const output = path.join(runtime.directory,"inventory.json"); process.env.WITHIN_UNIT_INVENTORY_REPORT = output;
    const file = path.resolve("tests/example.test.mjs"), summary = { counts:{passed:1,failed:5,skipped:1},success:false };
    async function* events() {
      yield {type:"test:pass",data:{file,name:"pass"}};
      yield {type:"test:pass",data:{file,name:"not executed",skip:"requires private fixture"}};
      for(let index=0;index<5;index++) yield {type:"test:fail",data:{file,name:"failure"+index,nesting:0,
        details:{error:{failureType:"testCodeFailure",cause:{code:"ENOENT",message:"x".repeat(4096)}}}}};
      yield {type:"test:summary",data:summary};
    }
    let stdout=""; for await(const line of report(events())) stdout+=line;
    const value=JSON.parse(await readFile(output)); assert.equal(value.allEventsConsumed,true);
    assert.deepEqual(value.summaries,[summary]); assert.equal(value.files.length,1);
    const row=value.files[0]; assert.equal(row.passed,1); assert.equal(row.failed,5); assert.equal(row.skipped,1);
    assert.equal(row.examples.length,3); assert.ok(row.examples.every(example=>example.message.length===2048 && example.code==="ENOENT"));
    assert.equal(JSON.parse(stdout).failingFiles,1); assert.equal(JSON.parse(stdout).skippedCases,1);
    await assert.rejects(async()=>{for await(const line of report(events())) void line;},{code:"EEXIST"});
  } finally {
    if(previous===undefined) delete process.env.WITHIN_UNIT_INVENTORY_REPORT; else process.env.WITHIN_UNIT_INVENTORY_REPORT=previous;
    await runtime.close(); await assert.rejects(access(runtime.directory),{code:"ENOENT"});
  }
});

test("real hidden node runner loads reporter by file URL, preserves failed exit and reports the skipped case", async () => {
  const runtime = await createOwnedRuntimeScratch("unit-reporter-child-");
  try {
    const output = path.join(runtime.directory,"child-inventory.json"), environment = { ...runtime.env, WITHIN_UNIT_INVENTORY_REPORT:output };
    delete environment.NODE_TEST_CONTEXT;
    await assert.rejects(promisify(execFile)(process.execPath,["--test",
      "--test-reporter="+pathToFileURL(path.resolve("scripts/lib/unit-inventory-reporter.mjs")).href,
      "tests/fixtures/unit-inventory-diagnostic.mjs"],{env:environment,windowsHide:true,timeout:10000,maxBuffer:65536}),error=>error.code===1);
    const value = JSON.parse(await readFile(output)); assert.equal(value.allEventsConsumed,true);
    assert.equal(value.files.length,1); const row=value.files[0];
    assert.equal(row.passed,1); assert.equal(row.failed,1); assert.equal(row.skipped,1);
    assert.equal(row.examples[0].code,"DIAGNOSTIC_EXPECTED");
    assert.equal(value.summaries.at(-1).success,false);
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory),{code:"ENOENT"}); }
});
