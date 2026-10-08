// Static analysis only. Never instantiate/run converter bytes or read media.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createStaticFunctionSlice } from "./lib/wasm-static-function-slice.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofBytes = await readFile(path.join(root, "evidence/mpeg2-quiesced-budget-original-2026-10-08.json"));
const proof = JSON.parse(proofBytes), symbols = proof.actualStackSymbols[0];
const frame = symbols.frames.find(row => row.functionNameFromActualBinary === "alloc_frame");
const getter = symbols.frames.find(row => row.functionNameFromActualBinary === "av_refstruct_pool_get");
assert.ok(frame && getter); assert.equal(symbols.role, "decoder");
const binaryPath = "work/mpeg2-split-pipeline-37479749443/within-mpeg2-split.wasm";
const binary = await readFile(path.join(root, binaryPath)); assert.equal(sha(binary), symbols.binarySha256);
const slice = createStaticFunctionSlice(binary, new Set(["alloc_frame"]));
assert.equal(slice.instantiated, false); assert.equal(slice.preservedFunctions, 1);
const original = slice.metadata[0], sliced = readWasmFunctionMetadata(slice.binary, new Set(["alloc_frame"]))[0];
assert.equal(original.functionIndex, frame.functionIndex); assert.equal(original.name, "alloc_frame");
assert.deepEqual(slice.binary.subarray(sliced.bodyStart, sliced.bodyEnd), binary.subarray(original.bodyStart, original.bodyEnd));
const runtime = await createOwnedRuntimeScratch("late-pool-static-");
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
    { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1048576 });
  const marker = `func[${original.functionIndex}] <alloc_frame>:`;
  const start = stdout.indexOf(marker); assert.ok(start >= 0);
  const finish = stdout.indexOf(" func[", start + marker.length); assert.ok(finish > start);
  const text = stdout.slice(start, stdout.lastIndexOf("\n", finish));
  assert.ok(Buffer.byteLength(text) <= 65536);
  const calls = [];
  for (const line of text.split("\n")) {
    const match = /^\s*([0-9a-f]+):\s+([0-9a-f ]+)\|\s+call (\d+) <([^>]+)>/.exec(line);
    if (!match || Number(match[3]) !== getter.functionIndex) continue;
    const slicedOffset = parseInt(match[1], 16), originalOffset = slicedOffset - sliced.bodyStart + original.bodyStart;
    assert.ok(originalOffset >= original.bodyStart && originalOffset < original.bodyEnd);
    const opcodeBytes = Buffer.from(match[2].trim().replaceAll(" ", ""), "hex");
    assert.deepEqual(binary.subarray(originalOffset, originalOffset + opcodeBytes.length), opcodeBytes);
    calls.push({ slicedOffset, originalOffset, originalOffsetHex: `0x${originalOffset.toString(16)}`,
      targetIndex: Number(match[3]), targetName: match[4], instructionHex: opcodeBytes.toString("hex") });
  }
  assert.equal(calls.length, 2);
  const matched = calls.filter(row => row.originalOffset === parseInt(frame.codeOffset, 16));
  assert.equal(matched.length, 1, "Stack code offset must match an actual decoded call instruction exactly");
  const sourceSiteOrdinal = calls.indexOf(matched[0]);
  assert.equal(sourceSiteOrdinal, 0);
  inspection = { binary: { path: binaryPath, bytes: binary.length, sha256: sha(binary) },
    actualStackCaller: frame, actualStackCallee: getter, originalMetadata: original, slicedMetadata: sliced,
    originalBodySha256: sha(binary.subarray(original.bodyStart, original.bodyEnd)), disassemblyText: text,
    disassembler: { version: metadata.version, registryIntegrity: metadata.dist.integrity,
      executableSha256: sha(await readFile(toolPath)) },
    calls, matchedCall: matched[0], sourceSiteOrdinal,
    poolIdentityInference: "Exact caller offset is the first of two decoded pool-get instructions in alloc_frame. The pinned upstream source orders tab_mvf before rpl_tab with a failure branch between them; infer tab_mvf. This does not expose late pool size, live entries or free blocks.",
    inferredFailedPool: "tab_mvf", observedRuntimePoolPointer: null, failedIndividualAllocationBytes: null,
    livePoolEntryCountsAtLateFailure: null, largestFreeBlockBytes: null, fragmentationProven: false,
    analysisOnlySlice: { bytes: slice.binary.length, sha256: sha(slice.binary),
      preservedFunctions: slice.preservedFunctions, unreachableReplacements: slice.unreachableReplacements,
      selectedBodyByteExact: true, instantiated: false, usedForMedia: false },
  };
} catch (error) { failure = String(error); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const sourcePath = "scripts/audit-mpeg2-late-pool-callsite.mjs";
const report = { recordedAt: new Date().toISOString(), status: failure ? "failed-static-inspection-not-acceptance" : "verified-static-late-pool-callsite-inference-not-runtime-fix",
  input: { path: "evidence/mpeg2-quiesced-budget-original-2026-10-08.json", bytes: proofBytes.length, sha256: sha(proofBytes) },
  inspection, failure, cleanup: { ownedRuntimeRemoved: true, cacheAndAnalysisSliceRemoved: true,
    runtimeDirectory: runtime.directory },
  sourcePins: { [sourcePath]: sha(await readFile(path.join(root, sourcePath))) },
  originalRead: false, browserConversionsPerformed: 0, actualConverterFunctionsExecuted: 0,
  nativeConverterUsed: false, noDocker: true, productionEngineChanged: false, heapLimitRaised: false,
  runtimeFixImplemented: false, publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null };
const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 131072);
await writeFile(path.join(root, "evidence/mpeg2-late-pool-callsite-2026-10-08.json"), json, { flag: "wx" });
console.log(JSON.stringify({ status: report.status, failure, calls: inspection?.calls,
  inferredFailedPool: inspection?.inferredFailedPool, cleanup: report.cleanup }));
