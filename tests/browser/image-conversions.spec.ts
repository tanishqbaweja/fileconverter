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
  ["png-to-ico", "test-pattern.png", "ico", "png", undefined, 256, 192],
  ["jpeg-to-ico", "test-pattern.jpg", "ico", "png", undefined, 256, 192],
  ["webp-to-ico", "test-pattern.webp", "ico", "png", undefined, 256, 192],
  ["gif-to-ico", "animated-pattern.gif", "ico", "png", undefined, 256, 192],
  ["avif-to-ico", "test-pattern.avif", "ico", "png", undefined, 256, 192],
  ["bmp-to-ico", "test-pattern.bmp", "ico", "png", undefined, 256, 192],
  ["png-to-webp", "transparent-pattern.png", "webp", "webp", "preserved"],
  ["png-to-jpeg", "transparent-pattern.png", "jpg", "mjpeg", "removed"],
  ["png-to-bmp", "transparent-pattern.png", "bmp", "bmp", "removed"],
  ["png-to-ico", "transparent-pattern.png", "ico", "png", "preserved", 256, 192],
  ["tiff-to-png", "test-pattern-deflate.tiff", "png", "png"],
  ["tiff-to-png", "test-pattern-gray-packbits.tiff", "png", "png", undefined, 320, 240],
  ["tiff-to-png", "test-pattern-rgba-lzw.tiff", "png", "png", "preserved", 320, 240, 100],
  ["tiff-to-png", "test-pattern-palette.tiff", "png", "png", undefined, 320, 240],
  ["tiff-to-png", "test-pattern-tiled.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-tiled-reference.png"],
  ["tiff-to-png", "test-pattern-gray16-deflate.tiff", "png", "png", undefined, 127, 95, 100, "gray16be", "test-pattern-gray16-deflate.tiff", "gray16le"],
  ["tiff-to-png", "test-pattern-rgb16.tiff", "png", "png", undefined, 127, 95, 1_000, "rgb48be", "test-pattern-rgb16.tiff", "rgb48le"],
  ["tiff-to-png", "test-pattern-rgba16.tiff", "png", "png", "preserved", 127, 95, 1_000, "rgba64be", "test-pattern-rgba16.tiff", "rgba64le"],
  ["tiff-to-png", "test-pattern-jpeg.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-jpeg-reference.png"],
  ["tiff-to-png", "test-pattern-orientation2.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-orientation2-reference.png"],
  ["tiff-to-png", "test-pattern-orientation3.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-orientation3-reference.png"],
  ["tiff-to-png", "test-pattern-orientation4.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-orientation4-reference.png"],
  ["tiff-to-png", "test-pattern-planar.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-planar-reference.png"],
  ["tiff-to-png", "test-pattern-planar-tiled.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-planar-tiled-reference.png"],
  ["svg-to-png", "test-pattern.svg", "png", "png", undefined, 640, 480],
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
  expectedWidth = 1024,
  expectedHeight = 768,
  minimumOutputBytes = 1_000,
  expectedPixelFormat,
  referenceName,
  referencePixelFormat = "rgb24",
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
      if (extension === "ico") {
        expect(state?.warnings.join(" ")).toContain("scaled to 256\u00d7192");
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

      expect((await stat(outputPath)).size).toBeGreaterThan(minimumOutputBytes);
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
      expect(stream.width).toBe(expectedWidth);
      expect(stream.height).toBe(expectedHeight);
      if (alphaExpectation === "preserved") {
        expect(stream.pix_fmt).toContain("a");
      } else if (alphaExpectation === "removed") {
        expect(stream.pix_fmt).not.toContain("a");
      }
      if (expectedPixelFormat) {
        expect(stream.pix_fmt).toBe(expectedPixelFormat);
      }
      await execFileAsync(
        "ffmpeg",
        ["-v", "error", "-i", outputPath, "-f", "null", "NUL"],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      );
      if (referenceName) {
        const frameBytes = async (imagePath: string) => {
          const result = await execFileAsync(
              "ffmpeg",
              [
                "-v",
                "error",
                "-i",
                imagePath,
                "-pix_fmt",
                referencePixelFormat,
                "-f",
                "rawvideo",
                "-",
              ],
              {
                cwd: projectRoot,
                windowsHide: true,
                maxBuffer: 8 * 1024 * 1024,
                encoding: "buffer",
              },
            );
          return result.stdout;
        };
        expect(await frameBytes(outputPath)).toEqual(
          await frameBytes(path.join(projectRoot, "fixtures", "images", referenceName)),
        );
      }
    } finally {
      validationSink?.destroy();
      validationSink = null;
      await rm(outputPath, { force: true });
    }
  });
}

test("ICO output failure removes the partial browser-owned file", async () => {
  await page.goto("/?test=1&fault=write");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "test-pattern.png"),
  );
  await page
    .locator('[data-testid="format-select"]')
    .selectOption("png-to-ico");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("error");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.error?.toLowerCase()).toContain(
    "destination rejected a bounded write",
  );
  expect(state?.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-png-to-ico")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("TIFF output failure removes the partial browser-owned file", async () => {
  await page.goto("/?test=1&fault=write");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "test-pattern-deflate.tiff"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("tiff-to-png");
  await page.locator('[data-testid="convert-button"]').click();
  await expect.poll(
    async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
    { timeout: 30_000 },
  ).toBe("error");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.error?.toLowerCase()).toContain("destination rejected a bounded write");
  expect(state?.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-tiff-to-png")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("SVG output failure removes the partial browser-owned file", async () => {
  await page.goto("/?test=1&fault=write");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "test-pattern.svg"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("svg-to-png");
  await page.locator('[data-testid="convert-button"]').click();
  await expect.poll(
    async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
    { timeout: 30_000 },
  ).toBe("error");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.error?.toLowerCase()).toContain("destination rejected a bounded write");
  expect(state?.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-svg-to-png")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("SVG converts through the bounded direct-save worker", async () => {
  const outputName = "test-pattern.png";
  await page.goto("/?test=1&directory=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(name).catch(() => {});
  }, outputName);
  try {
    await page.locator('[data-testid="file-input"]').setInputFiles(
      path.join(projectRoot, "fixtures", "images", "test-pattern.svg"),
    );
    await page.locator('[data-testid="format-select"]').selectOption("svg-to-png");
    await page.locator('[data-testid="convert-button"]').click();
    await expect.poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    ).toBe("complete");
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    expect(state?.batchOutputNames).toEqual([outputName]);
    expect(state?.opfsName).toBeNull();
    expect(state?.metrics?.peakPendingOperations).toBe(1);
    expect(state?.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state?.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    const output = await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(name);
      const file = await handle.getFile();
      const signature = Array.from(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
      await root.removeEntry(name);
      return { bytes: file.size, signature };
    }, outputName);
    expect(output.bytes).toBeGreaterThan(1_000);
    expect(output.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name).catch(() => {});
    }, outputName).catch(() => {});
  }
});

test("TIFF converts through the bounded direct-save worker", async () => {
  const outputName = "test-pattern-deflate.png";
  await page.goto("/?test=1&directory=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(name).catch(() => {});
  }, outputName);
  try {
    await page.locator('[data-testid="file-input"]').setInputFiles(
      path.join(projectRoot, "fixtures", "images", "test-pattern-deflate.tiff"),
    );
    await page.locator('[data-testid="format-select"]').selectOption("tiff-to-png");
    await page.locator('[data-testid="convert-button"]').click();
    await expect.poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    ).toBe("complete");
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    expect(state?.batchOutputNames).toEqual([outputName]);
    expect(state?.opfsName).toBeNull();
    expect(state?.metrics?.peakPendingOperations).toBe(1);
    expect(state?.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state?.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(64 * 1024);
    expect(state?.metrics?.peakWasmMemoryBytes).toBe(40 * 1024 * 1024);
    const output = await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(name);
      const file = await handle.getFile();
      const signature = Array.from(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
      await root.removeEntry(name);
      return { bytes: file.size, signature };
    }, outputName);
    expect(output.bytes).toBeGreaterThan(100);
    expect(output.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name).catch(() => {});
    }, outputName);
  }
});

for (const [sourceName, expectedError] of [
  ["unsupported-orientation5.tiff", "non-transposed orientation"],
  ["unsupported-multipage.tiff", "Multipage TIFF"],
  ["decompression-bomb.tiff", "16-megapixel safety limit"],
  ["truncated.tiff", "TIFF"],
  ["corrupt.tiff", "TIFF"],
] as const) {
  test(`rejects unsafe or unsupported TIFF input ${sourceName} without output`, async () => {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(
      path.join(projectRoot, "fixtures", "images", sourceName),
    );
    await page.locator('[data-testid="format-select"]').selectOption("tiff-to-png");
    await page.locator('[data-testid="convert-button"]').click();
    await expect.poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    ).toBe("error");
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    expect(state?.error).toContain(expectedError);
    expect(state?.metrics?.outputBytes).toBe(0);
    expect(state?.opfsName).toBeNull();
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

for (const [sourceName, expectedError] of [
  ["unsafe-external.svg", "external-resource"],
  ["oversized.svg", "8-megapixel"],
] as const) {
  test(`rejects unsafe SVG input ${sourceName} before rasterization`, async () => {
    const externalRequests: string[] = [];
    const observe = (request: { url(): string }) => {
      if (request.url().includes("example.invalid")) {
        externalRequests.push(request.url());
      }
    };
    page.on("request", observe);
    try {
      await page.goto("/?test=1");
      await page.waitForFunction(
        () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
      );
      await page.locator('[data-testid="file-input"]').setInputFiles(
        path.join(projectRoot, "fixtures", "images", sourceName),
      );
      await page.locator('[data-testid="format-select"]').selectOption("svg-to-png");
      await page.locator('[data-testid="convert-button"]').click();
      await expect.poll(
        async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
        { timeout: 30_000 },
      ).toBe("error");
      const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
      expect(state?.error).toContain(expectedError);
      expect(state?.metrics?.outputBytes).toBe(0);
      expect(state?.opfsName).toBeNull();
      expect(externalRequests).toEqual([]);
    } finally {
      page.off("request", observe);
    }
  });
}

declare global {
  interface Window {
    __withinImageValidationChunk(base64: string): Promise<void>;
  }
}
