// Actual failed binary, static analysis only: never instantiate or run media.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createStaticFunctionSlice } from "./lib/wasm-static-function-slice.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { readWasmFunctionNames, symbolizeWasmStack } from "./lib/wasm-stack-symbols.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const read = file => readFile(path.join(root, file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const receiptPath = "evidence/2026-10-09T16-55-27-062Z-progress-compositing-original-full-completion.json";
const receiptBytes = await read(receiptPath), receipt = JSON.parse(receiptBytes);
const compressed = await read(receipt.candidate.compressedReport.path);
assert.equal(sha(compressed), receipt.candidate.compressedReport.sha256);
const rawBytes = gunzipSync(compressed, { maxOutputLength: 32 * 1048576 });
assert.equal(sha(rawBytes), receipt.candidate.rawReport.sha256);
const raw = JSON.parse(rawBytes);
assert.equal(raw.status, "failed"); assert.equal(raw.abortDiagnostic.records.length, 1);
const abort = raw.abortDiagnostic.records[0]; assert.equal(abort.role, "decoder");
const binaryPath = "work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.wasm";
const binary = await read(binaryPath);
assert.equal(sha(binary), "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
const frames = symbolizeWasmStack(abort.stack, readWasmFunctionNames(binary));
const frame = frames.find(row => row.functionNameFromActualBinary === "__wrap_posix_memalign");
assert.ok(frame);
const selected = new Set(["__wrap_posix_memalign", "av_malloc"]);
const slice = createStaticFunctionSlice(binary, selected);
assert.equal(slice.instantiated, false);
const slicedMetadata = readWasmFunctionMetadata(slice.binary, selected);
for (const original of slice.metadata) {
  const sliced = slicedMetadata.find(row => row.name === original.name);
  assert.deepEqual(slice.binary.subarray(sliced.bodyStart, sliced.bodyEnd), binary.subarray(original.bodyStart, original.bodyEnd));
}
const runtime = await createOwnedRuntimeScratch("full-aligned-static-");
let inspection = null, failure = null;
try {
  const response = await fetch("https://registry.npmjs.org/wabt/1.0.39", { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok); const metadata = await response.json(); assert.equal(metadata.version, "1.0.39");
  assert.match(metadata.dist.integrity, /^sha512-/);
  await execute(process.execPath, ["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "install",
    "--prefix", runtime.directory, "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "wabt@1.0.39"],
  { cwd: runtime.directory, env: { ...runtime.env, npm_config_cache: path.join(runtime.directory, "npm-cache") },
    windowsHide: true, timeout: 60000, maxBuffer: 16384 });
  const lock = JSON.parse(await readFile(path.join(runtime.directory, "package-lock.json")));
  assert.equal(lock.packages["node_modules/wabt"].integrity, metadata.dist.integrity);
  const toolPath = path.join(runtime.directory, "node_modules/wabt/bin/wasm-objdump");
  const temporary = path.join(runtime.directory, "analysis-only-never-executed.wasm");
  await writeFile(temporary, slice.binary, { flag: "wx" });
  const { stdout } = await execute(process.execPath, [toolPath, "-d", temporary],
    { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 });
  const functions = {};
  for (const original of slice.metadata) {
    const sliced = slicedMetadata.find(row => row.name === original.name);
    const marker = `func[${original.functionIndex}] <${original.name}>:`;
    const start = stdout.indexOf(marker); assert.ok(start >= 0);
    const finish = stdout.indexOf(" func[", start + marker.length);
    const text = stdout.slice(start, finish < 0 ? undefined : stdout.lastIndexOf("\n", finish));
    assert.ok(Buffer.byteLength(text) <= 65536);
    const instructions = text.split("\n").flatMap(line => {
      const match = /^\s*([0-9a-f]+):\s+([0-9a-f ]+)\|\s+(.*)$/.exec(line);
      if (!match) return [];
      const slicedOffset = parseInt(match[1], 16), originalOffset = slicedOffset - sliced.bodyStart + original.bodyStart;
      const opcodeBytes = Buffer.from(match[2].trim().replaceAll(" ", ""), "hex");
      assert.deepEqual(binary.subarray(originalOffset, originalOffset + opcodeBytes.length), opcodeBytes);
      return [{ originalOffset, originalOffsetHex: `0x${originalOffset.toString(16)}`,
        instructionHex: opcodeBytes.toString("hex"), instruction: match[3] }];
    });
    functions[original.name] = { originalMetadata: original, originalBodySha256: sha(binary.subarray(original.bodyStart, original.bodyEnd)),
      disassemblySha256: sha(text), disassemblyBytes: Buffer.byteLength(text), instructions };
  }
  const wrapper = functions.__wrap_posix_memalign.instructions;
  const matchIndex = wrapper.findIndex(row => row.originalOffset === parseInt(frame.codeOffset, 16));
  assert.ok(matchIndex >= 0, "Actual fatal stack offset must join exact decoded opcode");
  assert.match(wrapper[matchIndex].instruction, /^call 4435 <emscripten_builtin_malloc>$/);
  // Verify every decoded byte above, but retain only bounded call contexts and
  // initial argument/branch instructions; never persist the full disassembly.
  const compactFunctions = Object.fromEntries(Object.entries(functions).map(([name, value]) => {
    const { instructions, ...metadata } = value;
    const calls = instructions.flatMap((instruction, index) => /^call /.test(instruction.instruction) ?
      [{ call: instruction, context: instructions.slice(Math.max(0, index - 8), index + 3) }] : []);
    assert.ok(calls.length <= 32);
    return [name, { ...metadata, decodedInstructionsByteVerified: instructions.length,
      firstInstructions: instructions.slice(0, 16), calls, entireDisassemblyPersisted: false }];
  }));
  inspection = { binary: { path: binaryPath, bytes: binary.length, sha256: sha(binary) }, actualStackSymbols: frames,
    disassembler: { version: metadata.version, registryIntegrity: metadata.dist.integrity, executableSha256: sha(await readFile(toolPath)) },
    functions: compactFunctions, matchedFatalCall: wrapper[matchIndex], matchedFatalCallContext: wrapper.slice(Math.max(0, matchIndex - 10), matchIndex + 5),
    analysisOnlySlice: { bytes: slice.binary.length, sha256: sha(slice.binary), preservedFunctions: slice.preservedFunctions,
      unreachableReplacements: slice.unreachableReplacements, selectedBodyByteExact: true, instantiated: false, usedForMedia: false },
    runtimeRequest: abort.latePoolRequest, runtimeFreeHeaders: abort.allocatorFreeBlocks,
    fragmentationCauseProven: false, alignmentBranchInterpretationPending: true };
} catch (error) { failure = String(error); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const sourcePath = "scripts/audit-progress-full-aligned-callsite.mjs";
const report = { recordedAt: new Date().toISOString(), status: failure ? "failed-static-inspection" : "actual-fatal-aligned-malloc-callsite-decoded-not-fix",
  input: { path: receiptPath, sha256: sha(receiptBytes) }, inspection, failure,
  cleanup: { ownedRuntimeRemoved: true, cacheAndAnalysisSliceRemoved: true, runtimeDirectory: runtime.directory },
  sourcePins: Object.fromEntries(await Promise.all([sourcePath, "scripts/lib/wasm-static-function-slice.mjs", "scripts/lib/wasm-function-metadata.mjs",
    "scripts/lib/wasm-stack-symbols.mjs", "scripts/lib/owned-runtime-scratch.mjs"].map(async file => [file, sha(await read(file))]))),
  originalRead: false, browserConversionsPerformed: 0, actualConverterFunctionsExecuted: 0, noDocker: true,
  productionEngineChanged: false, heapLimitRaised: false, runtimeFixImplemented: false, publicAcceptance: false, speedGainClaim: null };
const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 131072);
const output = "evidence/progress-full-aligned-callsite-2026-10-10.json";
await writeFile(path.join(root, output), json, { flag: "wx" });
console.log(JSON.stringify({ output, status: report.status, failure, matchedFatalCallContext: inspection?.matchedFatalCallContext, cleanup: report.cleanup }));
