// ONE synthetic allocation control, ZERO media conversions; scratch finally removed.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeDirectBufferExportControlRecipe, inspectDirectBufferExportControl } from "./lib/direct-buffer-export-only-control.mjs";
import { makeDirectBufferControlBrowserRecipe, directBufferControlFiles } from "./lib/direct-buffer-control-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const layoutPath = "evidence/mpeg2-single-idle-abort-layout-2026-10-10.json", layout = JSON.parse(await read(layoutPath));
assert.equal(layout.status, "new-binary-abort-ABI-byte-exact-qualified-not-conversion-acceptance");
assert.equal(layout.allocator.address, 1786520); assert.equal(layout.allocator.bytes, 496);
for (const [file, hash] of Object.entries(layout.sourcePins)) assert.equal(sha(await read(file)), hash, file);
const binary = await read(layout.binary.path); assert.equal(sha(binary), layout.binary.sha256); assert.equal(binary.length, layout.binary.bytes);
assert.equal(sha(await read("work/mpeg2-single-idle-37986418102/decoder-link.map")), layout.mapSha256);
const source = (await read("scripts/lib/refstruct-export-only-control.mjs")).toString();
const exportRecipe = makeDirectBufferExportControlRecipe(source);
let factorySource = exportRecipe.generated;
for (const name of ["wasm-function-metadata.mjs"])
  factorySource = factorySource.replace(`from "./${name}"`, `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", name)).href)}`);
const runtime = await createOwnedRuntimeScratch("direct-buffer-abort-control-caller-");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
let archiveReceipt;
try {
  const factoryFile = path.join(runtime.directory, "factory.mjs"); await writeFile(factoryFile, factorySource, { flag: "wx" });
  const { createDirectBufferExportOnlyControl } = await import(pathToFileURL(factoryFile).href);
  const control = createDirectBufferExportOnlyControl(binary); inspectDirectBufferExportControl(control);
  const controlPath = path.join(runtime.directory, "synthetic-export-only.wasm"); await writeFile(controlPath, control.binary, { flag: "wx" });
  const recipe = makeDirectBufferControlBrowserRecipe((await read("scripts/check-wasm-abort-capture-origin-checked.mjs")).toString(), root, controlPath, control, stamp);
  const files = [...new Set([...directBufferControlFiles, ...Object.keys(layout.sourcePins), "AGENTS.md", "package.json", "package-lock.json",
    "scripts/check-wasm-abort-capture-origin-checked.mjs",
    "scripts/lib/private-browser-request.mjs", "scripts/lib/bounded-wasm-abort-capture.mjs", "scripts/lib/wasm-stack-symbols.mjs",
    "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/host-memory-preflight.mjs", "scripts/lib/chromium-private-memory.mjs",
    "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/microsecond-native-type-join.mjs", "scripts/lib/stable-ui-headless-baseline-recipe.mjs"])];
  // Recursively include actual repository-local Node imports. Package versions
  // are bound by package-lock; builtins do not become fabricated source files.
  for (let index = 0; index < files.length; index++) {
    assert.ok(files.length <= 128);
    if (!files[index].endsWith(".mjs")) continue;
    const text = (await read(files[index])).toString();
    for (const match of text.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
      const absolute = path.resolve(root, path.dirname(files[index]), match[1]), relative = path.relative(root, absolute).replaceAll("\\", "/");
      assert.ok(relative && !relative.startsWith("../") && !path.isAbsolute(relative));
      if (!files.includes(relative)) files.push(relative);
    }
  }
  const pins = {}, preimages = {};
  for (const file of files) { const bytes = await read(file); assert.ok(bytes.length <= 2097152); pins[file] = sha(bytes); preimages[file] = bytes.toString("base64"); }
  const archiveBytes = Buffer.from(JSON.stringify({ ...recipe, factorySource, sourcePins: pins, preimages })); assert.ok(archiveBytes.length <= 2097152);
  const zipped = gzipSync(archiveBytes, { level: 9 }); assert.deepEqual(gunzipSync(zipped), archiveBytes);
  const archivePath = `outputs/reports/${stamp}-direct-buffer-abort-control-sources.json.gz`; await writeFile(path.join(root, archivePath), zipped, { flag: "wx" });
  const driverFile = path.join(runtime.directory, "driver.mjs"); await writeFile(driverFile, recipe.generated, { flag: "wx" });
  archiveReceipt = { recordedAt: new Date().toISOString(), status: "prepared-synthetic-control-not-executed",
    proof: null, failure: null, sourcePins: pins, postSourcePins: null, browserDriverImported: false,
    archive: { path: archivePath, bytes: zipped.length, sha256: sha(zipped), restoredBytes: archiveBytes.length, restoredSha256: sha(archiveBytes) },
    layout: { path: layoutPath, sha256: sha(await read(layoutPath)) }, originalBinarySha256: layout.binary.sha256,
    ownedCaller: runtime.directory, syntheticExportOnlyBinaryRemovedWithCallerScratch: false,
    browserConversionsPerformed: 0, protectedSourceRead: false, publicAcceptance: false };
  archiveReceipt.launchHostPreflight = await inspectStressHostMemory();
  if (!archiveReceipt.launchHostPreflight.safeToStart) {
    archiveReceipt.status = "held-before-browser-import-insufficient-host-memory";
    archiveReceipt.browsersLaunched = 0;
  } else {
    archiveReceipt.browserDriverImported = true;
    try {
      await import(pathToFileURL(driverFile).href);
      const receiptPath = `evidence/${stamp}-direct-buffer-abort-control.json`, receiptBytes = await read(receiptPath), proof = JSON.parse(receiptBytes);
      archiveReceipt.proof = { path: receiptPath, sha256: sha(receiptBytes), status: proof.status };
      archiveReceipt.status = "actual-synthetic-direct-buffer-control-executed-sources-not-media-acceptance";
    } catch (error) {
      archiveReceipt.failure = String(error.stack ?? error).slice(0, 8192);
      archiveReceipt.status = "failed-synthetic-control-driver-import-not-acceptance";
      process.exitCode = 1;
    }
  }
  archiveReceipt.postSourcePins = {};
  for (const [file, hash] of Object.entries(pins)) {
    archiveReceipt.postSourcePins[file] = sha(await read(file)); assert.equal(archiveReceipt.postSourcePins[file], hash, file);
  }
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
archiveReceipt.syntheticExportOnlyBinaryRemovedWithCallerScratch = true;
const output = `evidence/${stamp}-direct-buffer-abort-control-executed-sources.json`;
await writeFile(path.join(root, output), JSON.stringify(archiveReceipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ executedSources: output, browserConversionsPerformed: 0 }));
