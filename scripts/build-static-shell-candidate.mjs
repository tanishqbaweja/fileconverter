// Finite, disposable build feasibility experiment, never a production replacement.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { runStaticShellCandidatePrivacy } from "./lib/static-shell-candidate-privacy.mjs";

const privacy = process.argv[2] === "--privacy";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && privacy));
const root = path.resolve(import.meta.dirname, ".."), sha = value => createHash("sha256").update(value).digest("hex");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running",
  scope: privacy ? "Private static-shell build, unchanged 19-case headless privacy suite and artifact-size comparison; not memory, fidelity, speed or deployment acceptance" :
    "Private static-shell BUILD feasibility and artifact-size comparison only; not browser conversion, memory, speed or deployment acceptance",
  browserLaunched: false, userFilesRead: false, conversionAcceptance: false, memoryAcceptance: false,
  productionReplacement: false, publicPromotion: false, sourcePins: {}, failures: [] };
const protect = ["package.json", "package-lock.json", "vite.config.ts", "worker/index.ts", ".openai/hosting.json",
  "build/sites-vite-plugin.ts", "app/page.tsx", "app/layout.tsx", "app/globals.css", "app/converter/ConverterApp.tsx",
  "lib/capability-registry.ts", "public/sw.js", "dist/server/wrangler.json", "dist/server/index.js",
  "scripts/lib/static-shell-candidate-privacy.mjs", "lib/static-host-request-policy.ts", "public/_headers", "playwright.config.ts",
  "tests/browser/privacy-offline.spec.ts", "tests/browser/static-host-policy.spec.ts",
  "scripts/build-static-shell-candidate.mjs", "scripts/static-shell-candidate/client.tsx", "scripts/static-shell-candidate/prerender.tsx"];
for (const file of protect) report.sourcePins[file] = sha(await readFile(path.join(root, file)));
let runtime;
try {
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3, "Private app-build disk safety gate");
  runtime = await createOwnedRuntimeScratch("static-shell-candidate-");
  const beforeEnvironment = {};
  for (const name of ["TEMP", "TMP", "TMPDIR", "NODE_COMPILE_CACHE"]) { beforeEnvironment[name] = process.env[name]; process.env[name] = runtime.env[name]; }
  try {
    const ssrDirectory = path.join(runtime.directory, "ssr"), clientDirectory = path.join(runtime.directory, "client");
    const common = { root, configFile: false, publicDir: path.join(root, "public"), plugins: [react()], logLevel: "warn" };
    const ssrStarted = performance.now();
    await build({ ...common, build: { ssr: path.join(root, "scripts/static-shell-candidate/prerender.tsx"),
      outDir: ssrDirectory, copyPublicDir: false, emptyOutDir: true, rollupOptions: { output: { entryFileNames: "prerender.mjs" } } } });
    report.prerenderBuildMs = performance.now() - ssrStarted;
    const { renderApplicationShell } = await import(pathToFileURL(path.join(ssrDirectory, "prerender.mjs")).href);
    const applicationHtml = renderApplicationShell();
    assert.match(applicationHtml, /Big files\./); assert.match(applicationHtml, /Small memory\./);
    report.prerenderedApplication = { bytes: Buffer.byteLength(applicationHtml), sha256: sha(applicationHtml),
      actualHomeAndConverterComponent: true, generatedProgressOrConversionData: false };
    // Check real initial UI landmarks, not an invented minimum HTML byte count.
    for (const landmark of ['id="file-input"', 'id="convert-title"', 'id="proof"', 'aria-label="Core guarantees"'])
      assert.ok(applicationHtml.includes(landmark), `Missing real initial UI landmark: ${landmark}`);
    assert.equal(applicationHtml.includes('data-testid="convert-button"'), false, "No conversion controls before an actual file is selected");
    assert.ok(Buffer.byteLength(applicationHtml) < 262144, "Application shell HTML cap");
    const sourceDirectory = path.join(runtime.directory, "source"); await mkdir(sourceDirectory);
    const htmlPath = path.join(sourceDirectory, "index.html");
    const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Within — private file conversion</title><meta name="description" content="Convert files entirely on your device with bounded memory and direct-to-disk output."><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg"></head><body><div id="within-app">${applicationHtml}</div><script type="module" src="/scripts/static-shell-candidate/client.tsx"></script></body></html>`;
    await writeFile(htmlPath, document, { flag: "wx" });
    const clientStarted = performance.now();
    const result = await build({ ...common, build: { outDir: clientDirectory, copyPublicDir: true, emptyOutDir: true,
      rollupOptions: { input: htmlPath } } });
    report.clientBuildMs = performance.now() - clientStarted;
    const output = Array.isArray(result) ? result.flatMap(value => value.output) : result.output;
    const html = output.filter(file => file.type === "asset" && file.fileName.endsWith("index.html"));
    assert.equal(html.length, 1); const deliveredHtml = String(html[0].source);
    const assetPaths = [...new Set([...deliveredHtml.matchAll(/\b(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1]))];
    assert.ok(assetPaths.length > 0 && assetPaths.length <= 32);
    const describeAssets = async (directory, assets) => {
      const rows = [];
      for (const pathname of assets) {
        const filename = path.join(directory, pathname.slice(1)), info = await stat(filename);
        assert.ok(info.isFile() && info.size < 4 * 1048576, "Only bounded application bootstrap assets enter byte comparison");
        const bytes = await readFile(filename); rows.push({ pathname, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: sha(bytes) });
      }
      return { assets: rows, javascriptBytes: rows.filter(row => row.pathname.endsWith(".js")).reduce((sum, row) => sum + row.bytes, 0),
        javascriptGzipBytes: rows.filter(row => row.pathname.endsWith(".js")).reduce((sum, row) => sum + row.gzipBytes, 0) };
    };
    report.candidateBootstrap = await describeAssets(clientDirectory, assetPaths);
    const baseline = JSON.parse(await readFile(path.join(root, "evidence/2026-10-27T10-21-32-023Z-owned-privacy-offline.json")));
    report.baselineBootstrap = await describeAssets(path.join(root, "dist/client"), baseline.assetPreflight.map(row => row.path));
    report.comparison = { baseline: "Exact existing SDK-qualified production bootstrap assets, not a browser benchmark",
      rawJavascriptBytesSaved: report.baselineBootstrap.javascriptBytes - report.candidateBootstrap.javascriptBytes,
      gzipJavascriptBytesSaved: report.baselineBootstrap.javascriptGzipBytes - report.candidateBootstrap.javascriptGzipBytes };
    // Verify complete public application assets were copied; never select or copy test.mkv.
    let copiedFiles = 0, copiedBytes = 0;
    for (const relative of await readdir(path.join(root, "public"), { recursive: true })) {
      const original = path.join(root, "public", relative), info = await stat(original);
      if (!info.isFile()) continue;
      assert.equal((await stat(path.join(clientDirectory, relative))).size, info.size, relative);
      copiedFiles++; copiedBytes += info.size;
    }
    report.publicAssets = { filesPresentAtMatchingSize: copiedFiles, bytes: copiedBytes,
      byteIdentityIndependentlyValidated: false, note: "Presence/size check only; no browser or independent conversion qualification" };
    report.knownOpenGates = ["full metadata/SEO parity", "Sites deployment metadata packaging", "static-only hosting worker",
      "unchanged privacy/offline and conversion suites", "whole-Chromium memory A/B", "large-file/repeat/adverse recovery", "all original scope requirements"];
    if (privacy) await runStaticShellCandidatePrivacy({ root, runtime, clientDirectory, htmlFilename: html[0].fileName, report, stamp });
    report.status = "completed-private-build-feasibility-not-acceptance";
  } finally {
    for (const [name, previous] of Object.entries(beforeEnvironment)) { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }
  }
} catch (error) { report.status = "failed-private-build-feasibility"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  if (runtime && report.privacy?.safeToRemoveRuntime !== false) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); report.ownedRuntimeRemoved = true; }
  for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, `Production/source pin changed: ${file}`);
  report.finishedAt = new Date().toISOString();
  const filename = path.join(root, "evidence", `${stamp}-static-shell-build.json`);
  await writeFile(filename, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, filename), status: report.status, comparison: report.comparison ?? null,
    ownedRuntimeRemoved: report.ownedRuntimeRemoved ?? false, failures: report.failures }));
}
