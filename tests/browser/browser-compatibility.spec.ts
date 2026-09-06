import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  type WriteStream,
} from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const testPort = process.env.WITHIN_TEST_PORT ?? "3000";
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const expectedOrigin = new URL(baseURL).origin;
const artifactRoot = path.join(
  projectRoot,
  "output",
  "playwright",
  "browser-compatibility",
);
const headed = process.env.WITHIN_CROSS_BROWSER_HEADED === "1";
const expectedTsv =
  "name\tnote\tcount\r\n" +
  "alpha\t\"comma, quote \"\"and\"\" newline\ninside\"\t2\r\n" +
  "\u03b2eta\tUnicode survives\t3\r\n";

const allBrowserTargets = [
  {
    id: "chrome",
    name: "Google Chrome",
    executable: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    executable:
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  },
  {
    id: "brave",
    name: "Brave",
    executable:
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  },
  {
    id: "opera-gx",
    name: "Opera GX",
    executable:
      "C:\\Users\\slato\\AppData\\Local\\Programs\\Opera GX\\opera.exe",
  },
] as const;

const requestedTargets = new Set(
  (process.env.WITHIN_BROWSER_TARGETS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const browserTargets = allBrowserTargets.filter(
  (target) =>
    existsSync(target.executable) &&
    (requestedTargets.size === 0 || requestedTargets.has(target.id)),
);

interface RouteResult {
  profileId: string;
  inputBytes: number;
  outputBytes: number;
  outputSha256: string;
  elapsedMs: number;
  maxReadChunkBytes: number;
  maxWriteChunkBytes: number;
  peakQueuedBytes: number;
  peakPendingOperations: number;
  validator: string;
}

interface CompatibilityResult {
  browser: string;
  browserId: string;
  executable: string;
  userAgent: string;
  headed: boolean;
  crossOriginIsolated: boolean;
  capabilities: Record<string, unknown>;
  routes: RouteResult[];
  directDestination: {
    profileId: string;
    outputBytes: number;
    outputSha256: string;
    validator: string;
  };
  failureRecovery: {
    profileId: string;
    error: string;
    leftoverOutputNames: string[];
  };
  network: {
    requestCount: number;
    methods: string[];
    origins: string[];
    requestBodies: number;
    privateTokensObserved: string[];
  };
  diagnostics: string[];
  durationMs: number;
}

function assertProjectLocal(target: string): void {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing a non-project test path: ${target}`);
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function ffprobe(filePath: string): Promise<{
  streams: Array<{
    codec_name?: string;
    codec_type?: string;
    width?: number;
    height?: number;
  }>;
  format?: { duration?: string };
}> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,codec_type,width,height:format=duration",
      "-of",
      "json",
      filePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function decodeWithFfmpeg(filePath: string): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", filePath, "-f", "null", "-"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
  );
}

async function imageSsim(
  referencePath: string,
  convertedPath: string,
): Promise<number> {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "info",
      "-i",
      referencePath,
      "-i",
      convertedPath,
      "-lavfi",
      "[0:v:0]format=rgb24[reference];[1:v:0]format=rgb24[converted];[reference][converted]ssim",
      "-f",
      "null",
      process.platform === "win32" ? "NUL" : "/dev/null",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
  );
  const similarity = Number.parseFloat(
    stderr.match(/SSIM[^\r\n]*All:([0-9.]+)/)?.[1] ?? "",
  );
  expect(Number.isFinite(similarity)).toBe(true);
  return similarity;
}

async function packetHash(
  filePath: string,
  stream: "v:0" | "a:0",
): Promise<string> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-map",
      `0:${stream}`,
      "-c",
      "copy",
      "-f",
      "hash",
      "-hash",
      "sha256",
      "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
  );
  return stdout.trim().split("=")[1];
}

async function validateZip(filePath: string): Promise<string> {
  const python = String.raw`
import hashlib, json, sys, zipfile
entries = []
with zipfile.ZipFile(sys.argv[1], "r") as archive:
    bad = archive.testzip()
    for info in archive.infolist():
        digest = hashlib.sha256()
        size = 0
        if not info.is_dir():
            with archive.open(info, "r") as source:
                while True:
                    chunk = source.read(262144)
                    if not chunk:
                        break
                    digest.update(chunk)
                    size += len(chunk)
        entries.append({"name": info.filename, "size": size, "sha256": digest.hexdigest()})
print(json.dumps({"bad": bad, "entries": entries}, sort_keys=True))
`;
  const { stdout } = await execFileAsync("python", ["-c", python, filePath], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  const result = JSON.parse(stdout) as {
    bad: string | null;
    entries: Array<{ name: string; size: number; sha256: string }>;
  };
  const fixtureManifest = JSON.parse(
    await readFile(
      path.join(projectRoot, "fixtures", "archives", "sample.tar.json"),
      "utf8",
    ),
  ) as { entries: Array<{ name: string; size: number; sha256: string }> };
  expect(result.bad).toBeNull();
  expect(result.entries).toEqual(fixtureManifest.entries);
  return `Python zipfile testzip plus ${result.entries.length} entry hashes`;
}

async function validateDocx(filePath: string): Promise<string> {
  const python = String.raw`
import json, sys, zipfile
from xml.etree import ElementTree as ET
with zipfile.ZipFile(sys.argv[1], "r") as package:
    bad = package.testzip()
    names = package.namelist()
    root = ET.fromstring(package.read("word/document.xml"))
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
paragraphs = []
for paragraph in root.findall(".//w:body/w:p", ns):
    parts = []
    for node in paragraph.iter():
        if node.tag == "{%s}t" % ns["w"]:
            parts.append(node.text or "")
        elif node.tag == "{%s}tab" % ns["w"]:
            parts.append("\\t")
    paragraphs.append("".join(parts))
print(json.dumps({"bad": bad, "names": names, "paragraphs": paragraphs}, ensure_ascii=True))
`;
  const { stdout } = await execFileAsync("python", ["-c", python, filePath], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  const result = JSON.parse(stdout) as {
    bad: string | null;
    names: string[];
    paragraphs: string[];
  };
  expect(result.bad).toBeNull();
  expect(result.names).toEqual([
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
  ]);
  expect(result.paragraphs.join("\n")).toContain("Within keeps files on this device.");
  expect(result.paragraphs.join("\n")).toContain("\u0939\u093f\u0928\u094d\u0926\u0940, \u65e5\u672c\u8a9e, caf\u00e9.");
  return "Python zipfile package test plus XML parse and Unicode paragraph check";
}

async function appOutputNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-")) names.push(name);
    }
    return names.sort();
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  assertProjectLocal(artifactRoot);
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  expect(browserTargets.length).toBeGreaterThan(0);
});

for (const target of browserTargets) {
  test(`${target.name} completes the representative production matrix`, async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    const started = Date.now();
    const targetHeaded =
      headed &&
      (target.id !== "opera-gx" ||
        process.env.WITHIN_OPERA_GX_HEADED === "1");
    const profileRoot = path.join(
      projectRoot,
      "work",
      `playwright-profile-compatibility-${target.id}-${process.pid}`,
    );
    const outputRoot = path.join(
      projectRoot,
      "work",
      `browser-compatibility-${target.id}`,
    );
    assertProjectLocal(profileRoot);
    assertProjectLocal(outputRoot);
    await rm(profileRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(profileRoot, { recursive: true });
    await mkdir(outputRoot, { recursive: true });

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let validationSink: WriteStream | null = null;
    const diagnostics: string[] = [];
    const observedRequests: Array<{
      method: string;
      url: string;
      body: string | null;
    }> = [];
    const routeResults: RouteResult[] = [];

    try {
      context = await chromium.launchPersistentContext(profileRoot, {
        executablePath: target.executable,
        headless: !targetHeaded,
        acceptDownloads: false,
        baseURL,
        serviceWorkers: "allow",
        args: [
          "--no-first-run",
          "--disable-default-apps",
          "--disable-background-mode",
        ],
      });
      await context.addInitScript(() => {
        Object.defineProperty(window, "showSaveFilePicker", {
          configurable: true,
          value: async (options?: { suggestedName?: string }) => {
            const root = await navigator.storage.getDirectory();
            return root.getFileHandle(
              options?.suggestedName ?? "within-output.bin",
              { create: true },
            );
          },
        });
      });
      page = await context.newPage();
      await page.exposeBinding(
        "__withinCompatibilityValidationChunk",
        async (_source, base64: string) => {
          if (!validationSink) {
            throw new Error("The project-local validation sink is not open.");
          }
          if (!validationSink.write(Buffer.from(base64, "base64"))) {
            await once(validationSink, "drain");
          }
        },
      );
      page.on("console", (message) => {
        if (message.type() === "error") {
          diagnostics.push(`console:${message.text()}`);
        }
      });
      page.on("pageerror", (error) => diagnostics.push(`pageerror:${error.message}`));
      page.on("request", (request) => {
        observedRequests.push({
          method: request.method(),
          url: request.url(),
          body: request.postData(),
        });
      });
      page.on("requestfailed", (request) => {
        diagnostics.push(
          `requestfailed:${request.url()}:${request.failure()?.errorText ?? "unknown"}`,
        );
      });

      const navigate = async (targetPath: string): Promise<void> => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            await page!.goto(targetPath, { waitUntil: "domcontentloaded" });
            return;
          } catch (error) {
            if (
              attempt === 0 &&
              error instanceof Error &&
              error.message.includes("ERR_ABORTED")
            ) {
              await page!.waitForTimeout(250);
              continue;
            }
            throw error;
          }
        }
      };

      const openApp = async (): Promise<void> => {
        await navigate("/?test=1");
        await expect(
          page!.getByRole("heading", { name: "Big files. Small memory." }),
        ).toBeVisible();
        await expect
          .poll(
            () =>
              page!.evaluate(
                () => window.__WITHIN_TEST__?.getState().workerStatus,
              ),
            { timeout: 20_000 },
          )
          .toBe("ready");
      };

      await openApp();
      await expect
        .poll(
          () =>
            page!.evaluate(
              () => window.__WITHIN_TEST__?.getState().capabilities ?? null,
            ),
          { timeout: 20_000 },
        )
        .not.toBeNull();
      const capabilityState = await page.evaluate(() => {
        const capabilities = window.__WITHIN_TEST__?.getState().capabilities;
        return {
          crossOriginIsolated: window.crossOriginIsolated,
          capabilities,
          userAgent: navigator.userAgent,
        };
      });
      expect(capabilityState.crossOriginIsolated).toBe(true);
      expect(capabilityState.capabilities).toMatchObject({
        secure: true,
        wasm: true,
        wasmSimd: true,
        workers: true,
        fileSystemAccess: true,
        opfs: true,
        sharedArrayBuffer: true,
        crossOriginIsolated: true,
        offscreenCanvas: true,
      });
      await expect(page.getByTestId("capability-blocker")).toHaveCount(0);

      const copyAndDeleteOutput = async (
        opfsName: string,
        outputPath: string,
      ): Promise<void> => {
        const sink = createWriteStream(outputPath, { flags: "w" });
        validationSink = sink;
        try {
          await page!.evaluate(async (entryName) => {
            const root = await navigator.storage.getDirectory();
            try {
              const handle = await root.getFileHandle(entryName);
              const reader = (await handle.getFile()).stream().getReader();
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                for (
                  let offset = 0;
                  offset < value.byteLength;
                  offset += 64 * 1024
                ) {
                  const part = value.subarray(
                    offset,
                    Math.min(offset + 64 * 1024, value.byteLength),
                  );
                  let binary = "";
                  for (
                    let inner = 0;
                    inner < part.byteLength;
                    inner += 16 * 1024
                  ) {
                    binary += String.fromCharCode(
                      ...part.subarray(
                        inner,
                        Math.min(inner + 16 * 1024, part.byteLength),
                      ),
                    );
                  }
                  await window.__withinCompatibilityValidationChunk(
                    btoa(binary),
                  );
                }
              }
            } finally {
              await root.removeEntry(entryName).catch(() => {});
            }
          }, opfsName);
          sink.end();
          await once(sink, "finish");
        } catch (error) {
          sink.destroy();
          throw error;
        } finally {
          if (validationSink === sink) validationSink = null;
        }
      };

      const convert = async (
        profileId: string,
        fixture: string,
        outputName: string,
        validator: (outputPath: string) => Promise<string>,
      ): Promise<void> => {
        await openApp();
        const fixturePath = path.join(projectRoot, fixture);
        const outputPath = path.join(outputRoot, outputName);
        assertProjectLocal(fixturePath);
        assertProjectLocal(outputPath);
        await page!
          .locator('[data-testid="file-input"]')
          .setInputFiles(fixturePath);
        await page!
          .locator('[data-testid="format-select"]')
          .selectOption(profileId);
        await expect(page!.locator('[data-testid="convert-button"]')).toBeEnabled();
        await page!.locator('[data-testid="convert-button"]').click();
        await expect
          .poll(
            () =>
              page!.evaluate(
                () => window.__WITHIN_TEST__?.getState().jobState,
              ),
            { timeout: 90_000 },
          )
          .toBe("complete");
        const state = await page!.evaluate(
          () => window.__WITHIN_TEST__!.getState(),
        );
        expect(state.error).toBeNull();
        expect(state.opfsName).toBeTruthy();
        expect(state.metrics?.pendingOperations).toBe(0);
        expect(state.metrics?.queuedBytes).toBe(0);
        expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
        expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
        expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
        if (profileId === "mkv-to-mp4") {
          await page!.screenshot({
            path: path.join(
              artifactRoot,
              `${target.id}-${targetHeaded ? "headed" : "headless"}-complete.png`,
            ),
            fullPage: true,
          });
        }
        await copyAndDeleteOutput(state.opfsName!, outputPath);
        const outputStats = await stat(outputPath);
        routeResults.push({
          profileId,
          inputBytes: (await stat(fixturePath)).size,
          outputBytes: outputStats.size,
          outputSha256: await sha256File(outputPath),
          elapsedMs: state.metrics!.elapsedMs,
          maxReadChunkBytes: state.metrics!.maxReadChunkBytes,
          maxWriteChunkBytes: state.metrics!.maxWriteChunkBytes,
          peakQueuedBytes: state.metrics!.peakQueuedBytes,
          peakPendingOperations: state.metrics!.peakPendingOperations,
          validator: await validator(outputPath),
        });
        await rm(outputPath, { force: true });
      };

      await convert(
        "csv-to-tsv",
        "fixtures/data/sample.csv",
        "sample.tsv",
        async (outputPath) => {
          const text = await readFile(outputPath, "utf8");
          expect(text).toBe(expectedTsv);
          return "exact UTF-8 TSV bytes and quoting semantics";
        },
      );
      await convert(
        "txt-to-docx",
        "fixtures/documents/sample.txt",
        "sample.docx",
        validateDocx,
      );
      await convert(
        "tar-to-zip",
        "fixtures/archives/sample.tar",
        "sample.zip",
        validateZip,
      );
      await convert(
        "png-to-webp",
        "fixtures/images/test-pattern.png",
        "test-pattern.webp",
        async (outputPath) => {
          const sourcePath = path.join(
            projectRoot,
            "fixtures",
            "images",
            "test-pattern.png",
          );
          const probe = await ffprobe(outputPath);
          expect(probe.streams).toMatchObject([
            { codec_name: "webp", codec_type: "video", width: 1024, height: 768 },
          ]);
          await decodeWithFfmpeg(outputPath);
          const similarity = await imageSsim(sourcePath, outputPath);
          expect(similarity).toBeGreaterThanOrEqual(0.9);
          return `FFprobe codec/dimensions, full decode, and SSIM ${similarity.toFixed(6)}`;
        },
      );
      await convert(
        "mkv-to-mp4",
        "fixtures/media/remux-source.mkv",
        "remux-output.mp4",
        async (outputPath) => {
          const sourcePath = path.join(
            projectRoot,
            "fixtures",
            "media",
            "remux-source.mkv",
          );
          const probe = await ffprobe(outputPath);
          expect(probe.streams.map((stream) => stream.codec_name)).toEqual([
            "h264",
            "aac",
          ]);
          expect(Number(probe.format?.duration)).toBeGreaterThan(3.9);
          expect(Number(probe.format?.duration)).toBeLessThan(4.2);
          expect(await packetHash(outputPath, "v:0")).toBe(
            await packetHash(sourcePath, "v:0"),
          );
          expect(await packetHash(outputPath, "a:0")).toBe(
            await packetHash(sourcePath, "a:0"),
          );
          await decodeWithFfmpeg(outputPath);
          return "FFprobe structure, exact H.264/AAC packet hashes, and full decode";
        },
      );

      await navigate("/");
      await expect(
        page.getByRole("heading", { name: "Big files. Small memory." }),
      ).toBeVisible();
      await page
        .locator('[data-testid="file-input"]')
        .setInputFiles(path.join(projectRoot, "fixtures", "data", "sample.csv"));
      await page.locator('[data-testid="format-select"]').selectOption("csv-to-tsv");
      await page
        .getByRole("button", { name: /Choose destination file/ })
        .click();
      await expect(page.getByRole("button", { name: /sample\.tsv/ })).toBeVisible();
      await page.locator('[data-testid="convert-button"]').click();
      await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
        /Convert again/,
        { timeout: 45_000 },
      );
      const directOutputPath = path.join(outputRoot, "direct-sample.tsv");
      await copyAndDeleteOutput("sample.tsv", directOutputPath);
      const directText = await readFile(directOutputPath, "utf8");
      expect(directText).toBe(expectedTsv);
      const directDestination = {
        profileId: "csv-to-tsv",
        outputBytes: (await stat(directOutputPath)).size,
        outputSha256: await sha256File(directOutputPath),
        validator: "normal-page selected destination plus exact TSV bytes",
      };
      await rm(directOutputPath, { force: true });

      await openApp();
      await page
        .locator('[data-testid="file-input"]')
        .setInputFiles(path.join(projectRoot, "fixtures", "archives", "unsafe-entry.tar"));
      await page.locator('[data-testid="format-select"]').selectOption("tar-to-zip");
      await page.locator('[data-testid="convert-button"]').click();
      await expect
        .poll(
          () =>
            page!.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
          { timeout: 30_000 },
        )
        .toBe("error");
      const failureState = await page.evaluate(
        () => window.__WITHIN_TEST__!.getState(),
      );
      expect(failureState.error?.toLowerCase()).toContain("unsafe tar entry");
      expect(failureState.opfsName).toBeNull();
      const leftoverOutputNames = await appOutputNames(page);
      expect(leftoverOutputNames).toEqual([]);

      const privateTokens = [
        "sample.csv",
        "sample.txt",
        "sample.tar",
        "test-pattern.png",
        "remux-source.mkv",
        "comma, quote",
        "unicode survives",
        "within keeps files on this device",
      ];
      for (const request of observedRequests) {
        expect(new URL(request.url).origin).toBe(expectedOrigin);
        expect(request.method).toBe("GET");
        expect(request.body).toBeNull();
      }
      const privateTokensObserved = privateTokens.filter((token) =>
        observedRequests.some((request) =>
          `${request.url}\n${request.body ?? ""}`
            .toLowerCase()
            .includes(token.toLowerCase()),
        ),
      );
      expect(privateTokensObserved).toEqual([]);
      expect(diagnostics).toEqual([]);

      const result: CompatibilityResult = {
        browser: target.name,
        browserId: target.id,
        executable: target.executable,
        userAgent: capabilityState.userAgent,
        headed: targetHeaded,
        crossOriginIsolated: capabilityState.crossOriginIsolated,
        capabilities: capabilityState.capabilities as unknown as Record<
          string,
          unknown
        >,
        routes: routeResults,
        directDestination,
        failureRecovery: {
          profileId: "tar-to-zip",
          error: failureState.error!,
          leftoverOutputNames,
        },
        network: {
          requestCount: observedRequests.length,
          methods: [...new Set(observedRequests.map((request) => request.method))],
          origins: [
            ...new Set(
              observedRequests.map((request) => new URL(request.url).origin),
            ),
          ],
          requestBodies: observedRequests.filter((request) => request.body !== null)
            .length,
          privateTokensObserved,
        },
        diagnostics,
        durationMs: Date.now() - started,
      };
      await writeFile(
        path.join(artifactRoot, `${target.id}.json`),
        `${JSON.stringify(result, null, 2)}\n`,
        "utf8",
      );
    } finally {
      (validationSink as WriteStream | null)?.destroy();
      validationSink = null;
      await context?.setOffline(false).catch(() => {});
      await context?.close().catch(() => {});
      await rm(outputRoot, { recursive: true, force: true });
      await rm(profileRoot, { recursive: true, force: true });
    }
  });
}

declare global {
  interface Window {
    __withinCompatibilityValidationChunk(base64: string): Promise<void>;
  }
}
