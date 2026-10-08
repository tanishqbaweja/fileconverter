// Headed actual five-case production regression with the measured private matrix CSS.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeMatrixGoldenSpec, makeMatrixGoldenDriver } from "./lib/mpeg2-matrix-golden-recipe.mjs";

const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-late-allocator-abort-goldens-origin-bound-2026-10-08.json")));
assert.equal(prior.status, "browser-suite-returned-success-awaiting-independent-golden-freeze");
const sourcePins = { ...prior.sourcePins };
for (const file of ["scripts/validate-mpeg2-matrix-goldens.mjs", "scripts/lib/mpeg2-matrix-golden-recipe.mjs",
  "scripts/lib/ui-flex-layout-recipe.mjs", "scripts/lib/ui-matrix-flex-layout-recipe.mjs", "app/globals.css", "playwright.config.ts"])
  sourcePins[file] = sha(await readFile(path.join(root, file)));
for (const [file, hash] of Object.entries(sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
const proofPath = path.join(root, `evidence/${stamp}-mpeg2-matrix-goldens.json`);
await assert.rejects(access(proofPath), { code: "ENOENT" });
const host = await inspectStressHostMemory(); console.log(JSON.stringify({ host }));
assert.equal(host.safeToStart, true, "Keep physical AND virtual2GiB guard");
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
const reportsRoot = path.join(root, "output/playwright"), beforeReports = new Set(await readdir(reportsRoot));
const runtime = await createOwnedRuntimeScratch("mpeg2-matrix-goldens-wrapper-");
let failure = null, spec, driver, config;
try {
  const specPath = path.join(runtime.directory, "matrix-goldens.spec.ts"), configPath = path.join(runtime.directory, "playwright.config.mjs");
  spec = makeMatrixGoldenSpec(await readFile(path.join(root, "tests/browser/mpeg2-split-direct-candidate.spec.ts"), "utf8"),
    root, stamp + "-matrix-goldens", sourcePins["tests/browser/mpeg2-split-direct-candidate.spec.ts"]);
  config = `export default ${JSON.stringify({ testDir: runtime.directory, testMatch: "matrix-goldens.spec.ts",
    timeout: 60000, expect: { timeout: 15000 }, fullyParallel: false, workers: 1, retries: 0,
    use: { trace: "retain-on-failure", screenshot: "only-on-failure", video: "off" } })};\n`;
  // Environment URL is allocated by the unchanged original driver.
  config = config.replace('"use":{', '"use":{"baseURL":process.env.WITHIN_TEST_BASE_URL,');
  driver = makeMatrixGoldenDriver(await readFile(path.join(root, "scripts/validate-mpeg2-split-direct.mjs"), "utf8"), root, configPath);
  await writeFile(specPath, spec, { flag: "wx" }); await writeFile(configPath, config, { flag: "wx" });
  const driverPath = path.join(runtime.directory, "driver.mjs"); await writeFile(driverPath, driver, { flag: "wx" });
  await import(pathToFileURL(driverPath).href);
} catch (error) { failure = String(error).slice(0, 2048); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const reports = [];
for (const file of (await readdir(reportsRoot)).filter(f => !beforeReports.has(f) && f.endsWith("-mpeg2-split-pipeline-37739125738-direct-artwork.json"))) {
  const bytes = await readFile(path.join(reportsRoot, file)); assert.ok(bytes.length <= 2 * 1048576);
  reports.push({ path: "output/playwright/" + file, bytes: bytes.length, sha256: sha(bytes) });
}
const postSourcePins = {};
for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await readFile(path.join(root, file)));
const pinsUnchanged = JSON.stringify(sourcePins) === JSON.stringify(postSourcePins);
const passed = !failure && !process.exitCode && pinsUnchanged && reports.length === 1;
const proof = { recordedAt: new Date().toISOString(), status: passed ? "headed-browser-suite-success-awaiting-independent-freeze-and-visual-review" : "failed-or-incomplete",
  failure, hostPreflight: host, diskPreflightBytes: disk.bavail * disk.bsize, sourcePins, postSourcePins, pinsUnchanged, reports,
  generatedSources: { spec, driver, config }, generatedHashes: { spec: sha(spec ?? ""), driver: sha(driver ?? ""), config: sha(config ?? "") },
  ownedWrapper: runtime.directory, ownedWrapperRemoved: true, noDocker: true, nativeConverterUsed: false,
  protectedOriginalRead: false, conversionsUseNormalCompiledCore: true, publishedSourceChanged: false,
  completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false, publicAcceptance: false, conversionSpeedAcceptance: false };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 2 * 1048576);
await writeFile(proofPath, json, { flag: "wx" }); console.log(JSON.stringify({ proofPath, status: proof.status, failure, reports }));
assert.ok(passed, "Keep actual failure; diagnose before retry");
