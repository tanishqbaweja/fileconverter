// Actual private production build; frozen public app/worker are never edited.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { createBuilder } from "vite";
import { ESLint } from "eslint";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeStagedHandoffApp, makeStagedHandoffWorker } from "./lib/staged-worker-handoff-recipe.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = process.argv[2];
assert.match(stamp ?? "", /^\d{4}-\d\d-\d\dT[\d-]+Z$/);
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === "--for-browser"));
const forBrowser = process.argv[3] === "--for-browser";
const host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true);
const appFile = "app/converter/ConverterApp.tsx", workerFile = "workers/conversion.worker.ts";
const app = await readFile(path.join(root, appFile), "utf8"), worker = await readFile(path.join(root, workerFile), "utf8");
const appRecipe = makeStagedHandoffApp(app), workerRecipe = makeStagedHandoffWorker(worker);
const originals = new Map([[appFile, app], [workerFile, worker]]);
const overlays = new Map([[path.join(root, appFile).toLowerCase(), appRecipe.generated], [path.join(root, workerFile).toLowerCase(), workerRecipe.generated]]);
const files = ["scripts/build-staged-handoff-candidate.mjs", "scripts/lib/staged-worker-handoff-recipe.mjs", appFile, workerFile,
  "lib/staged-copy-protocol.ts", "lib/staged-worker-coordinator.ts", "workers/staged-save-runtime.ts", "workers/staged-save.worker.ts",
  "tests/staged-worker-coordinator.test.mjs", "tests/staged-save-runtime.test.mjs", "app/globals.css", "workers/media-remux.ts",
  "lib/conversion-protocol.ts", "lib/resource-limits.ts", "package-lock.json", "tsconfig.json", "vite.config.ts"];
const sourcePins = {}, preimages = {};
for (const file of files) { const bytes = await readFile(path.join(root, file)); sourcePins[file] = sha(bytes); preimages[file] = bytes.toString("base64"); }
assert.equal(sha(await readFile(path.join(root, "dist/client" + baselineBinding.url))), baselineBinding.sha256);
const eslint = new ESLint();
for (const [file, generated] of [[appFile, appRecipe.generated], [workerFile, workerRecipe.generated]]) {
  const result = await eslint.lintText(generated, { filePath: path.join(root, file) });
  assert.ok(result.every(row => !row.errorCount && !row.warningCount), JSON.stringify(result.map(row => row.messages)));
}
const loads = [];
const overlayPlugin = () => ({ name: "within-private-staged-worker-handoff", enforce: "pre", load(id) {
  const source = overlays.get(path.resolve(id.split("?")[0]).toLowerCase()); if (source === undefined) return null;
  assert.ok(loads.length < 64); loads.push({ environment: this.environment?.name ?? "worker", id }); return source;
} });
const archive = async (suffix, raw) => {
  assert.ok(raw.length <= 2097152); const zip = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(zip), raw);
  const file = `outputs/reports/${stamp}-staged-worker-handoff-${suffix}.gz`;
  await writeFile(path.join(root, file), zip, { flag: "wx" }); assert.equal(sha(await readFile(path.join(root, file))), sha(zip));
  return { path: file, bytes: zip.length, sha256: sha(zip), restoredBytes: raw.length, restoredSha256: sha(raw) };
};
let started = false, restored = false, proof;
try {
  const builder = await createBuilder({ root, plugins: [overlayPlugin()], worker: { plugins: () => [overlayPlugin()] } });
  started = true; await builder.buildApp();
  assert.ok(loads.some(row => path.resolve(row.id.split("?")[0]).toLowerCase() === path.join(root, appFile).toLowerCase()));
  assert.ok(loads.some(row => path.resolve(row.id.split("?")[0]).toLowerCase() === path.join(root, workerFile).toLowerCase()));
  const names = await readdir(path.join(root, "dist/client/assets"));
  const select = async expression => {
    const matches = names.filter(name => expression.test(name)); assert.equal(matches.length, 1, expression.toString());
    const url = "/assets/" + matches[0], bytes = await readFile(path.join(root, "dist/client", url)); return { url, bytes };
  };
  const main = await select(/^ConverterApp-.*\.js$/), codec = await select(/^conversion\.worker-.*\.js$/), saver = await select(/^staged-save\.worker-.*\.js$/);
  assert.ok(codec.bytes.toString().includes("staged-copy-handoff")); assert.ok(main.bytes.toString().includes("staged-copy-handoff"));
  assert.ok(saver.bytes.length < 32768 && saver.bytes.toString().includes("Copying staged MP4 to selected destination"));
  assert.equal(/WebAssembly\.(?:Memory|instantiate|compile)/.test(saver.bytes.toString()), false);
  const assets = [];
  for (const [role, row] of [["application", main], ["codec-worker", codec], ["save-worker", saver]]) {
    assets.push({ role, url: row.url, bytes: row.bytes.length, sha256: sha(row.bytes), archive: await archive(role + ".js", row.bytes) });
  }
  const sources = Buffer.from(JSON.stringify({ sourcePins, preimages, appRecipe, workerRecipe }));
  proof = { recordedAt: new Date().toISOString(), status: "private-production-worker-handoff-built-not-browser-or-memory-acceptance", host,
    sourcePins, postSourcePins: {}, sourceArchive: await archive("changed-and-entry-sources.json", sources),
    sourceSealScope: "changed-modules-and-production-entrypoints-not-an-entire-executed-media-source-closure", loads, assets,
    privateAppEdits: appRecipe.edits.length, privateWorkerEdits: workerRecipe.edits.length,
    codecParametersChanged: false, nativeWasmChanged: false, copyLoopChanged: false, fixedCopyBufferBytes: 524288,
    normalSourcesEdited: false, normalProductionRestored: false, forBrowser,
    genuineBrowserConversionPerformed: false, primaryMemoryAcceptance: false, fullOriginalAcceptance: false, publicAcceptance: false, speedGainProven: false };
} finally {
  if (started && !forBrowser) {
    await promisify(execFile)(process.execPath, ["node_modules/vinext/dist/cli.js", "build"],
      { cwd: root, env: process.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
    assert.equal(sha(await readFile(path.join(root, "dist/client" + baselineBinding.url))), baselineBinding.sha256); restored = true;
  }
  for (const [file, source] of originals) assert.equal(await readFile(path.join(root, file), "utf8"), source);
  for (const [file, hash] of Object.entries(sourcePins)) { const current = sha(await readFile(path.join(root, file))); assert.equal(current, hash, file); if (proof) proof.postSourcePins[file] = current; }
}
assert.ok(proof); proof.normalProductionRestored = restored;
const output = `evidence/${stamp}-staged-worker-handoff-build.json`; await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, assets: proof.assets.map(({ role, bytes, sha256 }) => ({ role, bytes, sha256 })), normalProductionRestored: restored }));
