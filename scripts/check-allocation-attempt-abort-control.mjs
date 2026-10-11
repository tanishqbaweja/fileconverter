// One real headless synthetic fatal, zero media. Same audited ownership/privacy path.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { ALLOCATION_ATTEMPT_DECODER_SHA256, ALLOCATION_ATTEMPT_SLOT, ALLOCATION_ATTEMPT_ROOT } from "./lib/allocation-attempt-abort-capture.mjs";
import { makeAllocationAttemptExportRecipe, makeAllocationAttemptBrowserFactory } from "./lib/allocation-attempt-control-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const buildPath = "evidence/mpeg2-allocation-attempt-build-38138821153.json", buildBytes = await read(buildPath), build = JSON.parse(buildBytes);
const branchPath = "evidence/mpeg2-allocation-attempt-build-branch-2026-10-11-binding-fix.json", branchBytes = await read(branchPath), branch = JSON.parse(branchBytes);
assert.equal(build.status, "actual-allocation-attempt-build-unit-verified-not-browser-acceptance");
assert.equal(build.run.conclusion, "success"); assert.equal(build.run.headSha, branch.commit);
assert.equal(build.hostedCleanupStepPassed, true); assert.equal(build.downloadRuntimeRemoved, true);
const candidate = "work/mpeg2-allocation-attempt-38138821153";
for (const row of build.files) { const bytes = await read(`${candidate}/${row.file}`); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256, row.file); }
for (const [file, hash] of Object.entries(build.manifest.sources))
  assert.equal(file === branch.workflow.path ? branch.workflow.generatedSha256 : sha(await read(file)), hash, file);
assert.equal(sha(await read(branch.workflow.path)), branch.workflow.canonicalSha256);
assert.equal(build.manifest.allocationAttempt.actualWasm32SyntheticDispatch.passed, 9);
const binaryPath = `${candidate}/within-mpeg2-split.wasm`, binary = await read(binaryPath);
assert.equal(sha(binary), ALLOCATION_ATTEMPT_DECODER_SHA256);
assert.deepEqual(readWasmMemoryLimits(binary), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
const mapPath = `${candidate}/decoder-link.map`, mapBytes = await read(mapPath);
assert.equal(sha(mapBytes), build.manifest.artifacts["decoder-link.map"]);
const mapSymbol = (name, size) => {
  const rows = [...mapBytes.toString().matchAll(new RegExp("^\\s*([0-9a-f]+)\\s+([0-9a-f]+)\\s+([0-9a-f]+)\\s+" + name + "\\s*$", "gm"))];
  assert.equal(rows.length, 1); assert.equal(parseInt(rows[0][3], 16), size);
  return { address: parseInt(rows[0][1], 16), bytes: size, exactMapLine: rows[0][0].trim() };
};
const allocator = mapSymbol("_gm_", 496), slot = mapSymbol("within_allocator_attempt_words", 64);
assert.equal(allocator.address, ALLOCATION_ATTEMPT_ROOT); assert.equal(slot.address, ALLOCATION_ATTEMPT_SLOT);
const indices = { av_buffer_allocz: 4188, av_malloc: 4312, emscripten_builtin_malloc: 4436, __wrap_posix_memalign: 4471,
  avcodec_default_get_buffer2: 709, alloc_frame: 2061, hevc_receive_frame: 1981, sbrk: 4441 };
const functions = readWasmFunctionMetadata(binary, new Set(Object.keys(indices))).map(row => {
  assert.equal(row.functionIndex, indices[row.name]);
  return { ...row, bodySha256: sha(binary.subarray(row.bodyStart, row.bodyEnd)) };
});
assert.equal(functions.length, Object.keys(indices).length);
const layout = { scope: "actual-current-core-typed-functions-map-and-constructor-slot-not-original-allocation",
  build: { path: buildPath, sha256: sha(buildBytes) }, branch: { path: branchPath, sha256: sha(branchBytes) },
  binary: { path: binaryPath, bytes: binary.length, sha256: sha(binary) }, map: { path: mapPath, sha256: sha(mapBytes) }, allocator, slot, functions };
const exportRecipe = makeAllocationAttemptExportRecipe((await read("scripts/lib/refstruct-export-only-control.mjs")).toString());
const browserRecipe = makeAllocationAttemptBrowserFactory((await read("scripts/lib/direct-buffer-control-browser-recipe.mjs")).toString());
const absoluteImports = source => source.replace(/from "(\.\/[^"\r\n]+)"/g,
  (_, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("allocation-attempt-control-caller-"), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
let receipt;
try {
  const factorySource = absoluteImports(exportRecipe.generated), browserFactorySource = absoluteImports(browserRecipe.generated);
  const factoryFile = path.join(runtime.directory, "export-factory.mjs"), browserFactoryFile = path.join(runtime.directory, "browser-factory.mjs");
  await writeFile(factoryFile, factorySource, { flag: "wx" }); await writeFile(browserFactoryFile, browserFactorySource, { flag: "wx" });
  const { createAllocationAttemptExportOnlyControl } = await import(pathToFileURL(factoryFile).href);
  const control = createAllocationAttemptExportOnlyControl(binary);
  assert.equal(control.originalSha256, ALLOCATION_ATTEMPT_DECODER_SHA256); assert.equal(control.additions.length, 1);
  assert.equal(control.additions[0].functionIndex, 4188); assert.equal(control.additions[0].exportName, "control_buffer_allocz");
  assert.equal(control.onlyExportSectionChanged, true); assert.equal(control.allCodeDataTypesImportsTablesMemoryExact, true);
  assert.equal(control.usableForMediaOrAcceptance, false);
  const controlPath = path.join(runtime.directory, "synthetic-export-only.wasm"); await writeFile(controlPath, control.binary, { flag: "wx" });
  const { makeAllocationAttemptControlBrowserRecipe, allocationAttemptControlFiles } = await import(pathToFileURL(browserFactoryFile).href);
  const recipe = makeAllocationAttemptControlBrowserRecipe((await read("scripts/check-wasm-abort-capture-origin-checked.mjs")).toString(), root, controlPath, control, stamp);
  const files = [...new Set([...allocationAttemptControlFiles, ...Object.keys(build.manifest.sources), "scripts/lib/allocation-attempt-control-recipe.mjs", buildPath, branchPath,
    "scripts/lib/direct-buffer-control-browser-recipe.mjs", "scripts/lib/direct-buffer-export-only-control.mjs",
    "scripts/check-wasm-abort-capture-origin-checked.mjs", "AGENTS.md", "package.json", "package-lock.json",
    "scripts/lib/private-browser-request.mjs", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/host-memory-preflight.mjs",
    "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/chromium-private-memory.mjs", "scripts/lib/microsecond-native-type-join.mjs", "scripts/lib/wasm-stack-symbols.mjs"] )];
  for (let i = 0; i < files.length; i++) {
    assert.ok(files.length <= 128); if (!files[i].endsWith(".mjs")) continue;
    for (const match of (await read(files[i])).toString().matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
      const relative = path.relative(root, path.resolve(root, path.dirname(files[i]), match[1])).replaceAll("\\", "/");
      assert.ok(relative && !relative.startsWith("../") && !path.isAbsolute(relative)); if (!files.includes(relative)) files.push(relative);
    }
  }
  const sourcePins = {}, preimages = {};
  for (const file of files) { const bytes = await read(file); assert.ok(bytes.length <= 2097152); sourcePins[file] = sha(bytes); preimages[file] = bytes.toString("base64"); }
  const bytes = Buffer.from(JSON.stringify({ ...recipe, factorySource, browserFactorySource, exportRecipe, browserRecipe, layout, sourcePins, preimages }));
  assert.ok(bytes.length <= 2097152); const zipped = gzipSync(bytes, { level: 9 }); assert.deepEqual(gunzipSync(zipped), bytes);
  const archivePath = `outputs/reports/${stamp}-allocation-attempt-abort-control-sources.json.gz`; await writeFile(path.join(root, archivePath), zipped, { flag: "wx" });
  const driver = path.join(runtime.directory, "driver.mjs"); await writeFile(driver, recipe.generated, { flag: "wx" });
  receipt = { recordedAt: new Date().toISOString(), status: "prepared-synthetic-attempt-control-not-executed", layout,
    proof: null, failure: null, sourcePins, postSourcePins: null, browserDriverImported: false,
    archive: { path: archivePath, bytes: zipped.length, sha256: sha(zipped), restoredBytes: bytes.length, restoredSha256: sha(bytes) },
    ownedCaller: runtime.directory, syntheticExportOnlyBinaryRemovedWithCallerScratch: false,
    browserConversionsPerformed: 0, protectedSourceRead: false, publicAcceptance: false };
  receipt.launchHostPreflight = await inspectStressHostMemory();
  if (!receipt.launchHostPreflight.safeToStart) { receipt.status = "held-before-browser-import-insufficient-host-memory"; receipt.browsersLaunched = 0; }
  else {
    receipt.browserDriverImported = true;
    try {
      await import(pathToFileURL(driver).href);
      const proofPath = `evidence/${stamp}-allocation-attempt-abort-control.json`, proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
      receipt.proof = { path: proofPath, sha256: sha(proofBytes), status: proof.status };
      receipt.status = "actual-synthetic-allocation-attempt-control-executed-sources-not-media-acceptance";
    } catch (error) { receipt.failure = String(error.stack ?? error).slice(0, 8192); receipt.status = "failed-synthetic-attempt-control-driver-import"; process.exitCode = 1; }
  }
  receipt.postSourcePins = {};
  for (const [file, hash] of Object.entries(sourcePins)) { receipt.postSourcePins[file] = sha(await read(file)); assert.equal(receipt.postSourcePins[file], hash, file); }
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch = true;
const output = `evidence/${stamp}-allocation-attempt-abort-control-executed-sources.json`;
await writeFile(path.join(root, output), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ executedSources: output, proof: receipt.proof, browserConversionsPerformed: 0 }));
