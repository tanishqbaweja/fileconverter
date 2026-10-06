// Prerequisite: blank Chromium only, no production assets, converter or original fixture.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { startBoundedRendererAttribution } from "./lib/bounded-renderer-attribution.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const source = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
assert.equal(sha(source), "acb179454985fdc2167f9e463d1d720b777d4c829d313d8e3ee45fdf82ff3417");
// Obtain EXACT original spawn arguments, substituting only a newly owned profile.
const spawnText = source.slice(source.indexOf('chrome = spawn('), source.indexOf('observer = await startParallelMemoryObserver'));
const argsText = spawnText.slice(spawnText.indexOf('['), spawnText.lastIndexOf('], {'));
const quoted = [...argsText.matchAll(/"([^"\n]*)"|`--user-data-dir=\$\{profile\}`/g)].map(match => match[1] ?? "PROFILE");
assert.equal(quoted.length, 14); assert.equal(quoted.at(-1), "about:blank");
let runtime, chrome, browser, realms, attribution, result = null, failure = null;
const cleanup = { browserStopped: false, runtimeRemoved: false, traceStopped: false };
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
try {
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
  runtime = await createOwnedRuntimeScratch("renderer-attribution-prerequisite-");
  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    quoted.map(value => value === "PROFILE" ? `--user-data-dir=${profile}` : value),
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  let port = null; const until = Date.now() + 30000;
  while (!port && Date.now() < until) {
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); } catch { /* startup only */ }
    if (!port) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(port, "Chrome startup deadline");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  assert.equal(browser.contexts()[0].pages()[0].url(), "about:blank");
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  realms = await connectRealmSampler(version.webSocketDebuggerUrl, "http://127.0.0.1:1");
  attribution = await startBoundedRendererAttribution(await browser.newBrowserCDPSession(), realms);
  for (let i = 0; i < 3; i++) {
    const dump = await attribution.dump(`blank-only-${i}`); assert.equal(dump.success, true);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  result = await attribution.stop(); cleanup.traceStopped = true;
  assert.equal(result.status, "completed-diagnostic");
  assert.ok(result.realmRows.length > 0); assert.equal(result.allocatorSummary.length, 3);
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  const errors = [], attempt = async fn => { try { await fn(); } catch (e) { errors.push(String(e)); process.exitCode = 1; } };
  await attempt(async () => { if (attribution) { result ??= await attribution.stop(); cleanup.traceStopped = true; } });
  await attempt(() => realms?.close()); await attempt(() => browser?.close());
  await attempt(async () => {
    if (chrome?.pid && chrome.exitCode == null && chrome.signalCode == null)
      await exec("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
    if (chrome?.pid) {
      const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${chrome.pid}').Count`], { windowsHide: true, timeout: 15000 });
      assert.equal(Number(stdout.trim()), 0); cleanup.browserStopped = true;
    }
  });
  await attempt(async () => { if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; } });
  const files = ["scripts/probe-bounded-renderer-attribution.mjs", "scripts/lib/bounded-renderer-attribution.mjs",
    "scripts/lib/memory-infra-attribution.mjs", "scripts/lib/cdp-realm-memory.mjs", "scripts/mpeg2-split-single-navigation-memory.mjs"];
  const sourcePins = Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(path.join(root, file)))])));
  const report = { scope: "blank-only-renderer-attribution-prerequisite", status: failure || errors.length ? "failed-diagnostic" : "completed-diagnostic",
    sourcePins, publicAcceptance: false, converterLoaded: false, originalRead: false, conversionsPerformed: 0,
    identicalOriginalFlags: true, flags: quoted, result, failure, errors, ownedChromePid: chrome?.pid ?? null,
    runtimeDirectory: runtime?.directory ?? null, cleanup };
  const json = JSON.stringify(report, null, 2); assert.ok(Buffer.byteLength(json) < 2 * 1024 ** 2);
  const file = path.join(root, `output/playwright/${stamp}-renderer-attribution-prerequisite.json`);
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, json + "\n", { flag: "wx" }); console.log(file);
}
