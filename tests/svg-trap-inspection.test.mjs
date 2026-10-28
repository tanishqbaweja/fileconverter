import assert from "node:assert/strict";
import test from "node:test";
import { inspectWasmTrap } from "../images/resvg-source/trap-inspection.mjs";
const wasm = Buffer.from([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,5,1,3,0,0,11]);
test("static decoder matches a real unreachable instruction at its exact function/file offset without executing Wasm", () => {
  const result = inspectWasmTrap(wasm,0,23);
  assert.equal(result.functionIndex,0); assert.equal(result.trapOffset,23);
  assert.equal(result.nativeExecution,false); assert.equal(result.sourceAllocationCauseProven,false);
  assert.ok(result.window.some(row => row.offset === 23 && row.id === "unreachable"));
});
test("static decoder rejects a wrong function, end instruction, zero header byte or malformed Wasm", () => {
  assert.throws(() => inspectWasmTrap(wasm,1,23));
  assert.throws(() => inspectWasmTrap(wasm,0,24));
  assert.throws(() => inspectWasmTrap(wasm,0,22));
  const corrupt = Buffer.from(wasm); corrupt[0]=1;
  assert.throws(() => inspectWasmTrap(corrupt,0,23));
});
