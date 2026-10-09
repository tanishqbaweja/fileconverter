// Supplement exact fatal opcode evidence with bounded static argument flow.
// No Wasm instance, media, malloc invocation, browser or production mutation.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createStaticFunctionSlice } from "./lib/wasm-static-function-slice.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const inputPath = "evidence/progress-full-aligned-callsite-2026-10-10.json", inputBytes = await read(inputPath), input = JSON.parse(inputBytes);
assert.equal(input.failure, null); const expected = input.inspection;
const binary = await read(expected.binary.path); assert.equal(sha(binary), expected.binary.sha256);
const oldAllocatorPath = "output/playwright/2026-10-08T07-27-40-370Z-late-dlmalloc-static.json";
const oldAllocatorBytes = await read(oldAllocatorPath), allocatorProof = JSON.parse(oldAllocatorBytes);
assert.deepEqual(allocatorProof.inspection.binary, expected.binary);
const allocator = allocatorProof.inspection.selectedFunctions.emscripten_builtin_malloc;
assert.equal(sha(allocator.text), allocator.sha256);
const actualAllocator = readWasmFunctionMetadata(binary, new Set(["emscripten_builtin_malloc"]))[0];
assert.deepEqual(actualAllocator, allocator.originalMetadata);
assert.equal(sha(binary.subarray(actualAllocator.bodyStart, actualAllocator.bodyEnd)), allocator.originalBodySha256);
const slice = createStaticFunctionSlice(binary, new Set(["__wrap_posix_memalign"]));
assert.equal(slice.instantiated, false); const selected = slice.metadata[0];
assert.equal(sha(binary.subarray(selected.bodyStart, selected.bodyEnd)), expected.functions.__wrap_posix_memalign.originalBodySha256);
const runtime = await createOwnedRuntimeScratch("full-aligned-flow-");
let inspection = null, failure = null;
try {
  const response = await fetch("https://registry.npmjs.org/wabt/1.0.39", { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok); const metadata = await response.json(); assert.equal(metadata.version, "1.0.39");
  assert.equal(metadata.dist.integrity, expected.disassembler.registryIntegrity);
  await promisify(execFile)(process.execPath, ["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "install",
    "--prefix", runtime.directory, "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "wabt@1.0.39"],
  { windowsHide: true, cwd: runtime.directory, env: { ...runtime.env, npm_config_cache: path.join(runtime.directory, "npm-cache") }, timeout: 60000, maxBuffer: 16384 });
  const lock = JSON.parse(await readFile(path.join(runtime.directory, "package-lock.json")));
  assert.equal(lock.packages["node_modules/wabt"].integrity, metadata.dist.integrity);
  const entry = path.join(runtime.directory, "node_modules/wabt/index.js"), factory = (await import(pathToFileURL(entry).href)).default;
  const wabt = await factory(), disassemblyModule = wabt.readWasm(slice.binary, { readDebugNames: true, threads: true, simd: true });
  let text;
  try { disassemblyModule.generateNames(); disassemblyModule.applyNames(); text = disassemblyModule.toText({ foldExprs: false, inlineExport: false }); }
  finally { disassemblyModule.destroy(); }
  // Slice preserves bounded constant-data sections as well as names/types;
  // WAT renders those data bytes textually. Same 64MiB static-tool ceiling as
  // the established allocator audit, NOT a converter memory/acceptance change.
  assert.ok(Buffer.byteLength(text) <= 64 * 1048576);
  const marker = "  (func $__wrap_posix_memalign ", start = text.indexOf(marker), end = text.indexOf("\n  (func ", start + marker.length);
  assert.ok(start >= 0 && end > start); const wrapperText = text.slice(start, end);
  assert.ok(Buffer.byteLength(wrapperText) <= 32768);
  const mallocSites = [...wrapperText.matchAll(/call \$emscripten_builtin_malloc/g)].map(match => match.index);
  assert.equal(mallocSites.length, 2);
  assert.deepEqual(expected.functions.__wrap_posix_memalign.calls.filter(row => /<emscripten_builtin_malloc>/.test(row.call.instruction)).map(row => row.call.originalOffsetHex),
    ["0x606c1e", "0x606cc7"]);
  const lines = allocator.text.split("\n"), normalizationIndex = lines.findIndex(line => line.trim() === "i32.const -8");
  assert.ok(normalizationIndex >= 0);
  inspection = { binary: expected.binary, actualFatalCallOffset: expected.matchedFatalCall.originalOffsetHex,
    actualFatalCallIsSecondMallocSite: true, wrapperText, wrapperTextSha256: sha(wrapperText), wrapperTextBytes: Buffer.byteLength(wrapperText),
    mallocSiteContexts: mallocSites.map(at => wrapperText.slice(Math.max(0, at - 800), at + 200)),
    actualAllocatorBodyVerified: true, allocatorNormalizationContext: lines.slice(Math.max(0, normalizationIndex - 12), normalizationIndex + 8),
    disassembler: { version: metadata.version, registryIntegrity: metadata.dist.integrity, entrySha256: sha(await readFile(entry)) },
    selectedBodyUnchanged: true, instantiated: false, usedForMedia: false, fragmentationCauseProven: false, runtimeFixImplemented: false };
} catch (error) { failure = String(error); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const report = { recordedAt: new Date().toISOString(), status: failure ? "failed-static-argument-inspection" : "actual-aligned-fallback-argument-flow-retained-not-fix",
  input: { path: inputPath, sha256: sha(inputBytes) }, allocatorInput: { path: oldAllocatorPath, sha256: sha(oldAllocatorBytes) }, inspection, failure,
  cleanup: { ownedRuntimeRemoved: true, cacheAndSliceRemoved: true, runtimeDirectory: runtime.directory },
  sourceSha256: sha(await readFile(new URL(import.meta.url))), browserConversionsPerformed: 0, actualConverterFunctionsExecuted: 0,
  productionEngineChanged: false, noDocker: true, windowsHidden: true, publicAcceptance: false, speedGainClaim: null };
const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 65536);
const output = "evidence/progress-full-aligned-normalization-verified-2026-10-10.json";
await writeFile(path.join(root, output), json, { flag: "wx" });
console.log(JSON.stringify({ output, failure, mallocSiteContexts: inspection?.mallocSiteContexts, normalization: inspection?.allocatorNormalizationContext, cleanup: report.cleanup }));
