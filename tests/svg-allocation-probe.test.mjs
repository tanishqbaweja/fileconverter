// Tiny arithmetic-only Wasm unit controls; never a Node image converter.
import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { addAllocationProbe, allocationProbePrefix, allocationProbeSites, classifyAllocationProbeFailure } from "../images/resvg-source/allocation-probe.mjs";
import { observedProbeGetter } from "../images/resvg-source/observed-binding-contract.mjs";
const text = value => Buffer.from(value);
const sized = bytes => Buffer.concat([Buffer.from([bytes.length]),bytes]);
function fixture(instrument) {
  const global = Buffer.from([2,0x7f,1,0x41,0,0x0b,0x7f,1,0x41,0,0x0b]);
  const exports = Buffer.concat([Buffer.from([3]),sized(text("run")),Buffer.from([0,0]),sized(text("site")),Buffer.from([3,0]),sized(text("value")),Buffer.from([3,1])]);
  const body = Buffer.concat([Buffer.from([1,8,0x7f,0x20,1,0x21,9,2,0x40,0x20,0]),
    instrument ? allocationProbePrefix(allocationProbeSites[0],0) : Buffer.alloc(0),Buffer.from([0x0d,0,0x41,23,0x0f,0x0b,0,0x0b])]);
  const code=Buffer.concat([Buffer.from([1]),sized(body)]);
  return Buffer.concat([Buffer.from([0,97,115,109,1,0,0,0,1,7,1,0x60,2,0x7f,0x7f,1,0x7f,3,2,1,0]),
    Buffer.from([6]),sized(global),Buffer.from([7]),sized(exports),Buffer.from([10]),sized(code)]);
}
test("injected counters preserve a pending conditional branch operand and both normal/trap outcomes in arithmetic-only Wasm", async () => {
  const a=await WebAssembly.instantiate(fixture(false)), b=await WebAssembly.instantiate(fixture(true));
  assert.equal(a.instance.exports.run(0,24000000),23); assert.equal(b.instance.exports.run(0,24000000),23);
  assert.equal(b.instance.exports.site.value,1); assert.equal(b.instance.exports.value.value,24000000);
  assert.throws(() => a.instance.exports.run(1,24000000),WebAssembly.RuntimeError);
  assert.throws(() => b.instance.exports.run(1,24000000),WebAssembly.RuntimeError);
  assert.equal(b.instance.exports.site.value,1); assert.equal(b.instance.exports.value.value,24000000);
});
test("only the exact recorded source candidate and five immutable sites can be instrumented", () => {
  assert.throws(() => addAllocationProbe(fixture(false)));
  assert.equal(allocationProbeSites.length,5); assert.ok(allocationProbeSites.every(Object.isFrozen));
  assert.throws(() => allocationProbePrefix({ site:1,local:9 },0));
  assert.throws(() => allocationProbePrefix(allocationProbeSites[0],-1));
});
test("optional getter reads actual scalar globals, returns null when absent/unvisited and never mutates them", () => {
  const read = wasm => runInNewContext(observedProbeGetter.replace("export function", "function") + "\ngetLastResvgFailureProbe();", { wasm, WebAssembly });
  assert.equal(read(undefined),null); assert.equal(read({}),null);
  const site=new WebAssembly.Global({value:"i32",mutable:true},0), value=new WebAssembly.Global({value:"i32",mutable:true},24000000);
  const wasm={__within_svg_probe_site:site,__within_svg_probe_value:value}; assert.equal(read(wasm),null);
  site.value=3; assert.equal(JSON.stringify(read(wasm)),JSON.stringify({site:3,value:24000000}));
  assert.equal(site.value,3); assert.equal(value.value,24000000);
  value.value=0; assert.equal(read(wasm).value,0,"A real observed value is not missing");
});
test("failure classification requires both the exact instrumented native trap and a valid observed site; missing does not become zero", () => {
  const proof={instrumentedTrapOffset:0x1a91ff}, stack="RuntimeError: unreachable\n at resvg::filter::get_input (http://localhost/resvg.wasm:wasm-function[532]:0x1a91ff)";
  const value=classifyAllocationProbeFailure({site:3,value:24000000},proof,stack);
  assert.equal(value.kind,"payload-allocation-null"); assert.equal(value.attemptedAllocationBytes,24000000);
  assert.equal(classifyAllocationProbeFailure(null,proof,stack),null);
  assert.equal(classifyAllocationProbeFailure({site:3,value:24000000},proof,stack.replace("1a91ff","1a9196")),null);
  assert.equal(classifyAllocationProbeFailure({site:6,value:24000000},proof,stack),null);
  assert.equal(classifyAllocationProbeFailure({site:5,value:0xffffffff},proof,stack).attemptedAllocationBytes,null);
});
