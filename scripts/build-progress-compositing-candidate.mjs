// Private source overlays only. Always restore normal production unless caller owns browser finally.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { createBuilder } from "vite";
import { ESLint } from "eslint";
import ts from "typescript";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeProgressCompositingCandidate } from "./lib/progress-compositing-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = process.argv[2];
assert.match(stamp, /^\d{4}-\d{2}-\d{2}T[0-9TZ-]+$/);
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === "--for-browser"));
const forBrowser = process.argv[3] === "--for-browser";
const appPath = path.join(root, "app/converter/ConverterApp.tsx"), cssPath = path.join(root, "app/globals.css");
const app = await readFile(appPath, "utf8"), css = await readFile(cssPath, "utf8"), recipe = makeProgressCompositingCandidate(app, css);
const pins = {};
for (const file of ["scripts/build-progress-compositing-candidate.mjs", "scripts/lib/progress-compositing-recipe.mjs", "tests/progress-compositing.test.mjs",
  "app/converter/ConverterApp.tsx", "app/globals.css", "workers/conversion.worker.ts", "workers/media-remux.ts", "package-lock.json", "tsconfig.json"])
  pins[file] = sha(await readFile(path.join(root, file)));
const baseline = await readFile(path.join(root, "dist/client" + baselineBinding.url)); assert.equal(sha(baseline), baselineBinding.sha256);
const lint = await new ESLint().lintText(recipe.app, { filePath: appPath });
assert.ok(lint.every(row => row.errorCount === 0 && row.warningCount === 0), JSON.stringify(lint.map(row => row.messages)));
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile); assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root), options = { ...parsed.options, incremental: false, noEmit: true };
const host = ts.createCompilerHost(options), read = host.readFile;
host.readFile = file => path.resolve(file).toLowerCase() === appPath.toLowerCase() ? recipe.app : read(file);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, options, host));
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics,
  { getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => "\n" }));
const archive = async (suffix, raw) => {
  const compressed = gzipSync(raw, { level: 9 }), file = `outputs/reports/${stamp}-progress-compositing-${suffix}.gz`;
  await writeFile(path.join(root, file), compressed, { flag: "wx" }); const saved = await readFile(path.join(root, file));
  assert.deepEqual(saved, compressed); assert.deepEqual(gunzipSync(saved), raw);
  return { path: file, bytes: compressed.length, sha256: sha(compressed), rawBytes: raw.length, rawSha256: sha(raw) };
};
const loads = []; let buildStarted = false, proof, restored = false;
try {
  const builder = await createBuilder({ root, plugins: [{ name: "within-private-progress-compositing-overlay", enforce: "pre", load(id) {
    const file = path.resolve(id.split("?")[0]).toLowerCase();
    if (file !== appPath.toLowerCase() && file !== cssPath.toLowerCase()) return null;
    assert.ok(loads.length < 32); loads.push({ environment: this.environment.name, id });
    return file === appPath.toLowerCase() ? recipe.app : recipe.css;
  } }] });
  buildStarted = true; await builder.buildApp();
  assert.ok(loads.some(row => row.environment === "client" && path.resolve(row.id.split("?")[0]).toLowerCase() === appPath.toLowerCase()));
  // Vinext can load CSS during the RSC pass and reuse the emitted stylesheet
  // in the client pass. Validate actual CLIENT CSS below, not a guessed hook pass.
  assert.ok(loads.some(row => path.resolve(row.id.split("?")[0]).toLowerCase() === cssPath.toLowerCase()));
  const assets = path.join(root, "dist/client/assets"), names = await readdir(assets);
  const apps = names.filter(name => /^ConverterApp-.*\.js$/.test(name)); assert.equal(apps.length, 1);
  const builtApp = await readFile(path.join(assets, apps[0])); assert.ok(builtApp.length < 1048576);
  const styles = [];
  for (const name of names.filter(name => name.endsWith(".css"))) {
    const bytes = await readFile(path.join(assets, name));
    if (bytes.toString().includes(".progress-track")) styles.push({ name, bytes });
  }
  assert.equal(styles.length, 1); const style = styles[0];
  assert.ok(style.bytes.toString().includes("transition:transform .16s linear"));
  assert.ok(style.bytes.toString().includes(".progress-track:before") || style.bytes.toString().includes(".progress-track::before"));
  proof = { recordedAt: new Date().toISOString(), status: "private-progress-compositing-built-not-conversion-acceptance", sourcePins: pins, loads,
    asset: { url: `/assets/${apps[0]}`, bytes: builtApp.length, sha256: sha(builtApp) },
    stylesheet: { url: `/assets/${style.name}`, bytes: style.bytes.length, sha256: sha(style.bytes) },
    sourceArchive: await archive("candidate-sources.json", Buffer.from(JSON.stringify(recipe))),
    appArchive: await archive("client.js", builtApp), cssArchive: await archive("client.css", style.bytes),
    candidateLintErrors: 0, candidateLintWarnings: 0, candidateTypeDiagnostics: 0,
    publishedSourceUnchanged: true, engineChanged: false, codecOptionsChanged: false, limitsChanged: false,
    cssChangedPrivately: true, forBrowser, normalProductionRestored: false,
    nativeAllocationCauseProven: false, conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false };
} finally {
  if (buildStarted && !forBrowser) {
    await promisify(execFile)(process.execPath, ["node_modules/vinext/dist/cli.js", "build"],
      { cwd: root, env: process.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
    assert.equal(sha(await readFile(path.join(root, "dist/client" + baselineBinding.url))), baselineBinding.sha256); restored = true;
  }
  assert.equal(await readFile(appPath, "utf8"), app); assert.equal(await readFile(cssPath, "utf8"), css);
  for (const [file, hash] of Object.entries(pins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
}
assert.ok(proof); proof.normalProductionRestored = restored;
const output = `evidence/${stamp}-progress-compositing-build.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, asset: proof.asset, stylesheet: proof.stylesheet, normalProductionRestored: restored }));
