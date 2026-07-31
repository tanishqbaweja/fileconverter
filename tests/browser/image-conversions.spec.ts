import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const testPort = process.env.WITHIN_TEST_PORT ?? "3000";
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const profileRoot = path.join(projectRoot, "work", "playwright-profile-images");
const outputRoot = path.join(projectRoot, "outputs", "browser-image-smoke");
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath =
  process.env.WITHIN_CHROME_PATH ??
  (existsSync(installedChromePath)
    ? installedChromePath
    : chromium.executablePath());

const routes = [
  ["png-to-jpeg", "test-pattern.png", "jpg", "mjpeg"],
  ["png-to-webp", "test-pattern.png", "webp", "webp"],
  ["jpeg-to-png", "test-pattern.jpg", "png", "png"],
  ["jpeg-to-webp", "test-pattern.jpg", "webp", "webp"],
  ["webp-to-png", "test-pattern.webp", "png", "png"],
  ["webp-to-jpeg", "test-pattern.webp", "jpg", "mjpeg"],
  ["gif-to-png", "animated-pattern.gif", "png", "png"],
  ["gif-to-jpeg", "animated-pattern.gif", "jpg", "mjpeg"],
  ["gif-to-webp", "animated-pattern.gif", "webp", "webp"],
  ["avif-to-png", "test-pattern.avif", "png", "png"],
  ["avif-to-jpeg", "test-pattern.avif", "jpg", "mjpeg"],
  ["avif-to-webp", "test-pattern.avif", "webp", "webp"],
  ["bmp-to-png", "test-pattern.bmp", "png", "png"],
  ["bmp-to-jpeg", "test-pattern.bmp", "jpg", "mjpeg"],
  ["bmp-to-webp", "test-pattern.bmp", "webp", "webp"],
  ["png-to-bmp", "test-pattern.png", "bmp", "bmp"],
  ["jpeg-to-bmp", "test-pattern.jpg", "bmp", "bmp"],
  ["webp-to-bmp", "test-pattern.webp", "bmp", "bmp"],
  ["gif-to-bmp", "animated-pattern.gif", "bmp", "bmp"],
  ["avif-to-bmp", "test-pattern.avif", "bmp", "bmp"],
  ["png-to-webp", "transparent-pattern.png", "webp", "webp", "preserved"],
  ["png-to-jpeg", "transparent-pattern.png", "jpg", "mjpeg", "removed"],
  ["png-to-bmp", "transparent-pattern.png", "bmp", "bmp", "removed"],
] as const;

let context: BrowserContext;
let page: Page;
let validationSink: WriteStream | null = null;

function assertProjectLocal(target: string): void {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing a non-project test path: ${target}`);
  }
}

test.beforeAll(async () => {
  assertProjectLocal(profileRoot);
  assertProjectLocal(outputRoot);
  await rm(profileRoot, { recursive: true, force: true });
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(profileRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
    acceptDownloads: false,
    baseURL,
  });
  page = context.pages()[0] ?? (await context.newPage());
  await page.exposeBinding(
    "__withinImageValidationChunk",
    async (_source, base64: string) => {
      if (!validationSink) {
        throw new Error("The project-local image validation sink is not open.");
      }
      if (!validationSink.write(Buffer.from(base64, "base64"))) {
        await once(validationSink, "drain");
      }
    },
  );
});

test.afterAll(async () => {
  validationSink?.destroy();
  validationSink = null;
  await context?.close();
  await rm(outputRoot, { recursive: true, force: true });
  await rm(profileRoot, { recursive: true, force: true });
});

for (const [
  profileId,
  sourceName,
  extension,
  expectedCodec,
  alphaExpectation,
] of routes) {
  test(`${profileId} from ${sourceName} produces a bounded independently decodable image`, async () => {
    const sourcePath = path.join(
      projectRoot,
      "fixtures",
      "images",
      sourceName,
    );
    const outputPath = path.join(outputRoot, `${profileId}.${extension}`);
    assertProjectLocal(outputPath);
    try {
      await page.goto("/?test=1");
      await page.waitForFunction(
        () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
      );
      await page.locator('[data-testid="file-input"]').setInputFiles(sourcePath);
      await page
        .locator('[data-testid="format-select"]')
        .selectOption(profileId);
      await page.locator('[data-testid="convert-button"]').click();
      await expect
        .poll(
          async () =>
            page.evaluate(
              () => window.__WITHIN_TEST__?.getState().jobState,
            ),
          { timeout: 45_000 },
        )
        .not.toBe("running");
      const state = await page.evaluate(() =>
        window.__WITHIN_TEST__?.getState(),
      );
      expect(state?.jobState, state?.error ?? state?.phase).toBe("complete");
      expect(state?.opfsName).toBeTruthy();
      expect(state?.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(
        256 * 1024,
      );
      expect(state?.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
      if (sourceName.endsWith(".gif")) {
        expect(state?.warnings).toContain(
          "This still-image route converts only the first animation frame.",
        );
      }
      if (alphaExpectation === "removed") {
        expect(state?.warnings.join(" ")).toContain("transparent pixels");
      }

      validationSink = createWriteStream(outputPath, { flags: "w" });
      await page.evaluate(async (opfsName) => {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(opfsName!);
        const reader = (await handle.getFile()).stream().getReader();
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
            await window.__withinImageValidationChunk(btoa(binary));
          }
        }
        await root.removeEntry(opfsName!);
      }, state!.opfsName);
      validationSink.end();
      await once(validationSink, "finish");
      validationSink = null;

      expect((await stat(outputPath)).size).toBeGreaterThan(1_000);
      const { stdout } = await execFileAsync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          outputPath,
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      );
      const stream = JSON.parse(stdout).streams[0];
      expect(stream.codec_name).toBe(expectedCodec);
      expect(stream.width).toBe(1024);
      expect(stream.height).toBe(768);
      if (alphaExpectation === "preserved") {
        expect(stream.pix_fmt).toContain("a");
      } else if (alphaExpectation === "removed") {
        expect(stream.pix_fmt).not.toContain("a");
      }
      await execFileAsync(
        "ffmpeg",
        ["-v", "error", "-i", outputPath, "-f", "null", "NUL"],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      );
    } finally {
      validationSink?.destroy();
      validationSink = null;
      await rm(outputPath, { force: true });
    }
  });
}

test("rejects an image decompression bomb before allocating a decoded surface", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(
      projectRoot,
      "fixtures",
      "images",
      "decompression-stress.png",
    ),
  );
  await page
    .locator('[data-testid="format-select"]')
    .selectOption("png-to-jpeg");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("error");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.error).toContain("decompression ratio");
  expect(state?.metrics?.outputBytes).toBe(0);
});

declare global {
  interface Window {
    __withinImageValidationChunk(base64: string): Promise<void>;
  }
}
