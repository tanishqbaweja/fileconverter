// One real installed-Chrome synthetic fatal. Not media/large-file acceptance.
// Native provenance and browser orchestration use separate bounded seals;
// both are verified before and after, with all preimages retained.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeReallocExportFactory } from "./lib/realloc-export-only-control.mjs";
import { COMPOSITE_REALLOC_FILES } from "./lib/realloc-composite-control-recipe.mjs";
import { exactPatch, verifyEbmlNative, makeEbmlObservers, EBML_DECODER_SHA256, EBML_TOOL_DIRECTORY } from "./lib/ebml-reuse-browser-components.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const native = await verifyEbmlNative(root), observers = await makeEbmlObservers(root, native), pin = await inspectInstalledChromePin();
const runtime = await createOwnedRuntimeScratch("ebml-reuse-browser-control-"), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
let receipt;
try {
  for (const [file, source] of Object.entries(observers.files)) await writeFile(path.join(runtime.directory, file), source, { flag: "wx" });
  const oldSha = "eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c";
  const exportParent = makeReallocExportFactory((await read("scripts/lib/refstruct-export-only-control.mjs")).toString());
  const exportRecipe = exactPatch(exportParent.generated, [[oldSha, EBML_DECODER_SHA256]]);
  const absoluteImports = (source, base) => source.replace(/from "(\.[^"\r\n]+)"/g,
    (_, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(base, file)).href)}`);
  const factory = path.join(runtime.directory, "export-factory.mjs");
  const factorySource = absoluteImports(exportRecipe.generated, path.join(root, "scripts/lib"));
  await writeFile(factory, factorySource, { flag: "wx" });
  const { createReallocExportOnlyControl } = await import(pathToFileURL(factory).href), control = createReallocExportOnlyControl(native.binary);
  assert.equal(control.originalSha256, EBML_DECODER_SHA256); assert.equal(control.additions.length, 2);
  assert.equal(control.onlyExportSectionChanged, true); assert.equal(control.allCodeDataTypesImportsTablesMemoryExact, true);
  assert.equal(control.usableForMediaOrAcceptance, false);
  const functionIndex = name => native.functions.find(row => row.name === name).functionIndex;
  assert.equal(control.additions[0].functionIndex, functionIndex("__wrap_av_buffer_realloc"));
  assert.equal(control.additions[1].functionIndex, functionIndex("emscripten_builtin_malloc"));
  const controlPath = path.join(runtime.directory, "synthetic-export-only.wasm"); await writeFile(controlPath, control.binary, { flag: "wx" });
  const parentSource = (await read("scripts/lib/realloc-control-browser-recipe.mjs")).toString();
  const baseFactory = path.join(runtime.directory, "base-factory.mjs");
  const baseFactorySource = absoluteImports(exactPatch(parentSource, [
    ['from "./realloc-attempt-abort-capture.mjs"', `from ${JSON.stringify(pathToFileURL(path.join(runtime.directory, "realloc-attempt-abort-capture.mjs")).href)}`],
  ]).generated, path.join(root, "scripts/lib"));
  await writeFile(baseFactory, baseFactorySource, { flag: "wx" });
  const compositeSource = (await read("scripts/lib/realloc-composite-control-recipe.mjs")).toString();
  const compositeFactorySource = absoluteImports(exactPatch(compositeSource, [
    ['from "./realloc-control-browser-recipe.mjs"', `from ${JSON.stringify(pathToFileURL(baseFactory).href)}`],
  ]).generated, path.join(root, "scripts/lib"));
  const compositeFactory = path.join(runtime.directory, "composite-factory.mjs"); await writeFile(compositeFactory, compositeFactorySource, { flag: "wx" });
  const { makeCompositeReallocControlBrowserRecipe } = await import(pathToFileURL(compositeFactory).href);
  const old = makeCompositeReallocControlBrowserRecipe((await read("scripts/check-wasm-abort-capture-origin-checked.mjs")).toString(), root, controlPath, control, stamp);
  const aliasMap = Object.fromEntries(Object.keys(observers.files).map(file => [file, path.join(runtime.directory, file)]));
  const edits = [
    ["work/mpeg2-realloc-attempt-38526781934", EBML_TOOL_DIRECTORY],
    [`evidence/${stamp}-realloc-composite-control.json`, `evidence/${stamp}-ebml-reuse-browser-control.json`],
    ['browserVersion = browser.version(); const context = browser.contexts()[0]; page = context.pages()[0];',
      `browserVersion = browser.version(); assert.equal(browserVersion,${JSON.stringify(pin.version)}); const context = browser.contexts()[0]; page = context.pages()[0];`],
    ['path.join(root,"scripts/lib",file),"text/javascript"', `${JSON.stringify(aliasMap)}[file]??path.join(root,"scripts/lib",file),"text/javascript"`],
    ['"realloc-composite-control-browser-"', '"ebml-reuse-control-browser-"'],
  ];
  const recipe = exactPatch(old.generated, edits);
  const files = [...new Set([...COMPOSITE_REALLOC_FILES,"scripts/check-ebml-reuse-browser-control.mjs", "scripts/lib/ebml-reuse-browser-components.mjs",
    "scripts/lib/realloc-control-browser-recipe.mjs", "scripts/lib/realloc-composite-control-recipe.mjs",
    "scripts/lib/realloc-export-only-control.mjs", "scripts/lib/refstruct-export-only-control.mjs",
    "scripts/check-wasm-abort-capture-origin-checked.mjs", "scripts/lib/installed-chrome-pin.mjs", "AGENTS.md", "package.json", "package-lock.json",
    "scripts/lib/private-browser-request.mjs", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/host-memory-preflight.mjs",
    "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/chromium-private-memory.mjs", "scripts/lib/microsecond-native-type-join.mjs",
    "scripts/lib/wasm-stack-symbols.mjs", ...Object.keys(observers.files).map(file => "scripts/lib/" + file)])];
  for (let i = 0; i < files.length; i++) {
    assert.ok(files.length <= 128);
    if (!files[i].endsWith(".mjs")) continue;
    for (const match of (await read(files[i])).toString().matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
      const file = path.relative(root, path.resolve(root, path.dirname(files[i]), match[1])).replaceAll("\\", "/");
      assert.ok(file && !file.startsWith("../") && !path.isAbsolute(file)); if (!files.includes(file)) files.push(file);
    }
  }
  const sourcePins = {}, preimages = {};
  for (const file of files) { const bytes = await read(file); assert.ok(bytes.length <= 2097152); sourcePins[file] = sha(bytes); preimages[file] = bytes.toString("base64"); }
  const raw = Buffer.from(JSON.stringify({ recipe, observers, exportRecipe, factorySource, baseFactorySource, compositeFactorySource, sourcePins, preimages }));
  assert.ok(raw.length <= 2097152);
  const zipped = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(zipped), raw);
  const archivePath = `outputs/reports/${stamp}-ebml-reuse-browser-control-sources.json.gz`;
  await writeFile(path.join(root, archivePath), zipped, { flag: "wx" });
  receipt = { recordedAt: new Date().toISOString(), status: "prepared-not-executed", failure: null, proof: null,
    nativeEnvelope: native.envelope, nativeEnvelopePost: null, sourcePins, postSourcePins: null,
    archive: { path: archivePath, bytes: zipped.length, sha256: sha(zipped), restoredBytes: raw.length, restoredSha256: sha(raw) },
    sourceSealScopes: { native: { maximumFiles: 128, maximumRestoredBytes: 2097152, actualFiles: 93 },
      browser: { maximumFiles: 128, maximumRestoredBytes: 2097152, actualFiles: files.length },
      distinctTotalFiles: new Set([...Object.keys(native.envelope.currentSourcePins), ...files]).size },
    browserPinBefore: pin, browserPinAfter: null, launchHostPreflight: await inspectStressHostMemory(),
    ownedCaller: runtime.directory, syntheticExportOnlyBinaryRemovedWithCallerScratch: false, browserDriverImported: false,
    browserConversionsPerformed: 0, protectedSourceRead: false, publicAcceptance: false };
  if (!receipt.launchHostPreflight.safeToStart) { receipt.status = "held-before-browser-insufficient-host-memory"; receipt.browsersLaunched = 0; }
  else {
    receipt.browserDriverImported = true;
    const driver = path.join(runtime.directory, "driver.mjs"); await writeFile(driver, recipe.generated, { flag: "wx" });
    try {
      await import(pathToFileURL(driver).href);
      const proofPath = `evidence/${stamp}-ebml-reuse-browser-control.json`, bytes = await read(proofPath);
      const proof = JSON.parse(bytes); assert.equal(proof.status, "passed-synthetic-abort-control"); assert.equal(proof.browserVersion, pin.version);
      receipt.proof = { path: proofPath, sha256: sha(bytes), status: proof.status }; receipt.actualRuntimeBrowserVersion = proof.browserVersion;
      receipt.status = "actual-headless-ebml-reuse-control-executed-not-media-acceptance";
    } catch (error) { receipt.failure = String(error.stack ?? error).slice(0,8192); receipt.status = "failed-browser-control"; process.exitCode = 1; }
  }
  receipt.postSourcePins = {}; for (const [file, expected] of Object.entries(sourcePins)) { receipt.postSourcePins[file] = sha(await read(file)); assert.equal(receipt.postSourcePins[file], expected); }
  receipt.nativeEnvelopePost = (await verifyEbmlNative(root)).envelope; assert.deepEqual(receipt.nativeEnvelopePost, native.envelope);
  receipt.browserPinAfter = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(pin, receipt.browserPinAfter);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch = true;
const output = `evidence/${stamp}-ebml-reuse-browser-control-executed-sources.json`;
await writeFile(path.join(root, output), JSON.stringify(receipt,null,2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: receipt.status, proof: receipt.proof, failure: receipt.failure, sourceScopes: receipt.sourceSealScopes }));
