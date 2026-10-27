// Immutable build inputs; never conversion data and never public acceptance.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sha } from "./source-pins.mjs";
import { compileContract } from "./compile-contract.mjs";
export const rawInput = Object.freeze(JSON.parse(readFileSync(new URL("./raw-candidate-input.json", import.meta.url), "utf8")));
export const bindgenTool = Object.freeze(JSON.parse(readFileSync(new URL("./bindgen-toolchain.json", import.meta.url), "utf8")));
export const experimentalMaximumBytes = 96 * 1024 ** 2;
export const publishedSha256 = "22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70";
export function verifyBindgenVersion(version) {
  assert.equal(version, `wasm-bindgen ${bindgenTool.version} (${bindgenTool.sourceCommit.slice(0, 9)})`, "Exact pinned tool version and embedded source revision");
}
export function verifySourceReceipt(bytes) {
  assert.equal(bytes.length, rawInput.receiptBytes); assert.equal(sha(bytes), rawInput.receiptSha256);
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.executedHead, rawInput.headSha); assert.equal(String(receipt.runId), String(rawInput.runId));
  assert.equal(receipt.sourceCompilationAttempted, true); assert.equal(receipt.sourceCompilationSucceeded, true);
  assert.equal(receipt.ownedScratchRemoved, true); assert.deepEqual(receipt.failures, []);
  assert.equal(receipt.rustcVersion, compileContract.rustcVersion);
  assert.equal(receipt.lock.sha256, rawInput.lockSha256); assert.equal(receipt.rawWasm.sha256, rawInput.wasmSha256);
  assert.equal(receipt.rawWasm.bytes, rawInput.wasmBytes);
  const command = receipt.commands.at(-1);
  assert.equal(command.command, "rustup"); assert.deepEqual(command.args, [...compileContract.command]);
  assert.equal(command.exitCode, 0); assert.equal(command.signal, null);
  return receipt;
}
export function requireArtifactMembers(names) {
  assert.deepEqual([...names].sort(), [rawInput.receiptMember, rawInput.lockMember, rawInput.wasmMember].sort(), "Exact three-member artifact, no extras, duplicates or paths");
}
export function compareStaticAbi(published, candidate) {
  const list = bytes => {
    assert.ok(bytes.length <= 16 * 1024 ** 2 && WebAssembly.validate(bytes));
    const wasm = new WebAssembly.Module(bytes);
    return { imports: WebAssembly.Module.imports(wasm).map(row => `${row.module}:${row.name}:${row.kind}`).sort(),
      exports: WebAssembly.Module.exports(wasm).map(row => `${row.name}:${row.kind}`).sort() };
  };
  const a = list(published), b = list(candidate);
  const difference = (x, y) => x.filter(value => !y.includes(value));
  return { publishedImports: a.imports.length, candidateImports: b.imports.length,
    publishedExports: a.exports.length, candidateExports: b.exports.length,
    missingImports: difference(a.imports, b.imports), addedImports: difference(b.imports, a.imports),
    missingExports: difference(a.exports, b.exports), addedExports: difference(b.exports, a.exports),
    namesAndKindsEqual: JSON.stringify(a) === JSON.stringify(b),
    functionSignaturesOrRuntimeCompatibilityProven: false, instantiated: false };
}
