// UI-only headless production check. No conversion, output or public qualification.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { chromium } from "playwright";
import { conversionProfiles, isPublishedProfile } from "../lib/capability-registry.ts";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { inspectInstalledChromePin } from "./lib/installed-chrome-pin.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { startChromiumMemoryMonitor } from "./lib/birth-aware-chromium-memory.mjs";
import { cleanupOwnedChromium, queryObservedPidCensus } from "./lib/owned-chromium-cleanup.mjs";
import { reconcileChromiumBirths } from "./lib/reconcile-chromium-births.mjs";
import { selectOwnedLocalBrowserFile } from "./lib/select-owned-local-browser-file.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { isCompatibilityStaticPath } from "./lib/installed-compatibility-plan.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), scope: "Unmodified production public/private selector and catalogue only; no conversion or memory acceptance",
  headless: true, windowsHide: true, conversions: 0, publicEngineReplacement: false, wholeGoalComplete: false, failures: [], requests: 0, forbiddenRequests: [], sourcePins: {} };
let runtime, server, child, browser, identity, monitor;
const samples = [];
async function drain() {
  if (!monitor) return;
  const batch = await monitor.drain();
  assert.ok(samples.length + batch.samples.length <= 4096); samples.push(...batch.samples);
}
async function port() {
  const probe = createServer(); await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const number = probe.address().port; await new Promise(resolve => probe.close(resolve)); return number;
}
try {
  assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 2);
  report.host = await inspectStressHostMemory(); assert.equal(report.host.safeToStart, true);
  for (const file of ["scripts/check-mkv-publication-hold.mjs", "app/converter/ConverterApp.tsx", "lib/capability-registry.ts", "lib/published-catalogue.ts", "evidence/public-profile-evidence.json"])
    report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  report.browser = await inspectInstalledChromePin(); runtime = await createOwnedRuntimeScratch("mkv-publication-check-");
  report.runtime = runtime.directory;
  const fixture = path.join(runtime.directory, "selection-only.mkv");
  await copyFile(path.join(root, "fixtures/media/within-test-synthetic-hevc-aac.mkv"), fixture);
  report.fixture = { bytes: (await lstat(fixture)).size, sha256: sha(await readFile(fixture)), reusableSourceModified: false };
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env: runtime.env, port: await port() });
  report.serverLaunch = server.launchRecord;
  const profile = path.join(runtime.directory, "profile");
  report.launch = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  child = spawn(report.browser.launcher.path, report.launch, { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  let spawnError; child.on("error", error => { spawnError = error; });
  identity = await queryReliableProcessIdentity(child.pid); assert.ok(identity); report.browserBirth = identity;
  await writeFile(path.join(runtime.directory, "browser-launch.json"), JSON.stringify({ identity, args: report.launch, windowsHide: true }) + "\n", { flag: "wx" });
  monitor = await startChromiumMemoryMonitor(child.pid, runtime.directory, 100);
  let debugPort;
  for (let attempt = 0; attempt < 45 && !debugPort; attempt++) {
    if (spawnError) throw spawnError;
    try { debugPort = /^(\d+)\r?\n/.exec(await readFile(path.join(profile, "DevToolsActivePort"), "utf8"))?.[1]; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!debugPort) await pause(250);
  }
  assert.ok(debugPort); browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = browser.contexts()[0], page = context.pages()[0], assets = new Set();
  for (const dir of ["assets", "engines"]) for (const name of await readdir(path.join(root, "dist/client", dir), { recursive: true }))
    if (!name.includes("..")) assets.add(`/${dir}/${name.replaceAll("\\", "/")}`);
  for (const name of await readdir(path.join(root, "dist/client"))) assets.add("/" + name);
  await context.route("**/*", async route => {
    const request = route.request(); let frameUrl = null; try { frameUrl = request.frame()?.url() ?? null; } catch {}
    const kind = classifyPrivateRequest({ method: request.method(), url: request.url(), postData: request.postData(), frameUrl,
      serviceWorkerUrl: request.serviceWorker?.()?.url() ?? null }, server.baseURL);
    if (++report.requests > 256 || !(kind === "browser-local" || kind === "app-static" && isCompatibilityStaticPath(request.url(), server.baseURL, assets))) {
      if (report.forbiddenRequests.length < 16) report.forbiddenRequests.push({ method: request.method(), urlSha256: sha(request.url()) });
      await route.abort();
    } else await route.continue();
  });
  const errors = []; page.on("pageerror", error => { if (errors.length < 16) errors.push(String(error).slice(0,1024)); });
  await drain();
  await page.goto(server.baseURL); await page.getByTestId("file-input").waitFor();
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  report.publicSelection = await selectOwnedLocalBrowserFile(page, fixture, runtime.directory);
  const select = page.getByTestId("format-select"); await select.waitFor();
  const held = conversionProfiles.find(p => p.id === "mkv-to-mp4");
  const notice = page.locator('[data-testid="withheld-profile-notice"][data-profile-id="mkv-to-mp4"]'); await notice.waitFor();
  assert.equal(await notice.locator("strong").textContent(), held.publicationHold.title);
  assert.equal(await notice.locator("span").textContent(), held.publicationHold.reason);
  report.publicOptionIds = await select.locator("option").evaluateAll(nodes => nodes.map(n => n.value));
  assert.ok(!report.publicOptionIds.includes(held.id)); assert.ok(report.publicOptionIds.includes("mkv-to-mp4-mpeg4"));
  assert.equal(await page.evaluate(() => Boolean(window.__WITHIN_TEST__)), false);
  const search = page.getByRole("searchbox", { name: "Search supported formats", exact: true });
  await search.fill("mkv-to-mp4");
  await page.waitForFunction(() => ![...document.querySelectorAll("#catalogue-results article")].some(n => n.dataset.profileId === "mkv-to-mp4"));
  assert.equal(await page.locator('#catalogue-results article[data-profile-id="mkv-to-mp4"]').count(), 0);
  report.publishedRoutes = conversionProfiles.filter(isPublishedProfile).length; assert.equal(report.publishedRoutes, 402);
  const screenshots = path.join(root, "output/playwright", stamp + "-mkv-publication-hold"); await mkdir(screenshots, { recursive: true });
  await notice.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(screenshots, "public-hold.png") });
  report.screenshot = path.relative(root, path.join(screenshots, "public-hold.png")); await drain();
  await page.goto(server.baseURL + "/?test=1&directory=1");
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  report.privateSelection = await selectOwnedLocalBrowserFile(page, fixture, runtime.directory);
  await select.locator('option[value="mkv-to-mp4"]').waitFor({ state: "attached" });
  assert.equal(await page.getByTestId("withheld-profile-notice").count(), 0);
  report.privateQualificationRetained = true;
  report.pageErrors = errors; assert.deepEqual(errors, []); assert.deepEqual(report.forbiddenRequests, []);
  report.status = "passed-headless-selector-only-not-conversion-acceptance";
} catch (error) { report.status = "failed-publication-ui-check"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    await drain();
    if (identity) {
      const observedPids = [...new Set([identity.pid, ...samples.flatMap(s => (s.processes ?? []).map(p => p.pid))])];
      report.browserCleanup = await cleanupOwnedChromium({ identity, observedPids, disconnect: async () => { await browser?.close(); } });
      const current = await queryObservedPidCensus(observedPids);
      report.birthCleanup = reconcileChromiumBirths({ identity, observedPids, samples, current });
      assert.equal(report.birthCleanup.allObservedBirthsAbsent, true);
    }
    report.memoryDiagnostic = { acceptanceMetric: false, reason: "UI-only, no conversion and no stable blank qualification", samples: samples.length,
      validSamples: samples.filter(s => Number.isFinite(s.privateBytes)).length, missingSamples: samples.filter(s => !Number.isFinite(s.privateBytes)).length,
      peakCompleteTreePrivateBytes: Math.max(...samples.filter(s => Number.isFinite(s.privateBytes)).map(s => s.privateBytes), 0) || null };
  } catch (error) { report.failures.push("Browser cleanup: " + error); process.exitCode = 1; }
  try {
    await finishOwnedCleanup([async () => monitor?.close(), async () => server?.close()]);
    assert.ok(!identity || report.birthCleanup?.allObservedBirthsAbsent, "Keep active profile for safe diagnosis");
    await runtime?.close(); report.ownedRuntimeRemoved = Boolean(runtime);
    for (const [file, hash] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  } catch (error) { report.failures.push("Owned cleanup/source pins: " + error); process.exitCode = 1; }
  if (report.failures.length) report.status = "failed-publication-ui-check";
  report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", stamp + "-mkv-publication-ui.json"); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, failures: report.failures }));
}
