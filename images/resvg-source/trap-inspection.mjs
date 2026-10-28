// Static source-artifact inspection only: never instantiate or render Wasm.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { decode } = createRequire(import.meta.url)("@webassemblyjs/wasm-parser");
export function inspectWasmTrap(bytes, functionIndex, offset) {
  assert.ok(bytes.length > 8 && bytes.length <= 16 * 1024 ** 2);
  assert.ok(Number.isSafeInteger(functionIndex) && functionIndex >= 0 && functionIndex <= 10000);
  assert.ok(Number.isSafeInteger(offset) && offset >= 8 && offset < bytes.length);
  assert.equal(bytes[offset], 0, "Native stack offset must identify the exact unreachable opcode");
  assert.ok(WebAssembly.validate(bytes));
  const ast = decode(bytes, { dump: false, ignoreDataSection: true });
  const fields = ast.body[0].fields, functions = fields.filter(row => row.type === "Func");
  const selected = functions.filter(row => (row.name.numeric ?? row.name.value) === "func_" + functionIndex);
  assert.equal(selected.length, 1, "Exact Wasm function index required");
  const func = selected[0], instructions = []; let visited = 0;
  const walk = (value, depth = 0) => {
    assert.ok(depth <= 256 && ++visited <= 500000, "Bounded selected-function traversal");
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const child of value) walk(child, depth + 1); return; }
    const at = value.loc?.start?.column;
    if (Number.isSafeInteger(at) && ["Instr", "CallInstruction", "CallIndirectInstruction"].includes(value.type)) {
      instructions.push({ offset: at, type: value.type, id: value.id, object: value.object ?? null,
        index: value.index?.value ?? null, args: (value.args ?? []).map(arg => arg.value ?? arg.id ?? null) });
    }
    for (const [key, child] of Object.entries(value)) if (key !== "loc") walk(child, depth + 1);
  };
  walk(func.body); instructions.sort((a,b) => a.offset - b.offset);
  const match = instructions.findIndex(row => row.offset === offset && row.id === "unreachable");
  assert.ok(match >= 0, "Exact AST unreachable location, not a nearby zero byte");
  return { functionIndex, name: func.name.value, functionLocation: func.loc ?? null, trapOffset: offset,
    window: instructions.slice(Math.max(0, match - 24), match + 5), instructionCount: instructions.length,
    nativeExecution: false, sourceAllocationCauseProven: false };
}
