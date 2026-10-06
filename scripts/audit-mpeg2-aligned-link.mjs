// Actual-binary static call-path proof only. NO codec/media/browser/original
// source read or Wasm function execution. Analysis slice is NEVER instantiated.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createStaticFunctionSlice } from "./lib/wasm-static-function-slice.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const name = process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR;
assert.match(name ?? "", /^mpeg2-split-pipeline-[0-9]{8,}$/);
const slot = path.join(root, "work", name);
let runtime, inspection = null, failure = null;
const cleanup = { runtimeRemoved: false }, cleanupErrors = [];
try {
  const manifest = JSON.parse(await readFile(path.join(slot, "build-manifest.json")));
  assert.equal(manifest.scope, "private-fixed-heap-alignment-reuse-candidate-not-browser-acceptance");
  const binary = await readFile(path.join(slot, "within-mpeg2-split.wasm"));
  assert.equal(sha(binary), manifest.artifacts["within-mpeg2-split.wasm"]);
  runtime = await createOwnedRuntimeScratch("aligned-link-audit-");
  const response = await fetch("https://registry.npmjs.org/wabt/1.0.39"); assert.ok(response.ok);
  const metadata = await response.json(); assert.equal(metadata.version, "1.0.39");
  assert.ok(metadata.dist.integrity.startsWith("sha512-"));
  await exec("C:\\Program Files\\nodejs\\node.exe", ["C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    "install", "--prefix", runtime.directory, "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "wabt@1.0.39"],
  { cwd: runtime.directory, windowsHide: true, env: { ...runtime.env, npm_config_cache: path.join(runtime.directory, "npm-cache") },
    timeout: 60000, maxBuffer: 16384 });
  const packagePath = path.join(runtime.directory, "node_modules/wabt");
  const lock = JSON.parse(await readFile(path.join(runtime.directory, "package-lock.json")));
  assert.equal(lock.packages["node_modules/wabt"].integrity, metadata.dist.integrity);
  const factory = (await import(pathToFileURL(path.join(packagePath, "index.js")).href)).default, wabt = await factory();
  const names = ["av_malloc", "__wrap_posix_memalign"];
  const sliced = createStaticFunctionSlice(binary, new Set(names));
  const disassemblyModule = wabt.readWasm(sliced.binary, { readDebugNames: true, threads: true, simd: true });
  let text;
  try { disassemblyModule.generateNames(); disassemblyModule.applyNames(); text = disassemblyModule.toText({ foldExprs: false, inlineExport: false }); }
  finally { disassemblyModule.destroy(); }
  assert.ok(Buffer.byteLength(text) <= 64 * 1024 * 1024);
  const functions = {};
  for (const name of names) {
    const marker = `  (func $${name} `, start = text.indexOf(marker); assert.ok(start >= 0, name);
    let end = text.indexOf("\n  (func ", start + marker.length);
    if (end < 0) end = text.indexOf("\n  (", start + marker.length);
    assert.ok(end > start);
    const body = text.slice(start, end), actual = sliced.metadata.find(entry => entry.name === name);
    assert.ok(Buffer.byteLength(body) <= 262144);
    functions[name] = { text: body, originalMetadata: actual,
      originalBodySha256: sha(binary.subarray(actual.bodyStart, actual.bodyEnd)),
      calls: [...new Set([...body.matchAll(/\bcall \$([^\s)]+)/g)].map(match => match[1]))] };
  }
  inspection = { binary: { slot: name, bytes: binary.length, sha256: sha(binary) }, functions,
    disassembler: { version: metadata.version, registryIntegrity: metadata.dist.integrity,
      entrySha256: sha(await readFile(path.join(packagePath, "index.js"))) },
    analysisOnlySlice: { bytes: sliced.binary.length, sha256: sha(sliced.binary),
      preservedOriginalBodyCount: sliced.preservedFunctions, unreachableReplacementCount: sliced.unreachableReplacements,
      selectedBodiesByteExact: true, instantiated: false, usedForMediaOrBrowser: false },
    avMallocWrapperCallVerified: false, plainMallocCallVerified: false,
    upstreamFallbackVerified: false, linkedPathVerified: false };
  assert.ok(functions.av_malloc.calls.includes("__wrap_posix_memalign"), "Actual av_malloc must call wrapper, not merely contain an unused symbol");
  inspection.avMallocWrapperCallVerified = true;
  assert.ok(functions.__wrap_posix_memalign.calls.includes("emscripten_builtin_malloc"), "Actual plain malloc path required");
  inspection.plainMallocCallVerified = true;
  // Optimized upstream fallback may be inlined. Its absence as a separate
  // named function is NOT proof of a missing path; preserve actual body for
  // a separate fallback analysis. Never claim full verification from symbols.
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  if (runtime) {
    try { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; }
    catch (error) { cleanupErrors.push(String(error)); process.exitCode = 1; }
  }
  const report = { recordedAt: new Date().toISOString(), scope: "Actual alignment wrapper call-path static audit only",
    originalFileUsed: false, conversionsPerformed: 0, wasmFunctionsExecuted: 0, publicAcceptance: false,
    inspection, failure, cleanup, cleanupErrors, runtimeDirectory: runtime?.directory ?? null,
    sourceSha256: sha(await readFile(new URL(import.meta.url))) };
  const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 1024 * 1024);
  await mkdir(path.join(root, "output/playwright"), { recursive: true });
  const output = path.join(root, `output/playwright/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-mpeg2-aligned-link.json`);
  await writeFile(output, json, { flag: "wx" }); console.log(output);
}
