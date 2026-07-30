import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.resolve(
  projectRoot,
  process.argv[2] ?? "fixtures/stress/deterministic-256m.bin",
);
const profileId = process.argv[3] ?? "gzip-compress";
const manifestPath = path.resolve(
  projectRoot,
  process.argv[4] ?? `${fixturePath}.json`,
);
const fixtureManifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (
  ![
    "gzip-compress",
    "gzip-decompress",
    "mkv-to-mp4",
    "mkv-to-m4a",
  ].includes(profileId)
) {
  throw new Error(`Unsupported memory-profile route: ${profileId}`);
}
const isMediaProfile =
  profileId === "mkv-to-mp4" || profileId === "mkv-to-m4a";
const expectedValidationBytes =
  fixtureManifest.validationBytes ?? fixtureManifest.bytes;
const expectedValidationHash =
  fixtureManifest.validationSha256 ?? fixtureManifest.sha256;
const workRoot = path.resolve(projectRoot, "work");
const profileRoot = path.resolve(workRoot, "memory-profile-chrome");
const reportRoot = path.resolve(projectRoot, "outputs", "reports");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const wranglerEntry = path.resolve(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const serverUrl = "http://127.0.0.1:3000";
const sampleIntervalMs = 1_000;
const runCount = Number.parseInt(process.env.WITHIN_RUN_COUNT ?? "3", 10);
if (!Number.isInteger(runCount) || runCount < 1 || runCount > 10) {
  throw new Error(`Invalid WITHIN_RUN_COUNT: ${process.env.WITHIN_RUN_COUNT}`);
}

assertInside(workRoot, profileRoot);
assertInside(path.resolve(projectRoot, "outputs"), reportRoot);
await removeWithRetries(profileRoot);
await mkdir(profileRoot, { recursive: true });
await mkdir(reportRoot, { recursive: true });

let serverProcess;
let chromeProcess;
let browser;
const samples = [];
const runSummaries = [];
const startedAt = Date.now();

try {
  serverProcess = spawn(
    process.execPath,
    [
      wranglerEntry,
      "dev",
      "--config",
      "dist/server/wrangler.json",
      "--port",
      "3000",
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await waitForServer(serverUrl, 30_000);

  chromeProcess = spawn(
    chromePath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileRoot}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-sync",
      "--metrics-recording-only",
      "about:blank",
    ],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "ignore",
      windowsHide: true,
    },
  );

  const debugPort = await waitForDebugPort(profileRoot, 30_000);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await page.goto("about:blank");

  const blankStable = await waitForStableMemory(
    chromeProcess.pid,
    page,
    "blank-baseline",
    samples,
  );
  const blankPrivateBytes = blankStable.privateBytes;
  if (blankPrivateBytes == null) {
    throw new Error("Blank Chromium private-memory baseline is unavailable.");
  }

  await page.goto(`${serverUrl}/?test=1`);
  await page.getByRole("heading", { name: "Big files. Small memory." }).waitFor();
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  const loadedStable = await waitForStableMemory(
    chromeProcess.pid,
    page,
    "loaded-idle",
    samples,
  );
  if (loadedStable.privateBytes == null) {
    throw new Error("Loaded-site private-memory baseline is unavailable.");
  }

  for (let run = 1; run <= runCount; run += 1) {
    const validationHash = createHash("sha256");
    let validationBytes = 0;
    await page.goto(`${serverUrl}/?test=1`);
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await setLocalFileInput(cdp, fixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(profileId);
    await page.locator('[data-testid="convert-button"]').click();

    let peakPrivateBytes = null;
    let peakRssBytes = null;
    let finalState;
    for (;;) {
      const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
      const sample = await takeSample(
        chromeProcess.pid,
        page,
        `conversion-${run}`,
      );
      samples.push(sample);
      if (sample.privateBytes != null) {
        peakPrivateBytes =
          peakPrivateBytes == null
            ? sample.privateBytes
            : Math.max(peakPrivateBytes, sample.privateBytes);
      }
      if (sample.rssBytes != null) {
        peakRssBytes =
          peakRssBytes == null
            ? sample.rssBytes
            : Math.max(peakRssBytes, sample.rssBytes);
      }
      if (state?.jobState !== "running") {
        finalState = state;
        break;
      }
      await delay(sampleIntervalMs);
    }

    if (!finalState || finalState.jobState !== "complete" || !finalState.opfsName) {
      throw new Error(
        `Conversion run ${run} failed: ${finalState?.error ?? finalState?.phase ?? "unknown"}`,
      );
    }
    if (peakPrivateBytes == null) {
      throw new Error(`Private-memory samples are unavailable for run ${run}.`);
    }

    let mediaProbe = null;
    if (isMediaProfile) {
      const physicalOutputPath = await findProjectLocalPayload(
        profileRoot,
        finalState.metrics.outputBytes,
      );
      for await (const chunk of createReadStream(physicalOutputPath, {
        highWaterMark: 1024 * 1024,
      })) {
        validationHash.update(chunk);
        validationBytes += chunk.byteLength;
      }
      mediaProbe = await validateMediaOutput(
        physicalOutputPath,
        fixtureManifest,
        finalState,
        profileId,
      );
    } else {
      const validationPage = await context.newPage();
      await validationPage.exposeBinding(
        "__withinValidationChunk",
        async (_source, base64) => {
          const chunk = Buffer.from(base64, "base64");
          validationHash.update(chunk);
          validationBytes += chunk.byteLength;
        },
      );
      await validationPage.goto(`${serverUrl}/test-validator.html`);
      await validationPage.evaluate(async ({ opfsName, profileId }) => {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(opfsName);
        const compressed = await handle.getFile();
        const source =
          profileId === "gzip-compress"
            ? compressed.stream().pipeThrough(new DecompressionStream("gzip"))
            : compressed.stream();
        const reader = source.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let offset = 0; offset < value.byteLength; offset += 64 * 1024) {
            const part = value.subarray(
              offset,
              Math.min(offset + 64 * 1024, value.byteLength),
            );
            let binary = "";
            for (let inner = 0; inner < part.byteLength; inner += 16 * 1024) {
              binary += String.fromCharCode(
                ...part.subarray(
                  inner,
                  Math.min(inner + 16 * 1024, part.byteLength),
                ),
              );
            }
            await window.__withinValidationChunk(btoa(binary));
          }
        }
      }, { opfsName: finalState.opfsName, profileId });
      await validationPage.close();
      if (
        validationBytes !== expectedValidationBytes ||
        validationHash.copy().digest("hex") !== expectedValidationHash
      ) {
        throw new Error(
          `Independent streamed validation failed on run ${run}: ${validationBytes} bytes.`,
        );
      }
    }
    const actualHash = validationHash.digest("hex");

    const cleanupPage = await context.newPage();
    await cleanupPage.goto(`${serverUrl}/test-validator.html`);
    await cleanupPage.evaluate(async (opfsName) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(opfsName);
    }, finalState.opfsName);
    await cleanupPage.close();

    await delay(3_000);
    const cleanupStable = await waitForStableMemory(
      chromeProcess.pid,
      page,
      `cleanup-${run}`,
      samples,
    );
    if (cleanupStable.privateBytes == null) {
      throw new Error(`Cleanup memory is unavailable for run ${run}.`);
    }

    runSummaries.push({
      run,
      sourceBytes: fixtureManifest.bytes,
      outputBytes: finalState.metrics.outputBytes,
      elapsedMs: finalState.metrics.elapsedMs,
      maxReadChunkBytes: finalState.metrics.maxReadChunkBytes,
      maxWriteChunkBytes: finalState.metrics.maxWriteChunkBytes,
      peakQueuedBytes: finalState.metrics.peakQueuedBytes,
      peakPendingOperations: finalState.metrics.peakPendingOperations,
      wasmMemoryBytes: finalState.metrics.wasmMemoryBytes ?? null,
      peakWasmMemoryBytes: finalState.metrics.peakWasmMemoryBytes ?? null,
      sharedArrayBufferBytes: finalState.metrics.sharedArrayBufferBytes ?? null,
      activeWorkerCount: finalState.metrics.activeWorkerCount ?? null,
      peakPrivateBytes,
      peakRssBytes,
      incrementalPrivateMiB:
        (peakPrivateBytes - blankPrivateBytes) / (1024 * 1024),
      conversionOnlyPrivateMiB:
        (peakPrivateBytes - loadedStable.privateBytes) / (1024 * 1024),
      cleanupPrivateBytes: cleanupStable.privateBytes,
      cleanupDeltaFromLoadedMiB:
        (cleanupStable.privateBytes - loadedStable.privateBytes) / (1024 * 1024),
      sha256: actualHash,
      validationBytes,
      mediaProbe,
    });
  }

  const peakPrivateBytes = Math.max(
    ...runSummaries.map((run) => run.peakPrivateBytes),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    browser: {
      executable: chromePath,
      version: await browser.version(),
      rootPid: chromeProcess.pid,
      headless: true,
    },
    source: fixtureManifest,
    profileId,
    formula:
      "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
    blankBaseline: blankStable,
    loadedIdle: loadedStable,
    peakPrivateBytes,
    incrementalPrivateMiB:
      (peakPrivateBytes - blankPrivateBytes) / (1024 * 1024),
    limitMiB: 250,
    cleanupRecoveryLimitMiB: 64,
    passed:
      (peakPrivateBytes - blankPrivateBytes) / (1024 * 1024) <= 250 &&
      runSummaries.every(
        (run) =>
          run.peakPendingOperations <= 1 &&
          run.maxWriteChunkBytes <= 256 * 1024 &&
          (!isMediaProfile ||
            (run.maxReadChunkBytes <= 256 * 1024 &&
              run.maxWriteChunkBytes <= 256 * 1024 &&
              typeof run.peakWasmMemoryBytes === "number" &&
              run.peakWasmMemoryBytes <= 128 * 1024 * 1024)) &&
          run.cleanupDeltaFromLoadedMiB <= 64,
      ),
    runs: runSummaries,
    samples,
  };
  await writeReports(report);
  if (!report.passed) {
    throw new Error(
      `Memory profile failed: peak ${report.incrementalPrivateMiB.toFixed(1)} MiB; cleanup deltas ${runSummaries.map((run) => run.cleanupDeltaFromLoadedMiB.toFixed(1)).join(", ")} MiB`,
    );
  }
  process.stdout.write(
    `PASS ${report.incrementalPrivateMiB.toFixed(1)} MiB incremental private memory\n`,
  );
} finally {
  await browser?.close().catch(() => {});
  if (chromeProcess?.pid) await killProcessTree(chromeProcess.pid);
  if (serverProcess?.pid) await killProcessTree(serverProcess.pid);
  await removeWithRetries(profileRoot);
}

async function validateMediaOutput(localPath, source, finalState, route) {
  const audioOnly = route === "mkv-to-m4a";
  const minimumComparableSize = audioOnly ? 1 : Math.floor(source.bytes * 0.85);
  const maximumComparableSize = audioOnly
    ? source.bytes
    : Math.ceil(source.bytes * 1.05);
  if (
    finalState.metrics.outputBytes < minimumComparableSize ||
    finalState.metrics.outputBytes > maximumComparableSize
  ) {
    throw new Error(
      `Browser MP4 size is not comparable to the source: ${finalState.metrics.outputBytes} bytes.`,
    );
  }
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-show_chapters",
      "-of",
      "json",
      localPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout);
  const codecs = probe.streams.map((stream) => stream.codec_name);
  if (
    (audioOnly && (codecs.length !== 1 || codecs[0] !== "aac")) ||
    (!audioOnly &&
      (codecs.length !== 2 ||
        codecs[0] !== "hevc" ||
        codecs[1] !== "aac"))
  ) {
    throw new Error(`Unexpected browser MP4 streams: ${codecs.join(", ")}.`);
  }
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format.duration);
  const sourceVideo = source.probe.streams.find(
    (stream) =>
      stream.codec_type === "video" && !stream.disposition?.attached_pic,
  );
  const sourceAudio = source.probe.streams.find(
    (stream) => stream.codec_type === "audio",
  );
  const sourceDuration = Number(source.probe.format.duration);
  if (
    (!audioOnly &&
      (video?.width !== sourceVideo?.width ||
        video?.height !== sourceVideo?.height)) ||
    audio.channels !== sourceAudio?.channels ||
    audio.tags?.language !== sourceAudio?.tags?.language ||
    Math.abs(duration - sourceDuration) > 0.25
  ) {
    throw new Error(
      `Browser MP4 metadata validation failed: ${video?.width ?? "audio-only"}x${video?.height ?? "audio-only"}, ${audio.channels} channels, ${audio.tags?.language}, ${duration}s.`,
    );
  }
  const sourceHasSubtitle = source.probe.streams.some(
    (stream) => stream.codec_type === "subtitle",
  );
  const sourceHasAttachment = source.probe.streams.some(
    (stream) =>
      stream.codec_type === "attachment" ||
      stream.disposition?.attached_pic,
  );
  if (
    (sourceHasSubtitle &&
      !finalState.warnings.some((warning) => warning.includes("subtitle"))) ||
    (sourceHasAttachment &&
      !finalState.warnings.some((warning) => warning.includes("attachment")))
  ) {
    throw new Error(
      "The browser did not explicitly disclose excluded subtitle and attachment streams.",
    );
  }
  if (
    audioOnly &&
    !finalState.warnings.some((warning) => warning.includes("video stream"))
  ) {
    throw new Error("The browser did not explicitly disclose the excluded video stream.");
  }
  await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      localPath,
      ...(audioOnly ? [] : ["-map", "0:v:0"]),
      "-map",
      "0:a:0",
      "-c",
      "copy",
      "-f",
      "null",
      "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return probe;
}

async function findProjectLocalPayload(root, expectedBytes) {
  assertInside(workRoot, root);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const stack = [root];
    while (stack.length) {
      const directory = stack.pop();
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const candidate = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          stack.push(candidate);
        } else if (entry.isFile()) {
          const candidateStat = await stat(candidate);
          if (candidateStat.size === expectedBytes) {
            assertInside(workRoot, candidate);
            return candidate;
          }
        }
      }
    }
    await delay(250);
  }
  throw new Error(
    `The project-local OPFS payload was not found at ${expectedBytes} bytes.`,
  );
}

function assertInside(parent, child) {
  const relative = path.relative(parent, child);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Unsafe generated path: ${child}`);
  }
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

async function waitForDebugPort(profile, timeoutMs) {
  const activePortPath = path.join(profile, "DevToolsActivePort");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const contents = await readFile(activePortPath, "utf8");
      const port = Number.parseInt(contents.split(/\r?\n/)[0], 10);
      if (Number.isInteger(port)) return port;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools port did not become ready.");
}

async function setLocalFileInput(cdp, localPath) {
  const { root } = await cdp.send("DOM.getDocument", { depth: 1 });
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: '[data-testid="file-input"]',
  });
  if (!nodeId) throw new Error("The production file input was not found.");
  await cdp.send("DOM.setFileInputFiles", {
    nodeId,
    files: [localPath],
  });
}

async function waitForStableMemory(rootPid, page, phase, targetSamples) {
  const local = [];
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const sample = await takeSample(rootPid, page, phase);
    local.push(sample);
    targetSamples.push(sample);
    const window = local
      .slice(-5)
      .map((item) => item.privateBytes)
      .filter((value) => value != null);
    if (window.length === 5) {
      const median = [...window].sort((a, b) => a - b)[2];
      const spread = Math.max(...window) - Math.min(...window);
      if (spread / Math.max(1, median) <= 0.02) {
        return {
          phase,
          privateBytes: median,
          rssBytes: [...local.slice(-5).map((item) => item.rssBytes)].sort(
            (a, b) => a - b,
          )[2],
          stable: true,
          sampleCount: local.length,
        };
      }
    }
    await delay(sampleIntervalMs);
  }
  const last = [...local].reverse().find((item) => item.privateBytes != null);
  return {
    phase,
    privateBytes: last?.privateBytes ?? null,
    rssBytes: last?.rssBytes ?? null,
    stable: false,
    sampleCount: local.length,
  };
}

async function takeSample(rootPid, page, phase) {
  let processes = null;
  try {
    processes = await sampleWindowsProcessTree(rootPid);
  } catch {
    processes = null;
  }
  let pageHeap = null;
  let workerHeaps = null;
  let storageEstimate = null;
  try {
    pageHeap = await page.evaluate(
      () => performance.memory?.usedJSHeapSize ?? null,
    );
    workerHeaps = await Promise.all(
      page.workers().map(async (worker) => {
        try {
          return {
            url: worker.url(),
            usedJSHeapSize: await worker.evaluate(
              () => performance.memory?.usedJSHeapSize ?? null,
            ),
          };
        } catch {
          return { url: worker.url(), usedJSHeapSize: null };
        }
      }),
    );
    storageEstimate = await page.evaluate(async () => {
      if (!navigator.storage?.estimate) return null;
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage ?? null,
        quota: estimate.quota ?? null,
      };
    });
  } catch {
    // Realm-level samples are diagnostic and may be unavailable.
  }
  return {
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    phase,
    privateBytes:
      processes == null
        ? null
        : processes.reduce((sum, process) => sum + process.privateBytes, 0),
    rssBytes:
      processes == null
        ? null
        : processes.reduce((sum, process) => sum + process.rssBytes, 0),
    processes,
    realms: { pageUsedJSHeapBytes: pageHeap, workers: workerHeaps },
    storageEstimate,
  };
}

async function sampleWindowsProcessTree(rootPid) {
  const script = `
$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,PrivatePageCount,WorkingSetSize)
$ids = New-Object 'System.Collections.Generic.HashSet[int]'
[void]$ids.Add(${Number(rootPid)})
do {
  $changed = $false
  foreach ($p in $all) {
    if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
      [void]$ids.Add([int]$p.ProcessId)
      $changed = $true
    }
  }
} while ($changed)
$result = @($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | ForEach-Object {
  $type = 'browser'
  if ($_.CommandLine -match '--type=([^ ]+)') { $type = $Matches[1] }
  [pscustomobject]@{
    pid = [int]$_.ProcessId
    parentPid = [int]$_.ParentProcessId
    name = [string]$_.Name
    type = [string]$type
    privateBytes = [double]$_.PrivatePageCount
    rssBytes = [double]$_.WorkingSetSize
  }
})
$result | ConvertTo-Json -Compress
`;
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  );
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((process) => ({
    ...process,
    privateBytes: Number(process.privateBytes),
    rssBytes: Number(process.rssBytes),
  }));
}

async function writeReports(report) {
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const base = path.join(reportRoot, `${stamp}-${report.profileId}-stress`);
  await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const csvRows = [
    [
      "timestamp",
      "elapsedMs",
      "phase",
      "privateBytes",
      "rssBytes",
      "processCount",
      "pageUsedJSHeapBytes",
    ],
    ...report.samples.map((sample) => [
      sample.timestamp,
      sample.elapsedMs,
      sample.phase,
      sample.privateBytes ?? "",
      sample.rssBytes ?? "",
      sample.processes?.length ?? "",
      sample.realms.pageUsedJSHeapBytes ?? "",
    ]),
  ];
  await writeFile(
    `${base}.csv`,
    `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    "utf8",
  );
  const reportJson = JSON.stringify(report).replace(/</g, "\\u003c");
  await writeFile(
    `${base}.html`,
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Within ${report.profileId} memory report</title>
<style>
body{font:15px system-ui;margin:0;background:#f5f0e7;color:#161815}main{max-width:1100px;margin:auto;padding:40px}
h1{font:48px Georgia;margin:0 0 12px}.pass{color:#087a3f}.fail{color:#b3261e}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.card{background:#fff;padding:18px;border-radius:12px}
.card b{display:block;font-size:24px;margin-top:8px}canvas{background:#fff;border-radius:12px;width:100%;height:360px}
table{border-collapse:collapse;width:100%;background:#fff;margin-top:24px}th,td{padding:9px;border-bottom:1px solid #ddd;text-align:right}th:first-child,td:first-child{text-align:left}
</style></head><body><main><h1>${report.profileId} stress profile</h1>
<p class="${report.passed ? "pass" : "fail"}">${report.passed ? "PASS" : "FAIL"} · complete Chromium process tree</p>
<div class="cards"><div class="card">Incremental private<b>${report.incrementalPrivateMiB.toFixed(1)} MiB</b></div>
<div class="card">Limit<b>${report.limitMiB} MiB</b></div>
<div class="card">Source<b>${(report.source.bytes / 1073741824).toFixed(2)} GiB</b></div>
<div class="card">Runs<b>${report.runs.length}</b></div></div>
<canvas id="chart" width="1050" height="360"></canvas><div id="runs"></div>
<script>const report=${reportJson};const c=document.getElementById('chart'),x=c.getContext('2d'),s=report.samples.filter(v=>v.privateBytes!=null);
x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);const min=s[0].elapsedMs,max=s.at(-1).elapsedMs,top=Math.max(...s.map(v=>v.privateBytes));
x.strokeStyle='#f65e43';x.lineWidth=3;x.beginPath();s.forEach((v,i)=>{const px=30+(v.elapsedMs-min)/(max-min)*(c.width-60),py=c.height-30-v.privateBytes/top*(c.height-60);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();
x.fillStyle='#666';x.fillText('Private bytes across full Chromium process tree',30,20);
document.getElementById('runs').innerHTML='<table><thead><tr><th>Run</th><th>Output</th><th>Time</th><th>Incremental private</th><th>Cleanup delta</th></tr></thead><tbody>'+report.runs.map(r=>'<tr><td>'+r.run+'</td><td>'+(r.outputBytes/1048576).toFixed(1)+' MiB</td><td>'+(r.elapsedMs/1000).toFixed(1)+' s</td><td>'+r.incrementalPrivateMiB.toFixed(1)+' MiB</td><td>'+r.cleanupDeltaFromLoadedMiB.toFixed(1)+' MiB</td></tr>').join('')+'</tbody></table>';
</script></main></body></html>`,
    "utf8",
  );
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function killProcessTree(pid) {
  try {
    await execFileAsync(
      "taskkill.exe",
      ["/PID", String(pid), "/T", "/F"],
      { windowsHide: true },
    );
  } catch {
    // The process may already have exited.
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function removeWithRetries(target) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true, maxRetries: 2 });
      return;
    } catch (error) {
      if (
        !["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code) ||
        attempt === 12
      ) {
        throw error;
      }
      await delay(500);
    }
  }
}
