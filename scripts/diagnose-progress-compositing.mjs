// Controlled CSS geometry/layout test in a production page. NO file conversion.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeProgressCompositingCandidate } from "./lib/progress-compositing-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const exec = promisify(execFile), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const candidate = makeProgressCompositingCandidate((await read("app/converter/ConverterApp.tsx")).toString(), (await read("app/globals.css")).toString());
const pins = {};
for (const file of ["scripts/diagnose-progress-compositing.mjs", "scripts/lib/progress-compositing-recipe.mjs", "tests/progress-compositing.test.mjs",
  "app/converter/ConverterApp.tsx", "app/globals.css", "workers/conversion.worker.ts", "workers/media-remux.ts", "AGENTS.md"]) pins[file] = sha(await read(file));
const prior = JSON.parse(await read("evidence/2026-10-09T14-56-09-725Z-split-copy-corrected-candidate.json"));
const rawCompressed = await read(prior.candidate.compressedReport.path); assert.equal(sha(rawCompressed), prior.candidate.compressedReport.sha256);
const raw = JSON.parse(gunzipSync(rawCompressed));
const values = raw.samples.filter(row => row.phase === "conversion-1" && row.jobState === "running").map(row => row.metrics.inputBytes / raw.source.bytes * 100);
assert.ok(values.length >= 16 && values.length <= 256 && values.every(value => Number.isFinite(value) && value >= 0 && value <= 100));
const app = await read("dist/client" + baselineBinding.url); assert.equal(sha(app), baselineBinding.sha256);
const proof = { recordedAt: null, status: "not-executed", scope: "Controlled progress-only CSS workload replay in actual production page; not a conversion, codec benchmark or allocation-cause proof",
  sourcePins: pins, postSourcePins: null, workload: { source: prior.candidate.compressedReport, progressValues: values, updateIntervalMs: 125,
    recordedProgressResampledForUiOnly: true }, host: null, diskBytes: null, owned: {}, asset: baselineBinding,
  rows: [], geometry: [], screenshots: [], failure: null, cleanup: {}, browserMode: "headless", subprocessWindowsHidden: true,
  nativeAllocationCauseProven: false, conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false };
let runtime, server, chrome, browser, page;
const wait = async (fn, name) => { for (let i = 0; i < 120; i++) { try { const value = await fn(); if (value) return value; } catch { /* bounded readiness */ }
  await new Promise(resolve => setTimeout(resolve, 250)); } throw new Error(`${name} readiness deadline`); };
const stopServer = async () => {
  if (!server || server.exitCode !== null) return;
  const current = await queryProcessIdentity(server.pid), owned = proof.owned.server;
  assert.ok(current && owned && current.parentPid === owned.parentPid && Math.abs(Date.parse(current.createdAt) - Date.parse(owned.createdAt)) <= 1);
  await exec("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
  assert.equal(await queryProcessIdentity(server.pid), null); proof.cleanup.ownedServerStopped = true;
};
try {
  proof.host = await inspectStressHostMemory(); assert.equal(proof.host.safeToStart, true);
  const disk = await statfs(root); proof.diskBytes = disk.bavail * disk.bsize; assert.ok(proof.diskBytes >= 2 * 1024 ** 3);
  runtime = await createOwnedRuntimeScratch("progress-compositing-ui-"); const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  const port = await new Promise((resolve, reject) => { const socket = createServer(); socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const value = socket.address().port; socket.close(error => error ? reject(error) : resolve(value)); }); });
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port)],
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  proof.owned.server = await queryProcessIdentity(server.pid); await wait(async () => (await fetch(origin)).ok, "Production server");
  chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
    "--disable-domain-reliability", "--disable-extensions", "--disable-sync", "about:blank"],
  { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  proof.owned.chrome = await queryProcessIdentity(chrome.pid);
  const debuggingPort = await wait(async () => Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]), "Headless Chrome");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`); proof.browserVersion = browser.version();
  const context = browser.contexts()[0]; page = context.pages()[0]; await page.setViewportSize({ width: 1280, height: 900 });
  const assetResponse = page.waitForResponse(response => new URL(response.url()).pathname === baselineBinding.url);
  await page.goto(origin + "/?test=1"); const body = await (await assetResponse).body(); assert.equal(sha(body), baselineBinding.sha256);
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  // Deliberately labelled synthetic UI fixture. Never send work to the converter,
  // select a file, fabricate conversion completion or modify production metrics.
  await page.evaluate(css => {
    const style = document.createElement("style"); style.id = "within-progress-test-style";
    style.textContent = css.replaceAll(".progress-track", ".candidate-progress-track"); document.head.append(style);
    const container = document.createElement("section"); container.id = "within-progress-test"; container.className = "progress-panel";
    container.style.cssText = "position:fixed;left:40px;top:40px;width:350px;z-index:99999";
    const title = document.createElement("p"); title.textContent = "Controlled CSS test — no conversion"; container.append(title);
    for (const mode of ["baseline", "candidate"]) { const label = document.createElement("p"); label.textContent = mode; container.append(label);
      const track = document.createElement("div"); track.className = "progress-track" + (mode === "candidate" ? " candidate-progress-track" : "");
      track.id = `within-${mode}-track`; const fill = document.createElement("span"); track.append(fill); container.append(track); }
    document.body.append(container);
  }, candidate.cssPatch[1]);
  await page.locator("#within-progress-test").waitFor();
  for (const percent of [0, 0.1, 1, 10, 50, 99, 100]) {
    await page.evaluate(percent => { document.querySelector("#within-baseline-track span").style.width = `${percent}%`;
      document.querySelector("#within-candidate-track span").style.transform = `scaleX(${percent / 100})`; }, percent);
    await page.waitForTimeout(200);
    const geometry = await page.evaluate(() => {
      const baseline = document.querySelector("#within-baseline-track"), candidate = document.querySelector("#within-candidate-track");
      const a = baseline.firstElementChild.getBoundingClientRect(), b = candidate.firstElementChild.getBoundingClientRect();
      const marker = getComputedStyle(candidate, "::before"), markerWidth = parseFloat(marker.width);
      return { baselineTrackWidth: baseline.getBoundingClientRect().width, candidateTrackWidth: candidate.getBoundingClientRect().width,
        baselinePaintedWidth: a.width, candidatePaintedWidth: Math.max(b.width, markerWidth), markerWidth,
        baselineColor: getComputedStyle(baseline.firstElementChild).backgroundColor,
        candidateColor: getComputedStyle(candidate.firstElementChild).backgroundColor, markerColor: marker.backgroundColor,
        heights: [a.height, b.height] };
    });
    assert.equal(geometry.baselineTrackWidth, geometry.candidateTrackWidth);
    assert.ok(Math.abs(geometry.baselinePaintedWidth - geometry.candidatePaintedWidth) <= 1 / 64);
    assert.equal(geometry.baselineColor, geometry.candidateColor); assert.equal(geometry.markerColor, geometry.baselineColor);
    assert.equal(geometry.heights[0], geometry.heights[1]); proof.geometry.push({ percent, ...geometry });
  }
  await page.evaluate(() => { document.querySelector("#within-baseline-track span").style.width = "50%";
    document.querySelector("#within-candidate-track span").style.transform = "scaleX(0.5)"; }); await page.waitForTimeout(200);
  const screenshot = `output/playwright/${stamp}-progress-compositing-css.png`;
  await page.screenshot({ path: path.join(root, screenshot) }); proof.screenshots.push(screenshot);
  const session = await context.newCDPSession(page); await session.send("Performance.enable", { timeDomain: "threadTicks" });
  for (const mode of ["baseline", "candidate", "candidate", "baseline"]) {
    await page.evaluate(() => { for (const mode of ["baseline", "candidate"]) { const span = document.querySelector(`#within-${mode}-track span`);
      span.style.transition = "none"; if (mode === "baseline") span.style.width = "0%"; else span.style.transform = "scaleX(0)"; } });
    await page.waitForTimeout(200);
    await page.evaluate(() => { for (const mode of ["baseline", "candidate"]) document.querySelector(`#within-${mode}-track span`).style.transition = ""; });
    const before = (await session.send("Performance.getMetrics")).metrics;
    await page.evaluate(async ({ mode, values }) => {
      const span = document.querySelector(`#within-${mode}-track span`);
      for (const percent of values) { if (mode === "baseline") span.style.width = `${percent}%`; else span.style.transform = `scaleX(${percent / 100})`;
        await new Promise(resolve => setTimeout(resolve, 125)); }
      await new Promise(resolve => setTimeout(resolve, 200));
    }, { mode, values });
    const after = (await session.send("Performance.getMetrics")).metrics;
    const delta = Object.fromEntries(["LayoutCount", "RecalcStyleCount", "LayoutDuration", "RecalcStyleDuration", "TaskDuration", "ScriptDuration"]
      .map(name => [name, after.find(row => row.name === name).value - before.find(row => row.name === name).value]));
    proof.rows.push({ mode, delta, updates: values.length }); console.log(JSON.stringify(proof.rows.at(-1)));
  }
  await session.detach(); assert.equal(await page.evaluate(() => window.__WITHIN_TEST__.getState().jobState), "idle");
  proof.status = "controlled-production-page-css-workload-tested-not-conversion-acceptance";
} catch (error) { proof.failure = String(error.stack ?? error).slice(0, 8192); proof.status = "failed-or-incomplete"; process.exitCode = 1; }
finally {
  try { await finishOwnedCleanup([
    async () => { if (browser) { const session = await browser.newBrowserCDPSession(); await session.send("Browser.close"); await browser.close(); } if (proof.owned.chrome) {
      proof.cleanup.chrome = await observeOwnedProcessExit(proof.owned.chrome); assert.equal(proof.cleanup.chrome.status, "owned-identity-absent"); } },
    stopServer,
  ]); } catch (error) { proof.failure = `${proof.failure ?? ""}\nCleanup: ${error.stack ?? error}`.slice(0, 12288); process.exitCode = 1; }
  if (runtime && (!chrome || proof.cleanup.chrome?.status === "owned-identity-absent")) {
    await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); proof.cleanup.runtimeRemoved = true;
  } else if (runtime) { proof.cleanup.runtimeRemoved = false; proof.cleanup.retainedRuntime = runtime.directory; }
}
proof.postSourcePins = {}; for (const file of Object.keys(pins)) proof.postSourcePins[file] = sha(await read(file));
assert.deepEqual(proof.postSourcePins, proof.sourcePins); assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
proof.recordedAt = new Date().toISOString(); const output = `evidence/${stamp}-progress-compositing-css.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, failure: proof.failure })); assert.equal(proof.failure, null);
