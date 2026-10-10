// Actual encoder static audit only: no instance, original video read, conversion or browser.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createAnonymousIndexFunctionSlice } from "./lib/wasm-anonymous-index-slice.mjs";
import { symbolizeWasmStack } from "./lib/wasm-stack-symbols.mjs";
import { disassembleSelectedWasmFunctions } from "./lib/selected-wasm-disassembly.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), read = file => readFile(path.join(root, file));
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const binaryPath = "work/mpeg2-single-idle-37986418102/split-encoder.wasm", gluePath = "work/mpeg2-single-idle-37986418102/split-encoder.mjs";
let runtime = null, failure = null, inspection = null, archivedFunctions = null;
const cleanup = { runtimeRemoved: false, originalBinaryUnchanged: false }, cleanupErrors = [];
try {
  const binary = await read(binaryPath); assert.equal(binary.length, 674961);
  assert.equal(sha(binary), "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  const glue = await read(gluePath); assert.equal(sha(glue), "00c0d1b4435e9294c6784e9ccaf196f171caa3c9cc3d4c7a4aab1a47c6d8bb5e");
  const rawPath = "outputs/reports/2026-10-09T20-55-24-319Z-single-idle-full-raw.json.gz", compressed = await read(rawPath);
  assert.equal(sha(compressed), "849b98dd7514555190378389286588db47c3f9215e50dc756f3b6cc9a0fb6411");
  const raw = gunzipSync(compressed, { maxOutputLength: 24 * 1024 ** 2 });
  assert.equal(raw.length, 19185970); assert.equal(sha(raw), "6b76e5489f0171ec672a0170aff4327ff0f0df435a894a0cf411c30b47f80612");
  const abort = JSON.parse(raw).abortDiagnostic.records[0]; assert.equal(abort.role, "encoder");
  assert.match(abort.reason, /^Cannot enlarge memory arrays to size 16875520 bytes/);
  const frames = symbolizeWasmStack(abort.stack, new Map()).filter(frame => frame.functionIndex < 1000);
  assert.deepEqual(frames.map(frame => frame.functionIndex), [486,480,484,414,350,75,245,244,68,70,69,526]);
  const sliced = createAnonymousIndexFunctionSlice(binary, new Set(frames.map(frame => frame.functionIndex)));
  for (const frame of frames) {
    const metadata = sliced.metadata.find(row => row.functionIndex === frame.functionIndex), offset = Number(frame.codeOffset);
    assert.ok(offset >= metadata.bodyStart && offset < metadata.bodyEnd, "Actual abort PC must belong to exact actual function body");
  }
  runtime = await createOwnedRuntimeScratch("encoder-stack-static-");
  const response = await fetch("https://registry.npmjs.org/wabt/1.0.39", { signal: AbortSignal.timeout(10000) });
  assert.equal(response.ok, true); const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.byteLength; assert.ok(bytes <= 65536); chunks.push(chunk); }
  const metadata = JSON.parse(Buffer.concat(chunks, bytes)); assert.equal(metadata.version, "1.0.39");
  assert.match(metadata.dist.integrity, /^sha512-/);
  await execute(process.execPath, ["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "install", "--prefix", runtime.directory,
    "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "wabt@1.0.39"],
  { cwd: runtime.directory, env: { ...runtime.env, npm_config_cache: path.join(runtime.directory, "npm-cache") }, windowsHide: true, timeout: 60000, maxBuffer: 16384 });
  const packagePath = path.join(runtime.directory, "node_modules/wabt"), entry = path.join(packagePath, "index.js");
  const lock = JSON.parse(await readFile(path.join(runtime.directory, "package-lock.json")));
  assert.equal(lock.packages["node_modules/wabt"].integrity, metadata.dist.integrity);
  const factory = (await import(pathToFileURL(entry).href)).default, wabt = await factory();
  const disassemblyModule = wabt.readWasm(sliced.binary, { readDebugNames: true, threads: true, simd: true });
  let text;
  try { disassemblyModule.generateNames(); disassemblyModule.applyNames(); text = disassemblyModule.toText({ foldExprs: false, inlineExport: false }); }
  finally { disassemblyModule.destroy(); }
  assert.ok(Buffer.byteLength(text) <= 16 * 1024 ** 2);
  const selected = sliced.metadata.map(row => {
    const marker = `  (func $${row.analysisLabel} `, start = text.indexOf(marker); assert.ok(start >= 0);
    const end = text.indexOf("\n  (func ", start + marker.length); assert.ok(end > start);
    const value = text.slice(start, end); assert.ok(Buffer.byteLength(value) <= 1048576);
    const callIndices = [...value.matchAll(/\bcall \$(?:analysis_index_|f)(\d+)/g)].map(match => Number(match[1]));
    return { ...row, originalBodySha256: sha(binary.subarray(row.bodyStart, row.bodyEnd)), text: value,
      textBytes: Buffer.byteLength(value), textSha256: sha(value), directlyCalledFunctionIndices: [...new Set(callIndices)],
      indirectCallSites: [...value.matchAll(/\bcall_indirect\b/g)].length };
  });
  const objdumpPath = path.join(packagePath, "bin/wasm-objdump");
  const originalDisassembly = await disassembleSelectedWasmFunctions(process.execPath, objdumpPath, path.join(root, binaryPath),
    new Set(frames.map(frame => frame.functionIndex)), { cwd: root, env: runtime.env });
  const listing = frames.map(frame => {
    const value = originalDisassembly.listings.find(row => row.functionIndex === frame.functionIndex)?.text;
    assert.ok(value); assert.ok(Buffer.byteLength(value) <= 1048576);
    return { ...frame, originalListing: value, originalListingSha256: sha(value) };
  });
  const data = Buffer.from(JSON.stringify({ selected, listing })), gzip = gzipSync(data, { level: 9 });
  assert.ok(data.length <= 8 * 1024 ** 2); assert.deepEqual(gunzipSync(gzip), data);
  const archivePath = `outputs/reports/${stamp}-single-idle-encoder-static-functions.json.gz`;
  await writeFile(path.join(root, archivePath), gzip, { flag: "wx" });
  archivedFunctions = { path: archivePath, bytes: gzip.length, sha256: sha(gzip), restoredBytes: data.length, restoredSha256: sha(data) };
  inspection = { binary: { path: binaryPath, bytes: binary.length, sha256: sha(binary) }, glue: { path: gluePath, sha256: sha(glue) },
    rawAbortEvidence: { path: rawPath, sha256: sha(compressed), restoredSha256: sha(raw) },
    abort: { observedAt: abort.observedAt, role: abort.role, reason: abort.reason, stack: abort.stack },
    selectedFunctions: selected.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "text"))),
    callChain: frames.map((frame, i) => ({ ...frame, expectedInnerFrame: i ? frames[i - 1].functionIndex : null,
      directCallToObservedInnerFrame: i ? selected.find(row => row.functionIndex === frame.functionIndex).directlyCalledFunctionIndices.includes(frames[i - 1].functionIndex) : null })),
    syntheticLabelsForAnalysisOnly: true, actualDebugNamesAvailable: false, noDecoderSymbolSubstitution: true,
    selectedOriginalBodyBytesPreserved: true, wasmInstantiated: false, wasmFunctionExecution: false,
    functionSlice: { bytes: sliced.binary.length, sha256: sha(sliced.binary), preserved: sliced.preservedFunctions, unreachableReplacements: sliced.unreachableReplacements },
    disassemblyCollection: Object.fromEntries(Object.entries(originalDisassembly).filter(([key]) => key !== "listings")),
    disassembler: { version: "1.0.39", integrity: metadata.dist.integrity, entrySha256: sha(await readFile(entry)), objdumpSha256: sha(await readFile(objdumpPath)) },
    installedLlvmPriorAttempt: { outcome: "failed-wasm-target-unavailable", filesChanged: false, originalFunctionsExecuted: 0 },
    individualAllocationBytes: null, liveHeapBytes: null, largestFreeBlockBytes: null, fragmentationProven: false,
    caveat: "Static selected actual bytes and call edges only. Synthetic numeric labels are not C symbols. Operand values, actual allocation size and dynamic allocator state remain unavailable." };
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally {
  if (runtime) { try { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; }
    catch (error) { cleanupErrors.push(String(error)); process.exitCode = 1; } }
  try { assert.equal(sha(await read(binaryPath)), "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242"); cleanup.originalBinaryUnchanged = true; }
  catch (error) { cleanupErrors.push(String(error)); process.exitCode = 1; }
}
const proofPath = `evidence/${stamp}-single-idle-encoder-stack-static.json`;
await writeFile(path.join(root, proofPath), JSON.stringify({ recordedAt: new Date().toISOString(), status: failure ? "failed-static-audit" : "actual-encoder-static-call-stack-audited-not-allocation-cause",
  failure, inspection, archivedFunctions, cleanup, cleanupErrors, ownedRuntime: runtime?.directory ?? null,
  publicAcceptance: false, productionFix: false, originalVideoRead: false, browserLaunches: 0, conversions: 0,
  originalWasmFunctionsExecuted: 0, noDocker: true, subprocessWindowsHidden: true,
  sourcePins: Object.fromEntries(await Promise.all(["scripts/audit-single-idle-encoder-stack.mjs", "scripts/lib/wasm-anonymous-index-slice.mjs", "scripts/lib/selected-wasm-disassembly.mjs", "scripts/lib/wasm-function-metadata.mjs",
    "scripts/lib/wasm-static-function-slice.mjs", "scripts/lib/wasm-stack-symbols.mjs"].map(async file => [file, sha(await read(file))]))) }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, status: failure ? "failed" : "audited", failure, cleanup, archivedFunctions }));
