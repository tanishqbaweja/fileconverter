// Read-only actual-binary audit. Analysis slices are NEVER instantiated, used
// for conversion, or substituted for the executed Wasm's original PCs.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createStaticFunctionSlice } from "./lib/wasm-static-function-slice.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { disassembleSelectedWasmFunctions } from "./lib/selected-wasm-disassembly.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const terminalPath = "evidence/2026-10-11T14-01-14-330Z-allocation-attempt-original-full-terminal-analysis.json", terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
assert.equal(terminal.failure, null); assert.equal(terminal.result.failedAllocation.phase, "upstream-alignment-pending");
const binaryPath = "work/mpeg2-allocation-attempt-38138821153/within-mpeg2-split.wasm", binary = await read(binaryPath);
assert.equal(sha(binary), "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039");
const prior = JSON.parse(await read("evidence/progress-full-aligned-normalization-verified-2026-10-10.json"));
const selectedNames = new Set(["__wrap_posix_memalign", "emscripten_builtin_malloc"]), slice = createStaticFunctionSlice(binary, selectedNames);
assert.equal(slice.instantiated, false); const indices = new Set(slice.metadata.map(row => row.functionIndex));
assert.deepEqual([...indices].sort((a, b) => a - b), [4436, 4471]);
const runtime = await createOwnedRuntimeScratch("attempt-alignment-static-"); let inspection = null, failure = null;
try {
  const response = await fetch("https://registry.npmjs.org/wabt/1.0.39", { signal: AbortSignal.timeout(30000) }); assert.ok(response.ok);
  const metadata = await response.json(); assert.equal(metadata.version, "1.0.39"); assert.equal(metadata.dist.integrity, prior.inspection.disassembler.registryIntegrity);
  await promisify(execFile)(process.execPath, ["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "install", "--prefix", runtime.directory,
    "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "wabt@1.0.39"],
  { cwd: runtime.directory, env: { ...runtime.env, npm_config_cache: path.join(runtime.directory, "npm-cache") }, windowsHide: true, timeout: 60000, maxBuffer: 16384 });
  const lock = JSON.parse(await readFile(path.join(runtime.directory, "package-lock.json"))); assert.equal(lock.packages["node_modules/wabt"].integrity, metadata.dist.integrity);
  const entry = path.join(runtime.directory, "node_modules/wabt/index.js"); assert.equal(sha(await readFile(entry)), prior.inspection.disassembler.entrySha256);
  const wabt = await (await import(pathToFileURL(entry).href)).default(), disassemblyModule = wabt.readWasm(slice.binary, { readDebugNames: true, threads: true, simd: true });
  let wat; try { disassemblyModule.generateNames(); disassemblyModule.applyNames(); wat = disassemblyModule.toText({ foldExprs: false, inlineExport: false }); } finally { disassemblyModule.destroy(); }
  assert.ok(Buffer.byteLength(wat) <= 67108864);
  const functions = slice.metadata.map(actual => {
    const marker = `  (func $${actual.name} `, start = wat.indexOf(marker); assert.ok(start >= 0);
    let end = wat.indexOf("\n  (func ", start + marker.length); if (end < 0) end = wat.indexOf("\n  (", start + marker.length); assert.ok(end > start);
    const text = wat.slice(start, end); assert.ok(Buffer.byteLength(text) <= 1048576);
    return { name: actual.name, originalMetadata: actual, originalBodySha256: sha(binary.subarray(actual.bodyStart, actual.bodyEnd)), text, textSha256: sha(text) };
  });
  const sliceFile = path.join(runtime.directory, "analysis-only.wasm"); await writeFile(sliceFile, slice.binary, { flag: "wx" });
  const listing = await disassembleSelectedWasmFunctions(process.execPath, path.join(runtime.directory, "node_modules/wabt/bin/wasm-objdump"), sliceFile, indices, { cwd: root, env: runtime.env });
  const slicedMetadata = readWasmFunctionMetadata(slice.binary, selectedNames);
  for (const row of listing.listings) {
    const originalBody = slice.metadata.find(meta => meta.functionIndex === row.functionIndex), slicedBody = slicedMetadata.find(meta => meta.functionIndex === row.functionIndex);
    assert.equal(sha(slice.binary.subarray(slicedBody.bodyStart, slicedBody.bodyEnd)), sha(binary.subarray(originalBody.bodyStart, originalBody.bodyEnd)));
    row.analysisSliceTextSha256 = sha(row.text); row.originalBodyAddressDelta = originalBody.bodyStart - slicedBody.bodyStart;
    row.text = row.text.replace(/^(\s*)([0-9a-f]+):/gm, (_, spacing, hex) => spacing + (parseInt(hex, 16) + row.originalBodyAddressDelta).toString(16) + ":");
    row.originalInstructionAddressesRecoveredFromByteExactBodies = true;
  }
  const wrapper = functions.find(row => row.name === "__wrap_posix_memalign"), original = listing.listings.find(row => row.functionIndex === 4471), lines = original.text.split("\n");
  const at = lines.findIndex(line => /^\s*606e5c:/.test(line)); assert.ok(at >= 0); assert.match(lines[at], /call 4436 <emscripten_builtin_malloc>/);
  const sites = [...wrapper.text.matchAll(/call \$emscripten_builtin_malloc/g)].map(match => match.index); assert.equal(sites.length, 2);
  const payload = Buffer.from(JSON.stringify({ functions, listing })), compressed = gzipSync(payload, { level: 9 }); assert.ok(payload.length <= 8388608 && compressed.length <= 2097152);
  assert.deepEqual(gunzipSync(compressed), payload);
  const archivePath = `outputs/reports/${stamp}-attempt-alignment-selected-functions.json.gz`; await writeFile(path.join(root, archivePath), compressed, { flag: "wx" });
  inspection = { binary: { path: binaryPath, bytes: binary.length, sha256: sha(binary) },
    actualFatalCall: { originalOffsetHex: "0x606e5c", originalInstruction: lines[at].split("|")[1].trim(), originalContext: lines.slice(Math.max(0, at - 16), at + 4) },
    actualMallocSites: sites.map(index => wrapper.text.slice(Math.max(0, index - 900), index + 200)),
    archive: { path: archivePath, bytes: compressed.length, sha256: sha(compressed), restoredBytes: payload.length, restoredSha256: sha(payload) },
    selectedFunctions: functions.map(row => ({ name: row.name, originalMetadata: row.originalMetadata, originalBodySha256: row.originalBodySha256, textSha256: row.textSha256 })), originalBodiesByteExact: true, originalPcNotSlicePc: true,
    disassembler: { version: metadata.version, registryIntegrity: metadata.dist.integrity, entrySha256: sha(await readFile(entry)) },
    instantiated: false, converterFunctionsExecuted: 0, internalFailedRequestProven: false, failureCauseProven: false, runtimeFixImplemented: false };
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
assert.equal(sha(await read(binaryPath)), sha(binary));
const report = { recordedAt: new Date().toISOString(), status: failure ? "failed-read-only-static-audit" : "actual-upstream-fatal-malloc-callsite-retained-not-fix",
  input: { path: terminalPath, sha256: sha(terminalBytes) }, inspection, failure,
  cleanup: { runtimeDirectory: runtime.directory, runtimeCacheAndToolRemoved: true, originalBinaryUnchanged: true },
  sourceSha256: sha(await read("scripts/audit-attempt-alignment-callsite.mjs")), originalVideoRead: false, conversions: 0, publicAcceptance: false, noDocker: true };
const output = `evidence/${stamp}-attempt-alignment-static.json`; await writeFile(path.join(root, output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, failure, actualMallocSites: inspection?.actualMallocSites, actualFatalCall: inspection?.actualFatalCall }));
