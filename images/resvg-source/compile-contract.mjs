import assert from "node:assert/strict";
import { pins, sha, inspectCandidateLock } from "./source-pins.mjs";
export const compileContract = Object.freeze({
  nightlyManifestUrl: "https://static.rust-lang.org/dist/2023-12-11/channel-rust-nightly.toml",
  nightlyManifestSha256: "14e086a5312b0dc8bfbe5d91957eaec3a972261937547779327451a7c82fe6cf",
  rustcVersion: "rustc 1.76.0-nightly (d86d65bbc 2023-12-10)",
  lockSha256: "f420db19c74bdeae19de5bad2f0a7f02628f65a8dea5c4221b0b183a76f17b03",
  maxRawWasmBytes: 16 * 1024 * 1024,
  command: Object.freeze(["run", pins.compilerToolchain, "cargo", "build", "--locked", "--release", "--lib", "--target", "wasm32-unknown-unknown", "--jobs", "2"]),
});
export function verifyCompileLock(bytes) {
  assert.equal(sha(bytes), compileContract.lockSha256, "Reuse exact successful candidate lock, never re-resolve it during compilation");
  return inspectCandidateLock(bytes.toString());
}
export function inspectRawWasm(bytes) {
  assert.ok(bytes.length > 8 && bytes.length <= compileContract.maxRawWasmBytes, "Bounded pre-bindgen compiler artifact");
  assert.ok(WebAssembly.validate(bytes), "Compiler must produce a real structurally valid Wasm module");
  const wasm = new WebAssembly.Module(bytes);
  return { bytes: bytes.length, sha256: sha(bytes), structurallyValid: true,
    importCount: WebAssembly.Module.imports(wasm).length, exportCount: WebAssembly.Module.exports(wasm).length,
    stage: "raw-before-wasm-bindgen-processing-not-browser-engine", executed: false };
}
