import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { hiddenArguments, installHiddenUnitSubprocesses } from "../scripts/lib/hidden-unit-subprocesses.mjs";
test("hidden options preserve argument/options/callback overloads without mutating caller objects",()=>{
  const callback=()=>{},args=["arg"],options={cwd:"owned",windowsHide:false};
  for(const kind of ["spawn","spawnSync","fork","execFile","execFileSync"]) {
    const actual=hiddenArguments(kind,["program",args,options,callback]);
    assert.equal(actual[1],args);assert.deepEqual(actual[2],{cwd:"owned",windowsHide:true});assert.equal(actual[3],callback);
    assert.deepEqual(hiddenArguments(kind,["program",options]),["program",{cwd:"owned",windowsHide:true}]);
    assert.deepEqual(hiddenArguments(kind,["program",undefined,options]),["program",undefined,{cwd:"owned",windowsHide:true}]);
  }
  assert.deepEqual(options,{cwd:"owned",windowsHide:false});
  assert.deepEqual(hiddenArguments("execFile",["program",callback]),["program",{windowsHide:true},callback]);
  assert.deepEqual(hiddenArguments("exec",["command",options,callback]),["command",{cwd:"owned",windowsHide:true},callback]);
  assert.deepEqual(hiddenArguments("spawn",["program",[],"invalid"]),["program",[],"invalid"]);
});
test("wrappers preserve native return, custom promise semantics and failures while hiding all actual options",async()=>{
  const seen=[],expected=Symbol("return"),api={};
  for(const kind of ["spawn","spawnSync","fork","exec","execSync","execFile","execFileSync"])api[kind]=(...args)=>{seen.push({kind,args});return expected;};
  api.execFile[promisify.custom]=async(...args)=>{seen.push({kind:"promise",args});throw Object.assign(new Error("actual failure"),{code:7});};
  installHiddenUnitSubprocesses(api);
  for(const kind of Object.keys(api))assert.equal(api[kind]("program",[],{windowsHide:false}),expected);
  await assert.rejects(promisify(api.execFile)("program",[],{windowsHide:false}),error=>error.code===7);
  assert.ok(seen.every(row=>(row.kind==="exec"||row.kind==="execSync"?row.args[1]:row.args[2]).windowsHide===true));
  const actual=await promisify(execFile)(process.execPath,["-e","process.stdout.write('actual')"],{windowsHide:false,timeout:5000,maxBuffer:4096});
  assert.equal(actual.stdout,"actual");
});
