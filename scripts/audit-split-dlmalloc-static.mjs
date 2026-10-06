// Static tool audit only. NO original fixture, codec, media, Wasm instantiation
// or conversion. Temporary pinned disassembler + cache are identity-owned.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createStaticFunctionSlice } from "./lib/wasm-static-function-slice.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile), sha = bytes => createHash("sha256").update(bytes).digest("hex");
let runtime, failure = null, inspection = null;
const cleanup = { runtimeRemoved: false }, cleanupErrors = [];
try {
  runtime = await createOwnedRuntimeScratch("dlmalloc-static-audit-");
  const metadata = await (await fetch("https://registry.npmjs.org/wabt/1.0.39")).json();
  assert.equal(metadata.version, "1.0.39");
  assert.ok(metadata.dist.integrity.startsWith("sha512-"));
  await exec("C:\\Program Files\\nodejs\\node.exe", ["C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    "install", "--prefix", runtime.directory, "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "wabt@1.0.39"],
  { windowsHide: true, cwd: runtime.directory, env: { ...runtime.env, npm_config_cache: path.join(runtime.directory, "npm-cache") }, timeout: 60000, maxBuffer: 16384 });
  const packagePath = path.join(runtime.directory, "node_modules/wabt"), manifest = JSON.parse(await readFile(path.join(packagePath, "package.json")));
  assert.equal(manifest.version, metadata.version);
  const lock = JSON.parse(await readFile(path.join(runtime.directory, "package-lock.json")));
  assert.equal(lock.packages["node_modules/wabt"].integrity, metadata.dist.integrity);
  const factory = (await import(pathToFileURL(path.join(packagePath, "index.js")).href)).default, wabt = await factory();
  const wasmPath = "work/mpeg2-split-pipeline-37444860342/within-mpeg2-split.wasm", binary = await readFile(path.join(root, wasmPath));
  assert.equal(sha(binary), "7b8a42b60efc439f0ceca045f4caaabfd4b0ebf0706397b6011cceedada4980c");
  const names = ["emscripten_builtin_malloc", "dlposix_memalign", "av_malloc"];
  const sliced = createStaticFunctionSlice(binary, new Set(names));
  const disassemblyModule = wabt.readWasm(sliced.binary, { readDebugNames: true, threads: true, simd: true });
  let text;
  try { disassemblyModule.generateNames(); disassemblyModule.applyNames(); text = disassemblyModule.toText({ foldExprs: false, inlineExport: false }); }
  finally { disassemblyModule.destroy(); }
  assert.ok(Buffer.byteLength(text) <= 64 * 1024 * 1024, "Static disassembly cap");
  const selected = {};
  for (const name of names) {
    const marker = `  (func $${name} `, start = text.indexOf(marker); assert.ok(start >= 0, name);
    const end = text.indexOf("\n  (func ", start + marker.length); assert.ok(end > start);
    const functionText = text.slice(start, end); assert.ok(Buffer.byteLength(functionText) <= 262144);
    const actual = sliced.metadata.find(entry => entry.name === name);
    selected[name] = { sha256: sha(functionText), bytes: Buffer.byteLength(functionText), text: functionText,
      originalBodySha256: sha(binary.subarray(actual.bodyStart, actual.bodyEnd)), originalMetadata: actual };
  }
  const allocatorText = selected.emscripten_builtin_malloc.text;
  const rootAddress = 1786392;
  const layout = { smallmap: 0, treemap: 4, dvsize: 8, topsize: 12, leastAddress: 16,
    dv: 20, top: 24, smallbins: 40, treebins: 304, footprint: 432, maxFootprint: 436,
    footprintLimit: 440, flags: 444, mutex: 448, segment: 472 };
  const evidence = {};
  for (const [field, relative] of Object.entries(layout)) {
    const absolute = rootAddress + relative, lines = allocatorText.split("\n");
    const at = lines.findIndex(line => line.trim() === `i32.const ${absolute}`);
    // Some fields are not used by this optimized malloc body. Never invent a
    // direct reference for them; their ABI offsets remain source-derived only.
    evidence[field] = { absoluteAddress: absolute, relativeOffset: relative,
      referencedInActualFunction: at >= 0, context: at >= 0 ? lines.slice(Math.max(0, at - 2), at + 5) : null };
  }
  for (const field of ["smallmap", "treemap", "dvsize", "topsize", "leastAddress", "dv", "top", "smallbins", "treebins", "footprint", "flags", "mutex", "segment"])
    assert.equal(evidence[field].referencedInActualFunction, true, field);
  assert.match(allocatorText, /i32\.const 1786840\s+call \$__pthread_mutex_timedlock/);
  assert.match(allocatorText, /i32\.const 1786840\s+call \$pthread_mutex_unlock/);
  inspection = { binary: { path: wasmPath, bytes: binary.length, sha256: sha(binary) },
    disassembler: { version: manifest.version, registryIntegrity: metadata.dist.integrity, entrySha256: sha(await readFile(path.join(packagePath, "index.js"))) },
    selectedFunctions: selected, entireDisassemblyPersisted: false,
    analysisOnlySlice: { bytes: sliced.binary.length, sha256: sha(sliced.binary),
      preservedOriginalBodyCount: sliced.preservedFunctions, unreachableReplacementCount: sliced.unreachableReplacements,
      instantiated: false, selectedBodyBytesUnchanged: true, originalIndicesTypesAndNamesPreserved: true,
      usedForMediaOrBrowser: false },
    allocatorRootAddress: rootAddress, allocatorLayoutReferences: evidence,
    allocatorFreeSpaceMeasured: false, liveFramesMeasured: false,
    primaryAllocatorSource: "https://raw.githubusercontent.com/emscripten-core/emscripten/6.0.4/system/lib/dlmalloc.c",
    caveat: "Static layout attribution only. No dynamic free-block or capacity conclusion." };
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  if (runtime) {
    try { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; }
    catch (error) { cleanupErrors.push(String(error)); process.exitCode = 1; }
  }
  const report = { recordedAt: new Date().toISOString(), scope: "Actual pinned binary static allocator audit, no codec/media/native conversion or original read",
    publicAcceptance: false, originalFileUsed: false, conversionsPerformed: 0, wasmFunctionsExecuted: 0,
    inspection, failure, cleanup, cleanupErrors, runtimeDirectory: runtime?.directory ?? null,
    sourceSha256: sha(await readFile(new URL(import.meta.url))) };
  await mkdir(path.join(root, "output/playwright"), { recursive: true });
  const output = path.join(root, `output/playwright/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-split-dlmalloc-static.json`);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); console.log(output);
}
