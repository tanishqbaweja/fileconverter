import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
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
const isImageProfile =
  /^(?:png|jpeg|webp|gif|avif|bmp)-to-(?:png|jpeg|webp|bmp|ico)$/.test(profileId);
const isStreamingTextProfile =
  /^(?:csv|tsv|ndjson|json)-to-(?:csv|tsv|ndjson|json)$/.test(profileId) ||
  profileId === "srt-to-vtt" ||
  profileId === "vtt-to-srt" ||
  profileId === "ass-to-srt" ||
  profileId === "ass-to-vtt" ||
  profileId === "srt-to-ttml" ||
  profileId === "vtt-to-ttml" ||
  profileId === "ttml-to-srt" ||
  profileId === "ttml-to-vtt" ||
  profileId === "txt-to-html" ||
  profileId === "md-to-html" ||
  profileId === "html-to-txt" ||
  profileId === "docx-to-txt" ||
  profileId === "epub-to-txt" ||
  profileId === "pptx-to-txt" ||
  profileId === "odt-to-txt" ||
  profileId === "ods-to-csv" ||
  profileId === "odp-to-txt" ||
  profileId === "xlsx-to-csv" ||
  profileId === "xml-to-ndjson";
const isArchiveCompressionProfile =
  profileId === "tar-to-tar-gz" ||
  profileId === "tar-gz-to-tar";
const isBzip2Profile =
  profileId === "bzip2-compress" ||
  profileId === "bzip2-decompress" ||
  profileId === "tar-to-tar-bz2" ||
  profileId === "tar-bz2-to-tar";
const isBzip2CompressedOutput =
  profileId === "bzip2-compress" || profileId === "tar-to-tar-bz2";
const isXzProfile =
  profileId === "xz-compress" ||
  profileId === "xz-decompress" ||
  profileId === "tar-to-tar-xz" ||
  profileId === "tar-xz-to-tar";
const isXzCompressedOutput =
  profileId === "xz-compress" || profileId === "tar-to-tar-xz";
const isSevenZipProfile =
  profileId === "sevenzip-to-tar" || profileId === "sevenzip-to-tar-gz";
const isArchiveTransformProfile =
  profileId === "zip-to-tar" ||
  profileId === "zip-to-tar-gz" ||
  profileId === "tar-to-zip" ||
  profileId === "tar-gz-to-zip" ||
  isSevenZipProfile;
if (
  ![
    "gzip-compress",
    "gzip-decompress",
    "bzip2-compress",
    "bzip2-decompress",
    "tar-to-tar-bz2",
    "tar-bz2-to-tar",
    "xz-compress",
    "xz-decompress",
    "tar-to-tar-xz",
    "tar-xz-to-tar",
    "mkv-to-mp4",
    "mov-to-mp4",
    "3gp-to-mp4",
    "mpeg-ts-to-mp4",
    "flv-to-mp4",
    "avi-to-mp4",
    "mkv-to-m4a",
    "mov-to-m4a",
    "3gp-to-m4a",
    "mpeg-ts-to-m4a",
    "flv-to-m4a",
    "mp4-to-m4a",
    "aac-to-m4a",
    "mkv-to-wav",
    "mov-to-wav",
    "3gp-to-wav",
    "mpeg-ts-to-wav",
    "flv-to-wav",
    "avi-to-wav",
    "mp4-to-wav",
    "m4a-to-wav",
    "aac-to-wav",
    "amr-to-wav",
    "mp3-to-wav",
    "flac-to-wav",
    "wma-to-wav",
    "aiff-to-wav",
    "ogg-to-wav",
    "opus-to-wav",
    "m4a-to-flac",
    "aac-to-flac",
    "amr-to-flac",
    "mp3-to-flac",
    "wav-to-flac",
    "wma-to-flac",
    "aiff-to-flac",
    "ogg-to-flac",
    "opus-to-flac",
    "wav-to-alac",
    "flac-to-alac",
    "wav-to-wma",
    "flac-to-wma",
    "mkv-to-mp4-mpeg4",
    "mkv-to-webm",
    "ogv-to-webm",
    "ogv-to-wav",
    "m2v-to-mp4-mpeg4",
    "m2v-to-webm",
  ].includes(profileId) &&
  !isImageProfile &&
  !isStreamingTextProfile &&
  !isArchiveCompressionProfile &&
  !isArchiveTransformProfile
) {
  throw new Error(`Unsupported memory-profile route: ${profileId}`);
}
const isMediaProfile =
  profileId === "mkv-to-mp4" ||
  profileId === "mov-to-mp4" ||
  profileId === "3gp-to-mp4" ||
  profileId === "mpeg-ts-to-mp4" ||
  profileId === "flv-to-mp4" ||
  profileId === "avi-to-mp4" ||
  profileId === "mkv-to-m4a" ||
  profileId === "mov-to-m4a" ||
  profileId === "3gp-to-m4a" ||
  profileId === "mpeg-ts-to-m4a" ||
  profileId === "flv-to-m4a" ||
  profileId === "mp4-to-m4a" ||
  profileId === "aac-to-m4a" ||
  profileId === "mkv-to-wav" ||
  profileId === "mov-to-wav" ||
  profileId === "3gp-to-wav" ||
  profileId === "mpeg-ts-to-wav" ||
  profileId === "flv-to-wav" ||
  profileId === "avi-to-wav" ||
  profileId === "mp4-to-wav" ||
  profileId === "m4a-to-wav" ||
  profileId === "aac-to-wav" ||
  profileId === "amr-to-wav" ||
  profileId === "mp3-to-wav" ||
  profileId === "flac-to-wav" ||
  profileId === "wma-to-wav" ||
  profileId === "aiff-to-wav" ||
  profileId === "ogg-to-wav" ||
  profileId === "opus-to-wav" ||
  profileId === "m4a-to-flac" ||
  profileId === "aac-to-flac" ||
  profileId === "amr-to-flac" ||
  profileId === "mp3-to-flac" ||
  profileId === "wav-to-flac" ||
  profileId === "wma-to-flac" ||
  profileId === "aiff-to-flac" ||
  profileId === "ogg-to-flac" ||
  profileId === "opus-to-flac" ||
  profileId === "wav-to-alac" ||
  profileId === "flac-to-alac" ||
  profileId === "wav-to-wma" ||
  profileId === "flac-to-wma" ||
  profileId === "mkv-to-mp4-mpeg4" ||
  profileId === "mkv-to-webm" ||
  profileId === "ogv-to-webm" ||
  profileId === "ogv-to-wav" ||
  profileId === "m2v-to-mp4-mpeg4" ||
  profileId === "m2v-to-webm";
const expectedProfileValidation =
  fixtureManifest.expectedByProfile?.[profileId];
const expectedValidationBytes =
  expectedProfileValidation?.validationBytes ??
  fixtureManifest.validationBytes ??
  fixtureManifest.bytes;
const expectedValidationHash =
  expectedProfileValidation?.validationSha256 ??
  fixtureManifest.validationSha256 ??
  fixtureManifest.sha256;
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
const serverPort = await reserveAvailablePort();
const serverUrl = `http://127.0.0.1:${serverPort}`;
const sampleIntervalMs = 1_000;
const cleanupRecoveryLimitMiB = 96;
const runCount = Number.parseInt(process.env.WITHIN_RUN_COUNT ?? "3", 10);
if (!Number.isInteger(runCount) || runCount < 1 || runCount > 10) {
  throw new Error(`Invalid WITHIN_RUN_COUNT: ${process.env.WITHIN_RUN_COUNT}`);
}
const destinationMode = process.env.WITHIN_DESTINATION_MODE ?? "sync-opfs";
if (!new Set(["sync-opfs", "direct-handle"]).has(destinationMode)) {
  throw new Error(
    `Invalid WITHIN_DESTINATION_MODE: ${process.env.WITHIN_DESTINATION_MODE}`,
  );
}
const maximumWriteChunkBytes =
  destinationMode === "direct-handle" && profileId === "mkv-to-mp4"
    ? 1024 * 1024
    : isBzip2Profile || isXzProfile || isSevenZipProfile
      ? 64 * 1024
    : 256 * 1024;
const testUrl = `${serverUrl}/?test=1${
  destinationMode === "direct-handle" ? "&directory=1" : ""
}`;

assertInside(workRoot, profileRoot);
assertInside(path.resolve(projectRoot, "outputs"), reportRoot);
await removeWithRetries(profileRoot);
await mkdir(profileRoot, { recursive: true });
await mkdir(reportRoot, { recursive: true });

let serverProcess;
let chromeProcess;
let browser;
let page;
let blankStable = null;
let loadedStable = null;
let lastObservedState = null;
let activeRun = 0;
let reportWritten = false;
let terminationSignal = null;
const samples = [];
const runSummaries = [];
const startedAt = Date.now();
const handleTermination = (signal) => {
  if (terminationSignal) return;
  terminationSignal = signal;
  process.stderr.write(
    `Received ${signal}; stopping the project-local profile safely.\n`,
  );
  void (async () => {
    await browser?.close().catch(() => {});
    if (chromeProcess?.pid) await killProcessTree(chromeProcess.pid);
    if (serverProcess?.pid) await killProcessTree(serverProcess.pid);
  })();
};
const onSigint = () => handleTermination("SIGINT");
const onSigterm = () => handleTermination("SIGTERM");
process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);

try {
  serverProcess = spawn(
    process.execPath,
    [
      wranglerEntry,
      "dev",
      "--config",
      "dist/server/wrangler.json",
      "--port",
      String(serverPort),
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
      "--disable-default-apps",
      "--disable-domain-reliability",
      "--disable-extensions",
      "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
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
  page = pages[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await page.goto("about:blank");

  blankStable = await waitForStableMemory(
    chromeProcess.pid,
    page,
    "blank-baseline",
    samples,
  );
  const blankPrivateBytes = blankStable.privateBytes;
  if (blankPrivateBytes == null) {
    throw new Error("Blank Chromium private-memory baseline is unavailable.");
  }

  await page.goto(testUrl);
  await page.getByRole("heading", { name: "Big files. Small memory." }).waitFor();
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  loadedStable = await waitForStableMemory(
    chromeProcess.pid,
    page,
    "loaded-idle",
    samples,
  );
  if (loadedStable.privateBytes == null) {
    throw new Error("Loaded-site private-memory baseline is unavailable.");
  }

  for (let run = 1; run <= runCount; run += 1) {
    activeRun = run;
    const validationHash = createHash("sha256");
    let validationBytes = 0;
    let outputSha256 = null;
    let externalValidationSha256 = null;
    await page.goto(testUrl);
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await setLocalFileInput(cdp, fixturePath);
    const selectedFileBytes = await page.locator('[data-testid="file-input"]').evaluate(
      (input) => input.files?.[0]?.size ?? null,
    );
    if (selectedFileBytes !== fixtureManifest.bytes) {
      throw new Error(
        `Chromium selected ${selectedFileBytes ?? "no"} bytes; expected ${fixtureManifest.bytes}.`,
      );
    }
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(profileId);
    await page.locator('[data-testid="convert-button"]').click();
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().jobState !== "idle",
    );

    let peakPrivateBytes = null;
    let peakRssBytes = null;
    let finalState;
    for (;;) {
      const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
      lastObservedState = state ?? lastObservedState;
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

    const outputStorageName =
      destinationMode === "direct-handle"
        ? finalState?.batchOutputNames?.[0]
        : finalState?.opfsName;
    if (
      !finalState ||
      finalState.jobState !== "complete" ||
      !outputStorageName
    ) {
      throw new Error(
        `Conversion run ${run} failed: ${finalState?.error ?? finalState?.phase ?? "unknown"}`,
      );
    }
    if (peakPrivateBytes == null) {
      throw new Error(`Private-memory samples are unavailable for run ${run}.`);
    }

    let mediaProbe = null;
    if (
      isMediaProfile ||
      isImageProfile ||
      isArchiveTransformProfile ||
      isBzip2CompressedOutput ||
      isXzCompressedOutput
    ) {
      const physicalOutputPath = await findProjectLocalPayload(
        profileRoot,
        finalState.metrics.outputBytes,
      );
      if (isBzip2CompressedOutput || isXzCompressedOutput) {
        outputSha256 = (await hashFile(physicalOutputPath)).sha256;
        const decoded = isXzCompressedOutput
          ? await validateXzOutput(physicalOutputPath)
          : await validateBzip2Output(physicalOutputPath);
        validationBytes = decoded.bytes;
        externalValidationSha256 = decoded.sha256;
        if (
          validationBytes !== expectedValidationBytes ||
          externalValidationSha256 !== expectedValidationHash
        ) {
          throw new Error(
            `Independent streamed ${isXzCompressedOutput ? "XZ" : "BZIP2"} validation failed on run ${run}: ${validationBytes} bytes.`,
          );
        }
        mediaProbe = {
          withinValidation: {
            method: isXzCompressedOutput
              ? "python-lzma-stream-sha256"
              : "python-bz2-stream-sha256",
            passed: true,
            bytes: validationBytes,
            sha256: externalValidationSha256,
          },
        };
      } else {
        for await (const chunk of createReadStream(physicalOutputPath, {
          highWaterMark: 1024 * 1024,
        })) {
          validationHash.update(chunk);
          validationBytes += chunk.byteLength;
        }
        mediaProbe = isArchiveTransformProfile
          ? await validateArchiveOutput(
            physicalOutputPath,
            fixtureManifest,
            profileId,
          )
          : isMediaProfile
            ? await validateMediaOutput(
                physicalOutputPath,
                fixturePath,
                fixtureManifest,
                finalState,
                profileId,
              )
            : await validateImageOutput(
                physicalOutputPath,
                fixturePath,
                fixtureManifest,
                finalState,
                profileId,
              );
      }
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
          profileId === "gzip-compress" ||
          profileId === "tar-to-tar-gz"
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
      }, { opfsName: outputStorageName, profileId });
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
    const validationSha256 =
      externalValidationSha256 ?? validationHash.digest("hex");
    const actualHash = outputSha256 ?? validationSha256;

    const cleanupPage = await context.newPage();
    await cleanupPage.goto(`${serverUrl}/test-validator.html`);
    await cleanupPage.evaluate(async (opfsName) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(opfsName);
    }, outputStorageName);
    await cleanupPage.close();

    await delay(3_000);
    const cleanupStable = await waitForStableMemory(
      chromeProcess.pid,
      page,
      `cleanup-${run}`,
      samples,
      loadedStable.privateBytes +
        cleanupRecoveryLimitMiB * 1024 * 1024,
      60_000,
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
      imageFrameFormat: finalState.metrics.imageFrameFormat ?? null,
      imageColorSpace: finalState.metrics.imageColorSpace ?? null,
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
      validationSha256,
      mediaProbe,
    });
  }

  const peakPrivateBytes = Math.max(
    ...runSummaries.map((run) => run.peakPrivateBytes),
  );
  const checks = {
    processTreePrivateMemory:
      (peakPrivateBytes - blankPrivateBytes) / (1024 * 1024) <= 250,
    repeatableOutputHash: runSummaries.every(
      (run) => run.sha256 === runSummaries[0]?.sha256,
    ),
    pendingOperations: runSummaries.every(
      (run) => run.peakPendingOperations <= 1,
    ),
    queuedBytes: runSummaries.every(
      (run) => run.peakQueuedBytes <= maximumWriteChunkBytes,
    ),
    readChunkBytes: runSummaries.every(
      (run) => run.maxReadChunkBytes <= 256 * 1024,
    ),
    writeChunkBytes: runSummaries.every(
      (run) => run.maxWriteChunkBytes <= maximumWriteChunkBytes,
    ),
    imageOutputBytes: runSummaries.every(
      (run) => !isImageProfile || run.outputBytes <= 64 * 1024 * 1024,
    ),
    wasmMemoryBytes: runSummaries.every(
      (run) =>
        (!isMediaProfile &&
          !isBzip2Profile &&
          !isXzProfile &&
          !isSevenZipProfile) ||
        (typeof run.peakWasmMemoryBytes === "number" &&
          run.peakWasmMemoryBytes <=
            (isBzip2Profile
              ? 8 * 1024 * 1024
              : isXzProfile
                ? 48 * 1024 * 1024
                : isSevenZipProfile
                  ? 64 * 1024 * 1024
                : 128 * 1024 * 1024)),
    ),
    cleanupRecovery: runSummaries.every(
      (run) =>
        run.cleanupDeltaFromLoadedMiB <= cleanupRecoveryLimitMiB,
    ),
  };
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
    destinationMode,
    formula:
      "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
    blankBaseline: blankStable,
    loadedIdle: loadedStable,
    peakPrivateBytes,
    incrementalPrivateMiB:
      (peakPrivateBytes - blankPrivateBytes) / (1024 * 1024),
    limitMiB: 250,
    cleanupRecoveryLimitMiB,
    checks,
    passed: Object.values(checks).every(Boolean),
    runs: runSummaries,
    samples,
  };
  await writeReports(report);
  reportWritten = true;
  if (!report.passed) {
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name)
      .join(", ");
    throw new Error(
      `Memory profile failed (${failedChecks}): peak ${report.incrementalPrivateMiB.toFixed(1)} MiB; cleanup deltas ${runSummaries.map((run) => run.cleanupDeltaFromLoadedMiB.toFixed(1)).join(", ")} MiB`,
    );
  }
  process.stdout.write(
    `PASS ${report.incrementalPrivateMiB.toFixed(1)} MiB incremental private memory\n`,
  );
} catch (error) {
  if (!reportWritten) {
    if (chromeProcess?.pid && page) {
      try {
        samples.push(
          await takeSample(
            chromeProcess.pid,
            page,
            `failure-${activeRun || 1}`,
          ),
        );
      } catch {
        // The browser may already be unavailable; prior samples remain useful.
      }
    }
    try {
      await writeFailureReports({
        generatedAt: new Date().toISOString(),
        profileId,
        destinationMode,
        source: fixtureManifest,
        formula:
          "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
        blankBaseline: blankStable,
        loadedIdle: loadedStable,
      activeRun,
      terminationSignal,
      completedRuns: runSummaries,
        lastObservedState,
        samples,
        failure: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack ?? null : null,
        },
      });
    } catch (reportError) {
      process.stderr.write(
        `Failure diagnostics could not be written: ${
          reportError instanceof Error ? reportError.message : String(reportError)
        }\n`,
      );
    }
  }
  throw error;
} finally {
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);
  await browser?.close().catch(() => {});
  if (chromeProcess?.pid) await killProcessTree(chromeProcess.pid);
  if (serverProcess?.pid) await killProcessTree(serverProcess.pid);
  await removeWithRetries(profileRoot);
}

async function validateMediaOutput(
  localPath,
  sourcePath,
  source,
  finalState,
  route,
) {
  const audioOnly =
    route === "mkv-to-m4a" ||
    route === "mov-to-m4a" ||
    route === "3gp-to-m4a" ||
    route === "mpeg-ts-to-m4a" ||
    route === "flv-to-m4a" ||
    route === "mp4-to-m4a" ||
    route === "aac-to-m4a" ||
    route === "mkv-to-wav" ||
    route === "mov-to-wav" ||
    route === "3gp-to-wav" ||
    route === "mpeg-ts-to-wav" ||
    route === "flv-to-wav" ||
    route === "avi-to-wav" ||
    route === "ogv-to-wav" ||
    route === "mp4-to-wav" ||
    route === "m4a-to-wav" ||
    route === "aac-to-wav" ||
    route === "amr-to-wav" ||
    route === "mp3-to-wav" ||
    route === "flac-to-wav" ||
    route === "wma-to-wav" ||
    route === "aiff-to-wav" ||
    route === "ogg-to-wav" ||
    route === "opus-to-wav" ||
    route === "m4a-to-flac" ||
    route === "aac-to-flac" ||
    route === "amr-to-flac" ||
    route === "mp3-to-flac" ||
    route === "wav-to-flac" ||
    route === "wma-to-flac" ||
    route === "aiff-to-flac" ||
    route === "ogg-to-flac" ||
    route === "opus-to-flac" ||
    route === "wav-to-alac" ||
    route === "flac-to-alac" ||
    route === "wav-to-wma" ||
    route === "flac-to-wma";
  const pcmOutput =
    route === "mkv-to-wav" ||
    route === "mov-to-wav" ||
    route === "3gp-to-wav" ||
    route === "mpeg-ts-to-wav" ||
    route === "flv-to-wav" ||
    route === "avi-to-wav" ||
    route === "ogv-to-wav" ||
    route === "mp4-to-wav" ||
    route === "m4a-to-wav" ||
    route === "aac-to-wav" ||
    route === "amr-to-wav" ||
    route === "mp3-to-wav" ||
    route === "flac-to-wav" ||
    route === "wma-to-wav" ||
    route === "aiff-to-wav" ||
    route === "ogg-to-wav" ||
    route === "opus-to-wav";
  const flacOutput =
    route === "m4a-to-flac" ||
    route === "aac-to-flac" ||
    route === "amr-to-flac" ||
    route === "mp3-to-flac" ||
    route === "wav-to-flac" ||
    route === "wma-to-flac" ||
    route === "aiff-to-flac" ||
    route === "ogg-to-flac" ||
    route === "opus-to-flac";
  const alacOutput =
    route === "wav-to-alac" || route === "flac-to-alac";
  const wmaOutput =
    route === "wav-to-wma" || route === "flac-to-wma";
  const webmReencode =
    route === "mkv-to-webm" ||
    route === "ogv-to-webm" ||
    route === "m2v-to-webm";
  const webmAudioCopy = route === "ogv-to-webm";
  const videoReencode =
    route === "mkv-to-mp4-mpeg4" ||
    route === "m2v-to-mp4-mpeg4" ||
    webmReencode;
  const probedSourceDurationSeconds = Number(source.probe?.format?.duration);
  const sourceDurationSeconds = Number.isFinite(probedSourceDurationSeconds)
    ? probedSourceDurationSeconds
    : Number(source.durationSeconds);
  const minimumComparableSize =
    webmReencode && Number.isFinite(sourceDurationSeconds)
      ? Math.floor((sourceDurationSeconds * 300_000) / 8)
      : audioOnly || videoReencode
        ? 1
        : Math.floor(source.bytes * 0.85);
  const maximumComparableSize =
    webmReencode && Number.isFinite(sourceDurationSeconds)
      ? Math.ceil((sourceDurationSeconds * 1_200_000) / 8) + 1024 * 1024
      : pcmOutput
        ? Number.MAX_SAFE_INTEGER
        : flacOutput || alacOutput
          ? source.bytes * 10
          : audioOnly
            ? source.bytes
            : videoReencode
              ? source.bytes * 3
              : Math.ceil(source.bytes * 1.05);
  if (
    finalState.metrics.outputBytes < minimumComparableSize ||
    finalState.metrics.outputBytes > maximumComparableSize
  ) {
    throw new Error(
      `Browser media output size is outside the validated range: ${finalState.metrics.outputBytes} bytes.`,
    );
  }
  let independentAudioValidation = null;
  if (
    (pcmOutput || flacOutput || alacOutput) &&
    source.losslessPcmReference &&
    source.decodedPcmSha256
  ) {
    const { stdout: decodedPcmHash } = await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        localPath,
        "-map",
        "0:a:0",
        "-c:a",
        "pcm_s16le",
        "-f",
        "hash",
        "-hash",
        "sha256",
        "-",
      ],
      {
        cwd: projectRoot,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    if (
      decodedPcmHash.trim().split("=")[1] !== source.decodedPcmSha256
    ) {
      throw new Error(
        "Browser decoded audio content does not match the independently decoded source audio.",
      );
    }
    independentAudioValidation = {
      method: "decoded-pcm-sha256",
      passed: true,
      sha256: source.decodedPcmSha256,
    };
  } else if (pcmOutput || flacOutput || alacOutput || wmaOutput) {
    const minimumPsnrDb = source.minimumDecodedAudioPsnrDb ?? 60;
    const { stderr: qualityLog } = await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostdin",
        "-i",
        sourcePath,
        "-i",
        localPath,
        "-filter_complex",
        "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]apsnr[quality]",
        "-map",
        "[quality]",
        "-f",
        "null",
        "NUL",
      ],
      {
        cwd: projectRoot,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const channelPsnrDb = [
      ...qualityLog.matchAll(
        /PSNR ch\d+:\s+(inf|[+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi,
      ),
    ].map((match) =>
      match[1].toLowerCase() === "inf"
        ? Number.POSITIVE_INFINITY
        : Number.parseFloat(match[1]),
    );
    if (
      channelPsnrDb.length === 0 ||
      channelPsnrDb.some(
        (value) => !Number.isFinite(value) && value !== Number.POSITIVE_INFINITY,
      ) ||
      channelPsnrDb.some((value) => value < minimumPsnrDb)
    ) {
      throw new Error(
        `Browser decoded audio quality validation failed: ${channelPsnrDb.join(", ") || "no APSNR result"} dB.`,
      );
    }
    independentAudioValidation = {
      method: "decoded-audio-apsnr",
      passed: true,
      minimumRequiredDb: minimumPsnrDb,
      channelPsnrDb: channelPsnrDb.map((value) =>
        value === Number.POSITIVE_INFINITY ? "Infinity" : value,
      ),
    };
  }
  if (route === "aac-to-m4a") {
    const packetHashes = [];
    for (const [candidateIndex, candidate] of [sourcePath, localPath].entries()) {
      const sourceAdtsFilter =
        candidateIndex === 0 ? ["-bsf:a", "aac_adtstoasc"] : [];
      const { stdout: packetHash } = await execFileAsync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          candidate,
          "-map",
          "0:a:0",
          "-c:a",
          "copy",
          ...sourceAdtsFilter,
          "-f",
          "hash",
          "-hash",
          "sha256",
          "-",
        ],
        {
          cwd: projectRoot,
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      packetHashes.push(packetHash.trim().split("=")[1]);
    }
    if (!packetHashes[0] || packetHashes[0] !== packetHashes[1]) {
      throw new Error(
        "Browser M4A AAC packets do not match the raw ADTS source payload.",
      );
    }
    independentAudioValidation = {
      method: "aac-packet-sha256",
      passed: true,
      sha256: packetHashes[0],
    };
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
  if (independentAudioValidation) {
    probe.withinValidation = independentAudioValidation;
  }
  const codecs = probe.streams.map((stream) => stream.codec_name);
  const sourceVideo = source.probe.streams.find(
    (stream) =>
      stream.codec_type === "video" && !stream.disposition?.attached_pic,
  );
  const sourceAudio = source.probe.streams.find(
    (stream) => stream.codec_type === "audio",
  );
  if (
    (audioOnly &&
      (codecs.length !== 1 ||
        codecs[0] !==
          (pcmOutput
            ? "pcm_s16le"
            : flacOutput
              ? "flac"
              : alacOutput
                ? "alac"
                : wmaOutput
                  ? "wmav2"
                : "aac"))) ||
    (videoReencode &&
      (codecs.length !== (webmAudioCopy ? 2 : 1) ||
        codecs[0] !== (webmReencode ? "vp8" : "mpeg4") ||
        (webmAudioCopy && codecs[1] !== "vorbis"))) ||
    (!audioOnly &&
      !videoReencode &&
      (codecs.length !== 2 ||
        codecs[0] !== sourceVideo?.codec_name ||
        codecs[1] !== sourceAudio?.codec_name))
  ) {
    throw new Error(`Unexpected browser media streams: ${codecs.join(", ")}.`);
  }
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format.duration);
  const normalizedOutputLanguage =
    audio?.tags?.language && audio.tags.language !== "und"
      ? audio.tags.language
      : null;
  const normalizedSourceLanguage =
    sourceAudio?.tags?.language && sourceAudio.tags.language !== "und"
      ? sourceAudio.tags.language
      : null;
  const sourceDuration = sourceDurationSeconds;
  const expectedDuration =
    audioOnly &&
    (pcmOutput || flacOutput || alacOutput || route === "aac-to-m4a")
      ? (source.decodedAudioDurationSeconds ?? sourceDuration)
      : sourceDuration;
  const expectedVideoWidth = webmReencode
    ? Math.min(640, sourceVideo?.width ?? 0)
    : sourceVideo?.width;
  const expectedVideoHeight =
    webmReencode && (sourceVideo?.width ?? 0) > 640
      ? Math.max(
          2,
          Math.floor(
            ((sourceVideo?.height ?? 0) * expectedVideoWidth) /
              sourceVideo.width,
          ) & ~1,
        )
      : sourceVideo?.height;
  if (
    (!audioOnly &&
      (video?.width !== expectedVideoWidth ||
        video?.height !== expectedVideoHeight)) ||
    ((audioOnly || webmAudioCopy) &&
      audio?.channels !==
        (wmaOutput
          ? Math.min(2, sourceAudio?.channels ?? 0)
          : sourceAudio?.channels)) ||
    ((route === "mkv-to-m4a" ||
      route === "mov-to-m4a" ||
      route === "3gp-to-m4a" ||
      route === "mpeg-ts-to-m4a" ||
      route === "flv-to-m4a" ||
      route === "mp4-to-m4a" ||
      route === "aac-to-m4a" ||
      route === "wav-to-alac" ||
      route === "flac-to-alac" ||
      webmAudioCopy) &&
      normalizedOutputLanguage !== normalizedSourceLanguage) ||
    Math.abs(duration - expectedDuration) > 0.25
  ) {
    throw new Error(
      `Browser media metadata validation failed: ${video?.width ?? "audio-only"}x${video?.height ?? "audio-only"}, ${audio?.channels ?? "video-only"} channels, ${audio?.tags?.language ?? "not-applicable"}, ${duration}s.`,
    );
  }
  if (videoReencode && video) {
    const midpoint = Math.max(0, sourceDuration / 2);
    const { stderr: similarityLog } = await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostdin",
        "-ss",
        midpoint.toFixed(3),
        "-i",
        sourcePath,
        "-ss",
        midpoint.toFixed(3),
        "-i",
        localPath,
        "-filter_complex",
        `[0:v:0]scale=${video.width}:${video.height}:flags=bicubic,format=yuv420p,setpts=PTS-STARTPTS[source];[1:v:0]format=yuv420p,setpts=PTS-STARTPTS[converted];[source][converted]ssim[quality]`,
        "-map",
        "[quality]",
        "-frames:v",
        "1",
        "-f",
        "null",
        "NUL",
      ],
      {
        cwd: projectRoot,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const similarity = Number.parseFloat(
      similarityLog.match(/SSIM[^\r\n]*All:([0-9.]+)/)?.[1] ?? "",
    );
    if (!Number.isFinite(similarity) || similarity < 0.35) {
      const diagnosticTail = similarityLog
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-8)
        .join(" | ")
        .slice(0, 2_048);
      throw new Error(
        `Browser video midpoint visual validation failed: SSIM ${Number.isFinite(similarity) ? similarity : "unavailable"}.${diagnosticTail ? ` Validator tail: ${diagnosticTail}` : ""}`,
      );
    }
    probe.withinValidation = {
      ...(probe.withinValidation ?? {}),
      midpointSeconds: midpoint,
      midpointVisualSsim: similarity,
      minimumVisualSsim: 0.35,
    };
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
      !finalState.warnings.some(
        (warning) =>
          warning.includes("attachment") || warning.includes("attached picture"),
      ))
  ) {
    throw new Error(
      "The browser did not explicitly disclose excluded subtitle and attachment streams.",
    );
  }
  if (
    (source.probe.chapters?.length ?? 0) > 0 &&
    !finalState.warnings.some((warning) => warning.includes("chapter"))
  ) {
    throw new Error("The browser did not explicitly disclose the excluded source chapters.");
  }
  if (
    audioOnly &&
    sourceVideo &&
    !finalState.warnings.some((warning) => warning.includes("video stream"))
  ) {
    throw new Error("The browser did not explicitly disclose the excluded video stream.");
  }
  if (
    videoReencode &&
    !webmAudioCopy &&
    sourceAudio &&
    !finalState.warnings.some((warning) => warning.includes("audio stream"))
  ) {
    throw new Error("The browser did not explicitly disclose the excluded audio stream.");
  }
  const requiresFullDecodeTraversal =
    videoReencode ||
    route === "mkv-to-m4a" ||
    route === "mov-to-m4a" ||
    route === "3gp-to-m4a" ||
    route === "mpeg-ts-to-m4a" ||
    route === "flv-to-m4a" ||
    route === "mp4-to-m4a" ||
    route === "aac-to-m4a" ||
    route === "wav-to-alac" ||
    route === "flac-to-alac" ||
    route === "wav-to-wma" ||
    route === "flac-to-wma";
  await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      localPath,
      ...(audioOnly ? [] : ["-map", "0:v:0"]),
      ...(!videoReencode || webmAudioCopy ? ["-map", "0:a:0"] : []),
      ...(requiresFullDecodeTraversal ? [] : ["-c", "copy"]),
      "-f",
      "null",
      "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  probe.withinValidation = {
    ...(probe.withinValidation ?? {}),
    mediaTraversal: requiresFullDecodeTraversal
      ? "full-native-decode"
      : "full-packet-traversal",
  };
  return probe;
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath, {
    highWaterMark: 1024 * 1024,
  })) {
    hash.update(chunk);
    bytes += chunk.byteLength;
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function validateBzip2Output(filePath) {
  const python = String.raw`
import bz2, hashlib, json, sys
h = hashlib.sha256()
n = 0
with bz2.open(sys.argv[1], "rb") as source:
    while True:
        chunk = source.read(262144)
        if not chunk:
            break
        h.update(chunk)
        n += len(chunk)
print(json.dumps({"bytes": n, "sha256": h.hexdigest()}))
`;
  const { stdout } = await execFileAsync(
    "python",
    ["-c", python, filePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  const result = JSON.parse(stdout);
  if (
    !Number.isSafeInteger(result.bytes) ||
    result.bytes < 0 ||
    !/^[0-9a-f]{64}$/.test(result.sha256)
  ) {
    throw new Error("The independent BZIP2 validator returned invalid evidence.");
  }
  return result;
}

async function validateXzOutput(filePath) {
  const python = String.raw`
import hashlib, json, lzma, sys
h = hashlib.sha256()
n = 0
with lzma.open(sys.argv[1], "rb") as source:
    while True:
        chunk = source.read(262144)
        if not chunk:
            break
        h.update(chunk)
        n += len(chunk)
print(json.dumps({"bytes": n, "sha256": h.hexdigest()}))
`;
  const { stdout } = await execFileAsync(
    "python",
    ["-c", python, filePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  const result = JSON.parse(stdout);
  if (
    !Number.isSafeInteger(result.bytes) ||
    result.bytes < 0 ||
    !/^[0-9a-f]{64}$/.test(result.sha256)
  ) {
    throw new Error("The independent XZ validator returned invalid evidence.");
  }
  return result;
}

async function validateArchiveOutput(localPath, source, route) {
  if (!Array.isArray(source.entries) || source.entries.length === 0) {
    throw new Error("Archive fixture manifest has no independently verifiable entries.");
  }
  const { stdout } = await execFileAsync("tar", ["-tf", localPath], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const listedEntries = stdout
    .split(/\r?\n/)
    .filter((name) => name.length > 0);
  const expectedNames = source.entries.map((entry) => entry.name);
  if (
    listedEntries.length !== expectedNames.length ||
    listedEntries.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error(
      `Archive entry listing differs from the fixture manifest: ${listedEntries.length} entries.`,
    );
  }

  const verifiedEntries = [];
  for (const entry of source.entries) {
    const result = await hashArchiveEntry(localPath, entry.name);
    if (result.bytes !== entry.size || result.sha256 !== entry.sha256) {
      throw new Error(
        `Archive entry validation failed for ${entry.name}: ${result.bytes} bytes.`,
      );
    }
    verifiedEntries.push({
      name: entry.name,
      bytes: result.bytes,
      sha256: result.sha256,
    });
  }
  return {
    method: "libarchive-entry-sha256",
    route,
    passed: true,
    entryCount: verifiedEntries.length,
    entries: verifiedEntries,
  };
}

async function hashArchiveEntry(localPath, entryName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "tar",
      ["-xOf", localPath, "--", entryName],
      {
        cwd: projectRoot,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const hash = createHash("sha256");
    let bytes = 0;
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      hash.update(chunk);
      bytes += chunk.byteLength;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `libarchive could not extract ${entryName}: ${stderr.trim() || `exit ${code}`}`,
          ),
        );
        return;
      }
      resolve({ bytes, sha256: hash.digest("hex") });
    });
  });
}

async function validateImageOutput(
  localPath,
  sourcePath,
  source,
  finalState,
  route,
) {
  if (
    finalState.metrics.outputBytes < 1 ||
    finalState.metrics.outputBytes > 64 * 1024 * 1024
  ) {
    throw new Error(
      `Browser image output is outside the bounded range: ${finalState.metrics.outputBytes} bytes.`,
    );
  }
  const outputFormat = route.split("-to-")[1];
  const expectedCodec =
    outputFormat === "jpeg"
      ? "mjpeg"
      : outputFormat === "ico"
        ? "png"
        : outputFormat;
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      localPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  const sourceStream = source.probe?.streams?.[0];
  const sourceWidth = Number(sourceStream?.width);
  const sourceHeight = Number(sourceStream?.height);
  const iconScale =
    outputFormat === "ico"
      ? Math.min(1, 256 / sourceWidth, 256 / sourceHeight)
      : 1;
  const expectedWidth = Math.max(1, Math.round(sourceWidth * iconScale));
  const expectedHeight = Math.max(1, Math.round(sourceHeight * iconScale));
  if (
    probe.streams?.length !== 1 ||
    stream?.codec_name !== expectedCodec ||
    stream?.width !== expectedWidth ||
    stream?.height !== expectedHeight
  ) {
    throw new Error(
      `Browser image validation failed: ${stream?.codec_name ?? "missing"} ${stream?.width ?? 0}x${stream?.height ?? 0}.`,
    );
  }
  await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-i", localPath, "-f", "null", "NUL"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const comparisonFilter =
    outputFormat === "ico"
      ? `[0:v:0]trim=end_frame=1,setpts=PTS-STARTPTS,scale=${expectedWidth}:${expectedHeight}:flags=lanczos,format=rgb24[source];[1:v:0]trim=end_frame=1,setpts=PTS-STARTPTS,format=rgb24[converted];[source][converted]ssim[quality]`
      : "[0:v:0]trim=end_frame=1,setpts=PTS-STARTPTS,format=rgb24[source];[1:v:0]trim=end_frame=1,setpts=PTS-STARTPTS,format=rgb24[converted];[source][converted]ssim[quality]";
  const { stderr: similarityLog } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostdin",
      "-i",
      sourcePath,
      "-i",
      localPath,
      "-filter_complex",
      comparisonFilter,
      "-map",
      "[quality]",
      "-frames:v",
      "1",
      "-f",
      "null",
      "NUL",
    ],
    {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const similarity = Number.parseFloat(
    similarityLog.match(/SSIM[^\r\n]*All:([0-9.]+)/)?.[1] ?? "",
  );
  if (!Number.isFinite(similarity) || similarity < 0.3) {
    throw new Error(
      `Browser image visual validation failed: SSIM ${Number.isFinite(similarity) ? similarity : "unavailable"}.`,
    );
  }
  if (
    Number(sourceStream?.nb_frames ?? 1) > 1 &&
    !finalState.warnings.some((warning) => warning.includes("first animation frame"))
  ) {
    throw new Error("The browser did not disclose that only the first animation frame was converted.");
  }
  probe.withinValidation = {
    firstFrameVisualSsim: similarity,
    minimumVisualSsim: 0.3,
    decodedByNativeFfmpeg: true,
  };
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

function reserveAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not reserve a local test port.")));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
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

async function waitForStableMemory(
  rootPid,
  page,
  phase,
  targetSamples,
  maximumPrivateBytes = null,
  timeoutMs = 30_000,
) {
  const local = [];
  const deadline = Date.now() + timeoutMs;
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
      if (
        spread / Math.max(1, median) <= 0.02 &&
        (maximumPrivateBytes == null || median <= maximumPrivateBytes)
      ) {
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
$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate,PrivatePageCount,WorkingSetSize)
$ids = New-Object 'System.Collections.Generic.HashSet[int]'
[void]$ids.Add(${Number(rootPid)})
$createdAt = @{}
foreach ($p in $all) {
  $createdAt[[int]$p.ProcessId] = [datetime]$p.CreationDate
}
do {
  $changed = $false
  foreach ($p in $all) {
    $parentId = [int]$p.ParentProcessId
    if (
      $ids.Contains($parentId) -and
      -not $ids.Contains([int]$p.ProcessId) -and
      $createdAt.ContainsKey($parentId) -and
      [datetime]$p.CreationDate -ge [datetime]$createdAt[$parentId]
    ) {
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
    createdAt = ([datetime]$_.CreationDate).ToUniversalTime().ToString('o')
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

async function writeFailureReports(report) {
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const destinationSuffix =
    report.destinationMode === "direct-handle" ? "-direct-handle" : "";
  const base = path.join(
    reportRoot,
    `${stamp}-${report.profileId}${destinationSuffix}-stress-failure`,
  );
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
      sample.realms?.pageUsedJSHeapBytes ?? "",
    ]),
  ];
  await writeFile(
    `${base}.csv`,
    `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    "utf8",
  );
  const recentSamples = report.samples.slice(-100);
  const rows = recentSamples
    .map(
      (sample) =>
        `<tr><td>${htmlEscape(sample.timestamp)}</td><td>${htmlEscape(sample.phase)}</td><td>${sample.privateBytes ?? "unavailable"}</td><td>${sample.rssBytes ?? "unavailable"}</td><td>${sample.processes?.length ?? "unavailable"}</td></tr>`,
    )
    .join("");
  await writeFile(
    `${base}.html`,
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Within ${htmlEscape(report.profileId)} failed memory profile</title>
<style>body{font:15px system-ui;margin:0;background:#f5f0e7;color:#161815}main{max-width:1100px;margin:auto;padding:40px}h1{font:44px Georgia;margin:0 0 12px}.fail{color:#b3261e;font-weight:700}pre,table{background:#fff;padding:16px;border-radius:12px;overflow:auto}table{border-collapse:collapse;width:100%}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:right}th:first-child,td:first-child{text-align:left}</style>
</head><body><main><h1>${htmlEscape(report.profileId)} failure diagnostics</h1>
<p class="fail">FAIL · run ${report.activeRun || "before conversion"}</p>
<pre>${htmlEscape(report.failure.stack ?? report.failure.message)}</pre>
<h2>Last 100 process-tree samples</h2><table><thead><tr><th>Timestamp</th><th>Phase</th><th>Private bytes</th><th>RSS bytes</th><th>Processes</th></tr></thead><tbody>${rows}</tbody></table>
<p>The large project-local browser profile and partial converted output were deleted after these compact diagnostics were written.</p>
</main></body></html>`,
    "utf8",
  );
}

async function writeReports(report) {
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const destinationSuffix =
    report.destinationMode === "direct-handle" ? "-direct-handle" : "";
  const base = path.join(
    reportRoot,
    `${stamp}-${report.profileId}${destinationSuffix}-stress`,
  );
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

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
