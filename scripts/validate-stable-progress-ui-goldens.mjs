// Changed sampled UI candidate through the unchanged five genuine headed cases.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeHeroWidthGoldenSpec, makeHeroWidthGoldenDriver } from "./lib/mpeg2-hero-width-golden-recipe.mjs";

const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex"), exec = promisify(execFile);
assert.equal(process.argv.length, 2);
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const sourcePins = {};
for (const file of ["scripts/validate-stable-progress-ui-goldens.mjs", "scripts/build-stable-progress-ui-candidate.mjs",
  "scripts/lib/stable-progress-ui-recipe.mjs", "tests/stable-progress-ui.test.mjs", "app/converter/ConverterApp.tsx", "app/globals.css",
  "vite.config.ts", "scripts/lib/mpeg2-hero-width-golden-recipe.mjs", "scripts/lib/mpeg2-matrix-golden-recipe.mjs",
  "scripts/validate-mpeg2-split-direct.mjs", "scripts/stage-mpeg2-late-allocator-abort.mjs", "tests/browser/mpeg2-split-direct-candidate.spec.ts"])
  sourcePins[file] = sha(await readFile(path.join(root, file)));
const host = await inspectStressHostMemory(); console.log(JSON.stringify({ host })); assert.equal(host.safeToStart, true);
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 2 * 1024 ** 3);
const originalPath = path.join(root, "test.mkv"), verifyOriginal = async () => {
  assert.equal((await stat(originalPath)).size, 2958573265);
  const hash = createHash("sha256"); for await (const chunk of createReadStream(originalPath)) hash.update(chunk);
  const digest = hash.digest("hex"); assert.equal(digest, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  return { bytes: 2958573265, sha256: digest };
};
const protectedPre = await verifyOriginal();
const reportsRoot = path.join(root, "output/playwright"), before = new Set(await readdir(reportsRoot));
const runtime = await createOwnedRuntimeScratch("stable-progress-ui-goldens-");
let failure = null, build, spec, driver, config, protectedPost, restoredProductionBuild = false;
try {
  const built = await exec(process.execPath, ["scripts/build-stable-progress-ui-candidate.mjs", stamp],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2 * 1048576 });
  console.log(built.stdout.slice(-2000));
  build = JSON.parse(await readFile(path.join(root, `evidence/${stamp}-stable-progress-ui-build.json`)));
  const specPath = path.join(runtime.directory, "candidate.spec.ts"), configPath = path.join(runtime.directory, "playwright.config.mjs");
  spec = makeHeroWidthGoldenSpec(await readFile(path.join(root, "tests/browser/mpeg2-split-direct-candidate.spec.ts"), "utf8"),
    root, stamp + "-matrix-goldens", sourcePins["tests/browser/mpeg2-split-direct-candidate.spec.ts"]);
  const navigation = `
async function navigateCandidate(page: import("@playwright/test").Page, url: string) {
  const binding = ${JSON.stringify(build.assets[0])};
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === binding.url);
  void responsePromise.catch(() => {});
  await page.goto(url);
  const response = await responsePromise; expect(response.ok()).toBe(true);
  const bytes = await response.body(); expect(bytes.length).toBe(binding.bytes);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(binding.sha256);
  rows.push({ kind: "actual-served-stable-ui-candidate", ...binding });
}
`;
  assert.equal(spec.split("await page.goto(").length, 4);
  spec = spec.replaceAll("await page.goto(", "await navigateCandidate(page, ") + navigation;
  config = `export default ${JSON.stringify({ testDir: runtime.directory, testMatch: "candidate.spec.ts", timeout: 60000,
    expect: { timeout: 15000 }, fullyParallel: false, workers: 1, retries: 0,
    use: { trace: "retain-on-failure", screenshot: "only-on-failure", video: "off" } })};\n`;
  config = config.replace('"use":{', '"use":{"baseURL":process.env.WITHIN_TEST_BASE_URL,');
  driver = makeHeroWidthGoldenDriver(await readFile(path.join(root, "scripts/validate-mpeg2-split-direct.mjs"), "utf8"), root, configPath);
  await writeFile(specPath, spec, { flag: "wx" }); await writeFile(configPath, config, { flag: "wx" });
  const driverPath = path.join(runtime.directory, "run.mjs"); await writeFile(driverPath, driver, { flag: "wx" });
  // Refresh the guard immediately before the first actual browser launch.
  assert.equal((await inspectStressHostMemory()).safeToStart, true);
  await import(pathToFileURL(driverPath).href);
  assert.ok(!process.exitCode, "Keep actual browser failures");
} catch (error) { failure = String(error.stack ?? error).slice(0, 4096); process.exitCode = 1; console.error(failure); }
finally {
  // The unchanged driver closes its browser/server and restores private assets first.
  try {
    const restored = await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2 * 1048576 });
    console.log(restored.stdout.slice(-1000)); restoredProductionBuild = true;
    protectedPost = await verifyOriginal();
  } catch (error) { failure = `${failure ?? ""}\nRestoration: ${error.stack ?? error}`.slice(0, 6144); process.exitCode = 1; }
  finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
}
const reports = [];
for (const name of (await readdir(reportsRoot)).filter(name => !before.has(name) && name.endsWith("-mpeg2-split-pipeline-37739125738-direct-artwork.json"))) {
  const bytes = await readFile(path.join(reportsRoot, name)); assert.ok(bytes.length < 2 * 1048576);
  reports.push({ path: `output/playwright/${name}`, bytes: bytes.length, sha256: sha(bytes) });
}
const postSourcePins = {};
for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await readFile(path.join(root, file)));
assert.deepEqual(postSourcePins, sourcePins, "Published and diagnostic sources remain byte-identical");
const generated = gzipSync(Buffer.from(JSON.stringify({ spec, driver, config })), { level: 9 }); assert.ok(generated.length < 32768);
const generatedPath = `outputs/reports/${stamp}-stable-ui-executed-sources.json.gz`;
await writeFile(path.join(root, generatedPath), generated, { flag: "wx" });
const proof = { recordedAt: new Date().toISOString(), status: failure ? "failed-or-incomplete" : "headed-suite-returned-success-independent-freeze-pending",
  failure, hostPreflight: host, diskPreflightBytes: disk.bavail * disk.bsize, protectedPre, protectedPost, sourcePins, postSourcePins,
  buildProof: `evidence/${stamp}-stable-progress-ui-build.json`, reports,
  generatedArchive: { path: generatedPath, bytes: generated.length, sha256: sha(generated) },
  generatedHashes: { spec: sha(spec ?? ""), driver: sha(driver ?? ""), config: sha(config ?? "") },
  cleanup: { ownedWrapper: runtime.directory, ownedWrapperRemoved: true, restoredProductionBuild },
  originalFullSourceAcceptance: false, publicAcceptance: false, completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false };
const proofPath = `evidence/${stamp}-stable-progress-ui-goldens.json`;
await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, status: proof.status, reports, cleanup: proof.cleanup }));
assert.equal(failure, null);
