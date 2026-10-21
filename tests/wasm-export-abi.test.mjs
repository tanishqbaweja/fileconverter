import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readEmscriptenExportAbi } from "../scripts/lib/wasm-export-abi.mjs";

// Valid tiny modules, never instantiated. The production binaries strip names.
function fixture(count, imported = false) {
  const name = text => [text.length, ...Buffer.from(text)];
  const section = (id, body) => [id, body.length, ...body];
  const type = section(1, [1, 96, count, ...Array(count).fill(127), 1, 127]);
  const imports = imported ? section(2, [1, ...name("env"), ...name("noop"), 0, 0]) : [];
  const functions = section(3, [1, 0]), exported = section(7, [1, ...name("ma"), 0, imported ? 1 : 0]);
  const code = section(10, [1, 4, 0, 65, 0, 11]);
  return Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0, ...type, ...imports, ...functions, ...exported, ...code]);
}
const binding = 'Module["_within_remux"]=wasmExports["ma"]';
test("static ABI reader distinguishes real12/general and9/specialist with imported function offsets", () => {
  for (const count of [9, 12]) for (const imported of [false, true]) {
    const actual = readEmscriptenExportAbi(binding, fixture(count, imported));
    assert.equal(actual.parameterCount, count); assert.deepEqual(actual.parameters, Array(count).fill(127));
    assert.deepEqual(actual.results, [127]);
  }
});
test("static ABI reader refuses absent/ambiguous bindings, invalid modules and absent exports", () => {
  for (const source of ["", binding + ";" + binding, binding.replace('"ma"', '"missing"')])
    assert.throws(() => readEmscriptenExportAbi(source, fixture(12)));
  assert.throws(() => readEmscriptenExportAbi(binding, fixture(12).slice(0, -1)));
  assert.throws(() => readEmscriptenExportAbi(binding, fixture(12), "bad[regex]"));
});
test("actual shipped general and specialist binary signatures match audited calling conventions", async () => {
  for (const [name, count] of [["within-remux", 12], ["within-vp9", 9], ["within-mpeg4", 9]]) {
    const [module, wasm] = await Promise.all([readFile(`public/engines/remux/${name}.mjs`, "utf8"), readFile(`public/engines/remux/${name}.wasm`)]);
    assert.equal(readEmscriptenExportAbi(module, wasm).parameterCount, count, name);
  }
});
