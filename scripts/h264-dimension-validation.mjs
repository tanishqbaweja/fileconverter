// Focused production-browser safety regression. NOT a stress/memory acceptance test.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { sampleChromiumTree } from "./lib/chromium-private-memory.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const reportBase = path.join(root, "outputs/reports", `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-h264-dimension-guard`);
const manifest = JSON.parse(await readFile(path.join(root, "work/h264-candidate-output/build-manifest.json")));
const samples = [], forbiddenRequests = [], logs = [];
let work, server, chrome, browser, page, staged = false, sampling = false, memoryTask;
let sourceEvidence = null, state = null, browserVersion = null, failure = null, outputEvidence = null, opfsSizesAfterJob = null;
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize > 1024 ** 3);
const sourceHashesAsExecuted = Object.fromEntries(await Promise.all(["scripts/h264-dimension-validation.mjs",
  "scripts/lib/chromium-private-memory.mjs", "scripts/stage-h264-candidate.mjs"].map(async (file) => [file, sha(await readFile(path.join(root, file)))])));
async function native(args, executable = "ffmpeg") {
  return exec(executable, args, { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 ** 2, timeout: 30_000 });
}
async function frames(file) {
  return JSON.parse((await native(["-v", "error", "-show_frames", "-select_streams", "v:0", "-show_entries",
    "frame=width,height,best_effort_timestamp_time", "-of", "json", file], "ffprobe")).stdout).frames;
}
async function waitFor(operation) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) { try { const value = await operation(); if (value) return value; } catch { /* bounded startup retry */ } await delay(250); }
  throw new Error("Owned browser/server startup timed out");
}
async function stopOwned(child) {
  if (child?.pid && child.exitCode == null) await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
}
async function outputPayload(expectedBytes) {
  const directories = [path.join(work, "profile")], matches = []; let entries = 0;
  while (directories.length) {
    const directory = directories.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.ok(++entries < 16384, "Owned profile traversal bound");
      assert.ok(!entry.isSymbolicLink());
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) directories.push(file);
      else if (entry.isFile() && (await stat(file)).size === expectedBytes) matches.push(file);
    }
  }
  assert.equal(matches.length, 1, "Validate the unique physical output; never reconstruct it from browser RAM");
  return matches[0];
}
try {
  work = await mkdtemp(path.join(root, "work/h264-dimension-"));
  const temporary = path.join(work, "temp"), profile = path.join(work, "profile");
  await mkdir(temporary); await mkdir(profile);
  const environment = { ...process.env, TEMP: temporary, TMP: temporary, WRANGLER_SEND_METRICS: "false" };
  for (const [index, dimensions] of ["320x240", "640x360"].entries()) {
    await native(["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${dimensions}:rate=24:duration=1`,
      "-an", "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-crf", "18", "-bf", "0", "-g", "24",
      "-fflags", "+bitexact", "-flags:v", "+bitexact", path.join(work, `part${index}.ts`)]);
  }
  const list = path.join(work, "concat.txt"), source = path.join(work, "changing.ts");
  await writeFile(list, "file 'part0.ts'\nfile 'part1.ts'\n", { flag: "wx" });
  await native(["-v", "error", "-y", "-f", "concat", "-safe", "1", "-i", list, "-map", "0:v", "-c", "copy", source]);
  const sourceFrames = await frames(source);
  assert.equal(sourceFrames.length, 48);
  assert.deepEqual([...new Set(sourceFrames.map((frame) => `${frame.width}x${frame.height}`))], ["320x240", "640x360"]);
  await native(["-v", "error", "-xerror", "-i", source, "-f", "null", "-"]);
  sourceEvidence = { bytes: (await stat(source)).size, sha256: sha(await readFile(source)), frames: sourceFrames, fullDecodePassed: true };
  await exec(process.execPath, ["scripts/stage-h264-candidate.mjs", "stage", "byob"], { cwd: root, windowsHide: true }); staged = true;
  const port = await new Promise((resolve, reject) => { const listener = createServer(); listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => { const value = listener.address().port; listener.close((error) => error ? reject(error) : resolve(value)); }); });
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port)],
    { cwd: root, env: environment, windowsHide: true, stdio: "ignore" });
  await waitFor(async () => (await fetch(origin)).ok);
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
    "--disable-domain-reliability", "--disable-extensions", "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
    "--disable-sync", "--metrics-recording-only", "about:blank"], { cwd: root, env: environment, windowsHide: true, stdio: "ignore" });
  const portNumber = await waitFor(async () => Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]));
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${portNumber}`); browserVersion = browser.version();
  const context = browser.contexts()[0]; page = context.pages()[0];
  context.on("request", (request) => {
    let frameUrl = null; try { frameUrl = request.frame().url(); } catch { /* service worker */ }
    const detail = { url: request.url(), method: request.method(), postData: request.postData(), frameUrl, serviceWorkerUrl: request.serviceWorker()?.url() ?? null };
    if (classifyPrivateRequest(detail, origin) === "forbidden" && forbiddenRequests.length < 32) forbiddenRequests.push(detail);
  });
  page.on("console", (message) => { if (logs.length === 32) logs.shift(); logs.push(message.text().slice(0, 1024)); });
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  sampling = true;
  memoryTask = (async () => { while (sampling) {
    const timestamp = new Date().toISOString(); let tree;
    try { tree = await sampleChromiumTree(chrome.pid); } catch { tree = { privateBytes: null, rssBytes: null, processes: null }; }
    assert.ok(samples.length < 256); samples.push({ timestamp, ...tree }); if (sampling) await delay(500);
  } })();
  await page.goto(`${origin}/?test=1`); await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await page.locator('[data-testid="file-input"]').setInputFiles(source);
  await page.locator('[data-testid="format-select"]').selectOption("mpeg-ts-to-mp4");
  await page.locator('[data-testid="convert-button"]').click();
  await page.waitForFunction(() => { const value = window.__WITHIN_TEST__?.getState().jobState; return value && value !== "idle" && value !== "running"; });
  state = await page.evaluate(() => window.__WITHIN_TEST__.getState());
  opfsSizesAfterJob = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory(), sizes = [];
    for await (const [, handle] of directory.entries()) if (handle.kind === "file") sizes.push((await handle.getFile()).size);
    return sizes;
  });
  if (state.jobState === "complete") {
    const output = await outputPayload(state.metrics.outputBytes);
    outputEvidence = { unexpectedSuccessfulConversion: true, outputBytes: state.metrics.outputBytes, frames: await frames(output) };
    await native(["-v", "error", "-xerror", "-i", output, "-f", "null", "-"]);
    outputEvidence.fullDecodePassed = true;
  }
  assert.equal(state.jobState, "error", "Dimension change must be explicitly rejected, not silently scaled");
  assert.match([state.error, ...state.warnings, ...logs].join("\n"), /source dimensions changed/i);
  assert.equal(state.opfsName, null);
  assert.ok(opfsSizesAfterJob.every((bytes) => bytes === 0), "Failure must remove all partial outputs before test cleanup");
  assert.equal(state.metrics.pendingOperations, 0); assert.equal(state.metrics.queuedBytes, 0);
  assert.ok(state.metrics.peakQueuedBytes <= 256 * 1024 && state.metrics.peakPendingOperations <= 1);
  assert.deepEqual(forbiddenRequests, []);
} catch (error) { failure = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  sampling = false; await memoryTask?.catch((error) => { failure ??= { message: error.message }; process.exitCode = 1; });
  if (page && !page.isClosed()) await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory(); for await (const [name] of directory.entries()) await directory.removeEntry(name, { recursive: true });
  }).catch(() => {});
  await browser?.contexts()[0]?.tracing.stop({ path: `${reportBase}-trace.zip` }).catch(() => {});
  await browser?.close().catch(() => {}); await stopOwned(chrome); await stopOwned(server);
  if (staged) await exec(process.execPath, ["scripts/stage-h264-candidate.mjs", "restore", "byob"], { cwd: root, windowsHide: true });
  if (work) { assert.equal(path.dirname(work), path.join(root, "work")); assert.equal((await lstat(work)).isSymbolicLink(), false);
    assert.equal(await realpath(work), path.join(await realpath(path.join(root, "work")), path.basename(work)));
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
  await mkdir(path.dirname(reportBase), { recursive: true });
  if (!failure) await rm(`${reportBase}-trace.zip`, { force: true });
  await writeFile(`${reportBase}.json`, `${JSON.stringify({ scope: "Focused dynamic-dimension safety test, NOT memory/stress or public acceptance",
    status: failure ? "failed-safety-regression" : "passed-dimension-rejection", browserVersion, asBuiltManifest: manifest, sourceHashesAsExecuted,
    source: sourceEvidence, state, outputEvidence, opfsSizesAfterJob, failure, samples, forbiddenRequests, logs, primaryIncrementalPrivateMiB: null,
    publicProfilesChanged: false, cleanup: { ownedFixtureOutputsProfileAndTempRemoved: true, distRestored: staged } }, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${reportBase}.json\n${failure ? failure.message : "Dimension change rejected; no public acceptance claimed."}\n`);
}
