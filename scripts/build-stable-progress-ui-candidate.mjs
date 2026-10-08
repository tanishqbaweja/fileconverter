// Build the real production app with one source overlay; never edit published TSX.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createBuilder } from "vite";
import ts from "typescript";
import { ESLint } from "eslint";
import { makeStableProgressUiSource, recoverStableProgressUiBaseline } from "./lib/stable-progress-ui-recipe.mjs";

const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const stamp = process.argv[2]; assert.match(stamp, /^\d{4}-\d{2}-\d{2}T[0-9TZ-]+$/);
assert.equal(process.argv.length, 3);
const appPath = path.join(root, "app/converter/ConverterApp.tsx");
const baseline = await readFile(appPath, "utf8"), candidate = makeStableProgressUiSource(baseline);
assert.equal(recoverStableProgressUiBaseline(candidate), baseline);
const lint = await new ESLint().lintText(candidate, { filePath: appPath });
assert.ok(lint.every(row => row.errorCount === 0 && row.warningCount === 0), JSON.stringify(lint.map(row => row.messages)));
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile); assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const options = { ...parsed.options, incremental: false, noEmit: true };
const host = ts.createCompilerHost(options), originalRead = host.readFile;
host.readFile = file => path.resolve(file).toLowerCase() === appPath.toLowerCase() ? candidate : originalRead(file);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, options, host));
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => "\n",
}));
const overlayLoads = [];
const builder = await createBuilder({ root, plugins: [{
  name: "within-private-stable-progress-ui-overlay", enforce: "pre",
  load(id) {
    if (path.resolve(id.split("?")[0]).toLowerCase() !== appPath.toLowerCase()) return null;
    assert.ok(overlayLoads.length < 16);
    overlayLoads.push({ environment: this.environment.name, id });
    return candidate;
  },
}] });
await builder.buildApp();
assert.ok(overlayLoads.some(row => row.environment === "client"), "Candidate must enter the actual production client build");
assert.equal(await readFile(appPath, "utf8"), baseline, "Published source must remain unchanged");
const assets = [];
for (const name of await readdir(path.join(root, "dist/client/assets"))) {
  if (!/^ConverterApp-.*\.js$/.test(name)) continue;
  const bytes = await readFile(path.join(root, "dist/client/assets", name)); assert.ok(bytes.length < 1048576);
  assets.push({ url: `/assets/${name}`, bytes: bytes.length, sha256: sha(bytes) });
}
assert.equal(assets.length, 1);
const archivedSource = gzipSync(Buffer.from(candidate), { level: 9 }); assert.ok(archivedSource.length < 32768);
const archivePath = `outputs/reports/${stamp}-stable-progress-ui-candidate.tsx.gz`;
await writeFile(path.join(root, archivePath), archivedSource, { flag: "wx" });
const proof = { recordedAt: new Date().toISOString(), status: "production-candidate-built-not-browser-acceptance",
  baselineSha256: sha(baseline), candidateSha256: sha(candidate), candidateBytes: Buffer.byteLength(candidate),
  archive: { path: archivePath, bytes: archivedSource.length, sha256: sha(archivedSource) },
  candidateLintErrors: 0, candidateLintWarnings: 0, candidateTypeDiagnostics: 0, overlayLoads, assets,
  publishedSourceUnchanged: true, cssChanged: false, engineChanged: false, limitsChanged: false,
  publicAcceptance: false, conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false };
const proofPath = `evidence/${stamp}-stable-progress-ui-build.json`;
await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, ...proof }));
