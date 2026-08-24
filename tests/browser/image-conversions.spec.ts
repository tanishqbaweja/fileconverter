import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
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
  ["webp-to-png", "animated-pattern.webp", "png", "png", undefined, 1024, 768, 1_000, undefined, "animated-pattern-first-frame-reference.png"],
  ["webp-to-jpeg", "animated-pattern.webp", "jpg", "mjpeg"],
  ["gif-to-png", "animated-pattern.gif", "png", "png"],
  ["gif-to-jpeg", "animated-pattern.gif", "jpg", "mjpeg"],
  ["gif-to-webp", "animated-pattern.gif", "webp", "webp"],
  ["avif-to-png", "test-pattern.avif", "png", "png"],
  ["avif-to-jpeg", "test-pattern.avif", "jpg", "mjpeg"],
  ["avif-to-webp", "test-pattern.avif", "webp", "webp"],
  ["avif-to-png", "animated-pattern.avif", "png", "png", undefined, 512, 384],
  ["avif-to-jpeg", "animated-pattern.avif", "jpg", "mjpeg", undefined, 512, 384],
  ["avif-to-webp", "animated-pattern.avif", "webp", "webp", undefined, 512, 384],
  ["bmp-to-png", "test-pattern.bmp", "png", "png"],
  ["bmp-to-jpeg", "test-pattern.bmp", "jpg", "mjpeg"],
  ["bmp-to-webp", "test-pattern.bmp", "webp", "webp"],
  ["png-to-bmp", "test-pattern.png", "bmp", "bmp"],
  ["jpeg-to-bmp", "test-pattern.jpg", "bmp", "bmp"],
  ["webp-to-bmp", "test-pattern.webp", "bmp", "bmp"],
  ["webp-to-bmp", "animated-pattern.webp", "bmp", "bmp"],
  ["gif-to-bmp", "animated-pattern.gif", "bmp", "bmp"],
  ["avif-to-bmp", "test-pattern.avif", "bmp", "bmp"],
  ["avif-to-bmp", "animated-pattern.avif", "bmp", "bmp", undefined, 512, 384],
  ["png-to-ico", "test-pattern.png", "ico", "png", undefined, 256, 192],
  ["jpeg-to-ico", "test-pattern.jpg", "ico", "png", undefined, 256, 192],
  ["webp-to-ico", "test-pattern.webp", "ico", "png", undefined, 256, 192],
  ["webp-to-ico", "animated-pattern.webp", "ico", "png", undefined, 256, 192],
  ["gif-to-ico", "animated-pattern.gif", "ico", "png", undefined, 256, 192],
  ["avif-to-ico", "test-pattern.avif", "ico", "png", undefined, 256, 192],
  ["avif-to-ico", "animated-pattern.avif", "ico", "png", undefined, 256, 192],
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
  ["tiff-to-png", "test-pattern-orientation5.tiff", "png", "png", undefined, 95, 127, 1_000, undefined, "test-pattern-orientation5-reference.png"],
  ["tiff-to-png", "test-pattern-orientation6.tiff", "png", "png", undefined, 95, 127, 1_000, undefined, "test-pattern-orientation6-reference.png"],
  ["tiff-to-png", "test-pattern-orientation7.tiff", "png", "png", undefined, 95, 127, 1_000, undefined, "test-pattern-orientation7-reference.png"],
  ["tiff-to-png", "test-pattern-orientation8.tiff", "png", "png", undefined, 95, 127, 1_000, undefined, "test-pattern-orientation8-reference.png"],
  ["tiff-to-png", "test-pattern-planar.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-planar-reference.png"],
  ["tiff-to-png", "test-pattern-planar-tiled.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-planar-tiled-reference.png"],
  ["tiff-to-png", "test-pattern-multipage.tiff", "png", "png", undefined, 127, 95, 1_000, undefined, "test-pattern-multipage-first-page-reference.png"],
  ["jxl-to-png", "test-pattern.jxl", "png", "png", undefined, 1024, 768, 1_000, "rgb24", "test-pattern.png", "rgb24"],
  ["jxl-to-png", "transparent-pattern.jxl", "png", "png", "preserved", 1024, 768, 100, "rgba", "transparent-pattern.png", "rgba"],
  ["jxl-to-png", "test-pattern-gray16.jxl", "png", "png", undefined, 127, 95, 100, "gray16be", "test-pattern-gray16-deflate.tiff", "gray16le"],
  ["jxl-to-png", "highres-pattern.jxl", "png", "png", undefined, 3840, 2160, 100_000, "rgb24", "highres-pattern.png", "rgb24"],
  ["svg-to-png", "test-pattern.svg", "png", "png", undefined, 640, 480],
  ["svg-to-png", "test-pattern-effects.svg", "png", "png", undefined, 960, 540, 1_000, undefined, "test-pattern-effects-reference.png", "rgb24", 0.9],
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

async function copyAndDeleteBrowserOutput(
  opfsName: string,
  outputPath: string,
): Promise<void> {
  validationSink = createWriteStream(outputPath, { flags: "w" });
  try {
    await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(name);
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
      } finally {
        await root.removeEntry(name).catch(() => {});
      }
    }, opfsName);
    validationSink.end();
    await once(validationSink, "finish");
  } finally {
    validationSink?.destroy();
    validationSink = null;
  }
}

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
  minimumReferenceSsim,
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
      if (
        sourceName.endsWith(".gif") ||
        sourceName === "animated-pattern.webp" ||
        sourceName === "animated-pattern.avif"
      ) {
        expect(state?.warnings).toContain(
          "This still-image route converts only the first animation frame.",
        );
      }
      if (sourceName === "test-pattern-multipage.tiff") {
        expect(state?.warnings).toContain(
          "This TIFF contains multiple pages; only the first page was converted.",
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
        const referencePath = path.join(
          projectRoot,
          "fixtures",
          "images",
          referenceName,
        );
        if (minimumReferenceSsim != null) {
          const { stderr } = await execFileAsync(
            "ffmpeg",
            [
              "-v",
              "info",
              "-i",
              referencePath,
              "-i",
              outputPath,
              "-lavfi",
              "[0:v:0]format=rgb24[reference];[1:v:0]format=rgb24[converted];[reference][converted]ssim",
              "-f",
              "null",
              "NUL",
            ],
            {
              cwd: projectRoot,
              windowsHide: true,
              maxBuffer: 8 * 1024 * 1024,
            },
          );
          const similarity = Number.parseFloat(
            stderr.match(/SSIM[^\r\n]*All:([0-9.]+)/)?.[1] ?? "",
          );
          expect(similarity).toBeGreaterThanOrEqual(minimumReferenceSsim);
        } else {
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
                maxBuffer: 32 * 1024 * 1024,
                encoding: "buffer",
              },
            );
            return result.stdout;
          };
          expect(await frameBytes(outputPath)).toEqual(
            await frameBytes(referencePath),
          );
        }
      }
    } finally {
      validationSink?.destroy();
      validationSink = null;
      await rm(outputPath, { force: true });
    }
  });
}

for (const route of [
  {
    profileId: "png-to-zip",
    sourceName: "animated-pattern.apng",
    sourceFormat: "png",
    width: 1024,
    height: 768,
    referenceName: "animated-pattern-first-frame-reference.png",
    minimumReferenceSsim: undefined,
  },
  {
    profileId: "gif-to-zip",
    sourceName: "animated-pattern.gif",
    sourceFormat: "gif",
    width: 1024,
    height: 768,
    referenceName: "animated-pattern-first-frame-reference.png",
    minimumReferenceSsim: undefined,
  },
  {
    profileId: "webp-to-zip",
    sourceName: "animated-pattern.webp",
    sourceFormat: "webp",
    width: 1024,
    height: 768,
    referenceName: "animated-pattern-first-frame-reference.png",
    minimumReferenceSsim: undefined,
  },
  {
    profileId: "avif-to-zip",
    sourceName: "animated-pattern.avif",
    sourceFormat: "avif",
    width: 512,
    height: 384,
    referenceName: "animated-avif-first-frame-reference.png",
    minimumReferenceSsim: 0.97,
  },
  {
    profileId: "jxl-to-zip",
    sourceName: "animated-pattern.jxl",
    sourceFormat: "jxl",
    width: 1024,
    height: 768,
    referenceName: "animated-pattern-first-frame-reference.png",
    minimumReferenceSsim: undefined,
  },
] as const) {
  test(`${route.profileId} archives every frame with bounded timing metadata`, async () => {
    const sourcePath = path.join(
      projectRoot,
      "fixtures",
      "images",
      route.sourceName,
    );
    const outputPath = path.join(outputRoot, `${route.profileId}.zip`);
    const extractRoot = path.join(outputRoot, `${route.profileId}-entries`);
    assertProjectLocal(outputPath);
    assertProjectLocal(extractRoot);
    try {
      await page.goto("/?test=1");
      await page.waitForFunction(
        () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
      );
      await page.locator('[data-testid="file-input"]').setInputFiles(sourcePath);
      await page
        .locator('[data-testid="format-select"]')
        .selectOption(route.profileId);
      await page.locator('[data-testid="convert-button"]').click();
      await expect
        .poll(
          async () =>
            page.evaluate(
              () => window.__WITHIN_TEST__?.getState().jobState,
            ),
          { timeout: 60_000 },
        )
        .not.toBe("running");
      const state = await page.evaluate(() =>
        window.__WITHIN_TEST__?.getState(),
      );
      expect(state?.jobState, state?.error ?? state?.phase).toBe("complete");
      expect(state?.warnings).toEqual([]);
      expect(state?.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state?.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state?.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
      expect(state?.metrics?.pendingOperations).toBe(0);
      expect(state?.metrics?.queuedBytes).toBe(0);
      await copyAndDeleteBrowserOutput(state!.opfsName!, outputPath);

      await mkdir(extractRoot, { recursive: true });
      const { stdout: listing } = await execFileAsync(
        "tar",
        ["-tf", outputPath],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      const expectedNames = [
        ...Array.from(
          { length: 8 },
          (_, index) => `frame-${String(index + 1).padStart(4, "0")}.png`,
        ),
        "animation.json",
      ];
      expect(listing.trim().split(/\r?\n/)).toEqual(expectedNames);
      await execFileAsync(
        "tar",
        ["-xf", outputPath, "-C", extractRoot],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      expect((await readdir(extractRoot)).sort()).toEqual(
        [...expectedNames].sort(),
      );
      const manifest = JSON.parse(
        await readFile(path.join(extractRoot, "animation.json"), "utf8"),
      ) as {
        schema: string;
        sourceFormat: string;
        frameCount: number;
        aggregateDecodedBytes?: number;
        jpegXlLoopCount?: number | string;
        ticksPerSecond?: { numerator: number; denominator: number };
        frames: Array<{
          file: string;
          index: number;
          width: number;
          height: number;
          timestampMicros: number;
          durationMicros: number | null;
        }>;
      };
      expect(manifest.schema).toBe("within-animation-frames-v1");
      expect(manifest.sourceFormat).toBe(route.sourceFormat);
      expect(manifest.frameCount).toBe(8);
      expect(manifest.frames.map((frame) => frame.file)).toEqual(
        expectedNames.slice(0, 8),
      );
      for (let index = 0; index < manifest.frames.length; index += 1) {
        const frameRecord = manifest.frames[index];
        expect(frameRecord.index).toBe(index);
        expect(frameRecord.width).toBe(route.width);
        expect(frameRecord.height).toBe(route.height);
        if (index > 0) {
          expect(frameRecord.timestampMicros).toBeGreaterThan(
            manifest.frames[index - 1].timestampMicros,
          );
        }
        expect(frameRecord.durationMicros).toBeGreaterThan(0);
        const framePath = path.join(extractRoot, frameRecord.file);
        const { stdout } = await execFileAsync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,width,height",
            "-of",
            "json",
            framePath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
        );
        expect(JSON.parse(stdout).streams[0]).toMatchObject({
          codec_name: "png",
          width: route.width,
          height: route.height,
        });
      }
      const frameHashes = await Promise.all(
        expectedNames.slice(0, 8).map(async (name) =>
          createHash("sha256")
            .update(await readFile(path.join(extractRoot, name)))
            .digest("hex"),
        ),
      );
      expect(new Set(frameHashes).size).toBeGreaterThan(1);

      const rawPixels = async (
        imagePath: string,
        frameIndex = 0,
      ): Promise<Buffer> => {
        const result = await execFileAsync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            imagePath,
            "-vf",
            `select=eq(n\\,${frameIndex})`,
            "-fps_mode",
            "vfr",
            "-frames:v",
            "1",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "-",
          ],
          {
            cwd: projectRoot,
            windowsHide: true,
            maxBuffer: 32 * 1024 * 1024,
            encoding: "buffer",
          },
        );
        return result.stdout;
      };
      const firstFramePath = path.join(extractRoot, expectedNames[0]);
      const referencePath = path.join(
        projectRoot,
        "fixtures",
        "images",
        route.referenceName,
      );
      const measureSsim = async (
        expectedPath: string,
        actualPath: string,
      ): Promise<number> => {
        const { stderr } = await execFileAsync(
          "ffmpeg",
          [
            "-v",
            "info",
            "-i",
            expectedPath,
            "-i",
            actualPath,
            "-lavfi",
            "[0:v:0]format=rgb24[reference];[1:v:0]format=rgb24[converted];[reference][converted]ssim",
            "-frames:v",
            "1",
            "-f",
            "null",
            "NUL",
          ],
          {
            cwd: projectRoot,
            windowsHide: true,
            maxBuffer: 8 * 1024 * 1024,
          },
        );
        return Number.parseFloat(
          stderr.match(/SSIM[^\r\n]*All:([0-9.]+)/)?.[1] ?? "",
        );
      };
      if (route.minimumReferenceSsim == null) {
        const firstFrameHash = createHash("sha256")
          .update(await rawPixels(firstFramePath))
          .digest("hex");
        const referenceHash = createHash("sha256")
          .update(await rawPixels(referencePath))
          .digest("hex");
        expect(firstFrameHash).toBe(referenceHash);
      } else {
        const similarity = await measureSsim(referencePath, firstFramePath);
        expect(similarity).toBeGreaterThanOrEqual(route.minimumReferenceSsim);
      }
      if (route.sourceFormat === "png") {
        for (let index = 0; index < 8; index += 1) {
          expect(manifest.frames[index].timestampMicros).toBe(index * 250_000);
          expect(manifest.frames[index].durationMicros).toBe(250_000);
          const archivedHash = createHash("sha256")
            .update(
              await rawPixels(
                path.join(extractRoot, expectedNames[index]),
              ),
            )
            .digest("hex");
          const nativeHash = createHash("sha256")
            .update(await rawPixels(sourcePath, index))
            .digest("hex");
          expect(archivedHash).toBe(nativeHash);
        }
      }
      if (route.sourceFormat === "avif") {
        expect(manifest.aggregateDecodedBytes).toBe(4_718_592);
        for (let index = 0; index < 8; index += 1) {
          expect(manifest.frames[index].timestampMicros).toBe(index * 250_000);
          expect(manifest.frames[index].durationMicros).toBe(250_000);
          const nativeFramePath = path.join(
            extractRoot,
            `native-avif-frame-${index + 1}.png`,
          );
          await execFileAsync(
            "ffmpeg",
            [
              "-v",
              "error",
              "-i",
              sourcePath,
              "-map",
              "0:v:1",
              "-vf",
              `select=eq(n\\,${index})`,
              "-fps_mode",
              "vfr",
              "-frames:v",
              "1",
              nativeFramePath,
            ],
            { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
          );
          const similarity = await measureSsim(
            nativeFramePath,
            path.join(extractRoot, expectedNames[index]),
          );
          expect(similarity, `frame ${index + 1}`).toBeGreaterThanOrEqual(0.97);
        }
      }
      if (route.sourceFormat === "jxl") {
        expect(manifest.aggregateDecodedBytes).toBe(25_165_824);
        expect(manifest.jpegXlLoopCount).toBe("infinite");
        expect(manifest.ticksPerSecond).toEqual({
          numerator: 100,
          denominator: 1,
        });
        for (let index = 0; index < 8; index += 1) {
          expect(manifest.frames[index].timestampMicros).toBe(index * 250_000);
          expect(manifest.frames[index].durationMicros).toBe(250_000);
          const archivedHash = createHash("sha256")
            .update(
              await rawPixels(
                path.join(extractRoot, expectedNames[index]),
              ),
            )
            .digest("hex");
          const sourceHash = createHash("sha256")
            .update(await rawPixels(sourcePath, index))
            .digest("hex");
          expect(archivedHash, `frame ${index + 1}`).toBe(sourceHash);
        }
      }
    } finally {
      validationSink?.destroy();
      validationSink = null;
      await rm(outputPath, { force: true });
      await rm(extractRoot, { recursive: true, force: true });
    }
  });
}

for (const route of [
  ["gif-to-apng", "animated-pattern.gif"],
  ["webp-to-apng", "animated-pattern.webp"],
] as const) {
  test(`${route[0]} writes every decoded frame to a bounded valid APNG`, async () => {
    const [profileId, sourceName] = route;
    const sourcePath = path.join(projectRoot, "fixtures", "images", sourceName);
    const outputPath = path.join(outputRoot, `${profileId}.apng`);
    assertProjectLocal(outputPath);
    try {
      await page.goto("/?test=1");
      await page.waitForFunction(
        () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
      );
      await page.locator('[data-testid="file-input"]').setInputFiles(sourcePath);
      await page.locator('[data-testid="format-select"]').selectOption(profileId);
      await page.locator('[data-testid="convert-button"]').click();
      await expect
        .poll(
          async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
          { timeout: 60_000 },
        )
        .not.toBe("running");
      const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
      expect(state?.jobState, state?.error ?? state?.phase).toBe("complete");
      expect(state?.warnings).toEqual([]);
      expect(state?.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state?.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(64 * 1024);
      expect(state?.metrics?.peakPendingOperations).toBe(1);
      expect(state?.metrics?.pendingOperations).toBe(0);
      expect(state?.metrics?.queuedBytes).toBe(0);
      expect(state?.metrics?.imageWorkingBytes).toBe(0);
      expect(state?.metrics?.maxImagePixelStripBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state?.metrics?.peakImageWorkingBytes).toBeLessThanOrEqual(512 * 1024);
      await copyAndDeleteBrowserOutput(state!.opfsName!, outputPath);

      const encoded = await readFile(outputPath);
      expect(encoded.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const chunks: Array<{ type: string; data: Buffer }> = [];
      let offset = 8;
      while (offset < encoded.byteLength) {
        expect(offset + 12).toBeLessThanOrEqual(encoded.byteLength);
        const length = encoded.readUInt32BE(offset);
        const type = encoded.toString("ascii", offset + 4, offset + 8);
        const end = offset + 12 + length;
        expect(end).toBeLessThanOrEqual(encoded.byteLength);
        chunks.push({ type, data: encoded.subarray(offset + 8, offset + 8 + length) });
        offset = end;
      }
      expect(offset).toBe(encoded.byteLength);
      expect(chunks[0].type).toBe("IHDR");
      expect(chunks[1].type).toBe("acTL");
      expect(chunks.at(-1)?.type).toBe("IEND");
      expect(chunks[1].data.readUInt32BE(0)).toBe(8);
      expect(chunks[1].data.readUInt32BE(4)).toBe(0);
      const frameControls = chunks.filter((chunk) => chunk.type === "fcTL");
      expect(frameControls).toHaveLength(8);
      for (const control of frameControls) {
        expect(control.data.readUInt32BE(4)).toBe(1024);
        expect(control.data.readUInt32BE(8)).toBe(768);
        expect(control.data.readUInt32BE(12)).toBe(0);
        expect(control.data.readUInt32BE(16)).toBe(0);
        expect(control.data.readUInt16BE(20)).toBe(1);
        expect(control.data.readUInt16BE(22)).toBe(4);
        expect(control.data[24]).toBe(0);
        expect(control.data[25]).toBe(0);
      }
      const sequenced = chunks.filter(
        (chunk) => chunk.type === "fcTL" || chunk.type === "fdAT",
      );
      expect(sequenced.map((chunk) => chunk.data.readUInt32BE(0))).toEqual(
        Array.from({ length: sequenced.length }, (_, index) => index),
      );
      expect(
        Math.max(
          ...chunks
            .filter((chunk) => chunk.type === "IDAT" || chunk.type === "fdAT")
            .map((chunk) => chunk.data.byteLength),
        ),
      ).toBeLessThanOrEqual(64 * 1024 - 12);

      const { stdout: probeOutput } = await execFileAsync(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_frames",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_name,width,height,nb_read_frames",
          "-show_entries",
          "frame=pts_time,duration_time",
          "-of",
          "json",
          outputPath,
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      const probe = JSON.parse(probeOutput) as {
        streams: Array<{
          codec_name: string;
          width: number;
          height: number;
          nb_read_frames: string;
        }>;
        frames: Array<{ pts_time: string; duration_time: string }>;
      };
      expect(probe.streams[0]).toMatchObject({
        codec_name: "apng",
        width: 1024,
        height: 768,
        nb_read_frames: "8",
      });
      expect(probe.frames).toHaveLength(8);
      for (let index = 0; index < probe.frames.length; index += 1) {
        expect(Number.parseFloat(probe.frames[index].pts_time)).toBeCloseTo(index * 0.25, 6);
        expect(Number.parseFloat(probe.frames[index].duration_time)).toBeCloseTo(0.25, 6);
      }

      const rawFrame = async (imagePath: string, frameIndex: number): Promise<Buffer> =>
        (
          await execFileAsync(
            "ffmpeg",
            [
              "-v",
              "error",
              "-i",
              imagePath,
              "-vf",
              `select=eq(n\\,${frameIndex})`,
              "-fps_mode",
              "vfr",
              "-frames:v",
              "1",
              "-pix_fmt",
              "rgba",
              "-f",
              "rawvideo",
              "-",
            ],
            {
              cwd: projectRoot,
              windowsHide: true,
              maxBuffer: 32 * 1024 * 1024,
              encoding: "buffer",
            },
          )
        ).stdout;
      const sourceFrame = async (frameIndex: number): Promise<Buffer> => {
        if (sourceName.endsWith(".webp")) {
          return (
            await execFileAsync(
              "python",
              [
                "scripts/decode-pillow-animation-frame.py",
                sourcePath,
                String(frameIndex),
              ],
              {
                cwd: projectRoot,
                windowsHide: true,
                maxBuffer: 32 * 1024 * 1024,
                encoding: "buffer",
              },
            )
          ).stdout;
        }
        return rawFrame(sourcePath, frameIndex);
      };
      for (let index = 0; index < 8; index += 1) {
        expect(await rawFrame(outputPath, index)).toEqual(await sourceFrame(index));
      }
    } finally {
      validationSink?.destroy();
      validationSink = null;
      await rm(outputPath, { force: true });
    }
  });
}

test("tiff-to-zip archives every page with exact decoded pixels", async () => {
  const sourcePath = path.join(
    projectRoot,
    "fixtures",
    "images",
    "test-pattern-multipage.tiff",
  );
  const outputPath = path.join(outputRoot, "tiff-to-zip.zip");
  const extractRoot = path.join(outputRoot, "tiff-to-zip-entries");
  assertProjectLocal(outputPath);
  assertProjectLocal(extractRoot);
  try {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(sourcePath);
    await page.locator('[data-testid="format-select"]').selectOption("tiff-to-zip");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
        { timeout: 30_000 },
      )
      .not.toBe("running");
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    expect(state?.jobState, state?.error ?? state?.phase).toBe("complete");
    expect(state?.warnings).toEqual([]);
    expect(state?.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state?.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(64 * 1024);
    expect(state?.metrics?.peakPendingOperations).toBe(1);
    expect(state?.metrics?.peakWasmMemoryBytes).toBe(40 * 1024 * 1024);
    await copyAndDeleteBrowserOutput(state!.opfsName!, outputPath);

    const expectedNames = ["page-0001.png", "page-0002.png", "pages.json"];
    const { stdout: listing } = await execFileAsync("tar", ["-tf", outputPath], {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    expect(listing.trim().split(/\r?\n/)).toEqual(expectedNames);
    await mkdir(extractRoot, { recursive: true });
    await execFileAsync("tar", ["-xf", outputPath, "-C", extractRoot], {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const manifest = JSON.parse(
      await readFile(path.join(extractRoot, "pages.json"), "utf8"),
    ) as {
      schema: string;
      sourceFormat: string;
      pageCount: number;
      aggregateDecodedBytes: number;
      pages: Array<{
        file: string;
        index: number;
        width: number;
        height: number;
        bitsPerSample: number;
        samplesPerPixel: number;
        decodedBytes: number;
      }>;
    };
    expect(manifest).toMatchObject({
      schema: "within-tiff-pages-v1",
      sourceFormat: "tiff",
      pageCount: 2,
      aggregateDecodedBytes: 72_390,
    });
    expect(manifest.pages.map((record) => record.file)).toEqual(
      expectedNames.slice(0, 2),
    );
    const references = [
      "test-pattern-multipage-first-page-reference.png",
      "test-pattern-multipage-second-page-reference.png",
    ];
    const rawPixels = async (imagePath: string): Promise<Buffer> =>
      (
        await execFileAsync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            imagePath,
            "-frames:v",
            "1",
            "-pix_fmt",
            "rgb24",
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
        )
      ).stdout;
    for (let index = 0; index < manifest.pages.length; index += 1) {
      const record = manifest.pages[index];
      expect(record).toMatchObject({
        index,
        width: 127,
        height: 95,
        bitsPerSample: 8,
        samplesPerPixel: 3,
        decodedBytes: 36_195,
      });
      const pagePath = path.join(extractRoot, record.file);
      const { stdout } = await execFileAsync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "stream=codec_name,width,height,pix_fmt",
          "-of",
          "json",
          pagePath,
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      expect(JSON.parse(stdout).streams[0]).toMatchObject({
        codec_name: "png",
        width: 127,
        height: 95,
        pix_fmt: "rgb24",
      });
      const pageHash = createHash("sha256")
        .update(await rawPixels(pagePath))
        .digest("hex");
      const referenceHash = createHash("sha256")
        .update(
          await rawPixels(
            path.join(projectRoot, "fixtures", "images", references[index]),
          ),
        )
        .digest("hex");
      expect(pageHash).toBe(referenceHash);
    }
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await rm(outputPath, { force: true });
    await rm(extractRoot, { recursive: true, force: true });
  }
});

for (const [profileId, sourceName] of [
  ["png-to-zip", "animated-pattern.apng"],
  ["gif-to-zip", "animated-pattern.gif"],
  ["webp-to-zip", "animated-pattern.webp"],
  ["avif-to-zip", "animated-pattern.avif"],
  ["jxl-to-zip", "animated-pattern.jxl"],
  ["tiff-to-zip", "test-pattern-multipage.tiff"],
  ["gif-to-apng", "animated-pattern.gif"],
  ["webp-to-apng", "animated-pattern.webp"],
] as const) {
  test(`${profileId} output failure removes the partial browser-owned output`, async () => {
    await page.goto("/?test=1&fault=write");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(
      path.join(projectRoot, "fixtures", "images", sourceName),
    );
    await page.locator('[data-testid="format-select"]').selectOption(profileId);
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
    expect(state?.metrics?.pendingOperations).toBe(0);
    expect(state?.metrics?.queuedBytes).toBe(0);
    const leftovers = await page.evaluate(async (prefix) => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith(prefix)) names.push(name);
      }
      return names;
    }, `within-test-${profileId}`);
    expect(leftovers).toEqual([]);
  });
}

test("APNG frame extraction cancellation removes the partial browser-owned ZIP", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "animated-pattern.apng"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("png-to-zip");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 10_000 },
    )
    .toBe("running");
  await page.getByRole("button", { name: "Cancel safely" }).click();
  await expect
    .poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("cancelled");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-png-to-zip")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("APNG encoding cancellation removes the partial browser-owned file", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "animated-pattern.gif"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("gif-to-apng");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 10_000 },
    )
    .toBe("running");
  await page.getByRole("button", { name: "Cancel safely" }).click();
  await expect
    .poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("cancelled");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-gif-to-apng")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

for (const invalidKind of ["truncated", "corrupt"] as const) {
  test(`GIF-to-APNG rejects ${invalidKind} animation data without retained output`, async () => {
    const source = await readFile(
      path.join(projectRoot, "fixtures", "images", "animated-pattern.gif"),
    );
    const invalid = Buffer.from(source.subarray(0, 64));
    if (invalidKind === "corrupt") invalid.fill(0xa5, 10);
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles({
      name: `${invalidKind}.gif`,
      mimeType: "image/gif",
      buffer: invalid,
    });
    await page.locator('[data-testid="format-select"]').selectOption("gif-to-apng");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
        { timeout: 30_000 },
      )
      .toBe("error");
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    expect(state?.opfsName).toBeNull();
    expect(state?.metrics?.pendingOperations).toBe(0);
    expect(state?.metrics?.queuedBytes).toBe(0);
    const leftovers = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-test-gif-to-apng")) names.push(name);
      }
      return names;
    });
    expect(leftovers).toEqual([]);
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

test("JPEG XL output failure removes the partial browser-owned file", async () => {
  await page.goto("/?test=1&fault=write");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "test-pattern.jxl"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("jxl-to-png");
  await page.locator('[data-testid="convert-button"]').click();
  await expect.poll(
    async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
    { timeout: 30_000 },
  ).toBe("error");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.error?.toLowerCase()).toContain("destination rejected a bounded write");
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-jxl-to-png")) names.push(name);
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

test("JPEG XL converts through the bounded direct-save worker", async () => {
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
      path.join(projectRoot, "fixtures", "images", "test-pattern.jxl"),
    );
    await page.locator('[data-testid="format-select"]').selectOption("jxl-to-png");
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
    expect(state?.metrics?.peakWasmMemoryBytes).toBe(112 * 1024 * 1024);
    const output = await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(name);
      const file = await handle.getFile();
      const signature = Array.from(
        new Uint8Array(await file.slice(0, 8).arrayBuffer()),
      );
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

test("JPEG XL cancellation removes the partial browser-owned file", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "highres-pattern.jxl"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("jxl-to-png");
  await page.locator('[data-testid="convert-button"]').click();
  await page.getByRole("button", { name: "Cancel safely" }).click();
  await expect.poll(
    async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
    { timeout: 30_000 },
  ).toBe("cancelled");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-jxl-to-png")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("animated JPEG XL ZIP converts through the bounded direct-save worker", async () => {
  const outputName = "animated-pattern.zip";
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
      path.join(projectRoot, "fixtures", "images", "animated-pattern.jxl"),
    );
    await page.locator('[data-testid="format-select"]').selectOption("jxl-to-zip");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
        { timeout: 30_000 },
      )
      .toBe("complete");
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    expect(state?.batchOutputNames).toEqual([outputName]);
    expect(state?.opfsName).toBeNull();
    expect(state?.metrics?.peakPendingOperations).toBe(1);
    expect(state?.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state?.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(64 * 1024);
    expect(state?.metrics?.peakWasmMemoryBytes).toBe(112 * 1024 * 1024);
    const output = await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(name);
      const file = await handle.getFile();
      const signature = Array.from(
        new Uint8Array(await file.slice(0, 4).arrayBuffer()),
      );
      await root.removeEntry(name);
      return { bytes: file.size, signature };
    }, outputName);
    expect(output.bytes).toBe(756_183);
    expect(output.signature).toEqual([80, 75, 3, 4]);
  } finally {
    await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name).catch(() => {});
    }, outputName).catch(() => {});
  }
});

test("animated JPEG XL cancellation removes the partial browser-owned ZIP", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "animated-pattern.jxl"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("jxl-to-zip");
  await page.locator('[data-testid="convert-button"]').click();
  await page.getByRole("button", { name: "Cancel safely" }).click();
  await expect
    .poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("cancelled");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-jxl-to-zip")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("animated AVIF ZIP converts through the bounded direct-save worker", async () => {
  const outputName = "animated-pattern.zip";
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
      path.join(projectRoot, "fixtures", "images", "animated-pattern.avif"),
    );
    await page.locator('[data-testid="format-select"]').selectOption("avif-to-zip");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
        { timeout: 30_000 },
      )
      .toBe("complete");
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
      const signature = Array.from(
        new Uint8Array(await file.slice(0, 4).arrayBuffer()),
      );
      await root.removeEntry(name);
      return { bytes: file.size, signature };
    }, outputName);
    expect(output.bytes).toBe(329_317);
    expect(output.signature).toEqual([80, 75, 3, 4]);
  } finally {
    await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name).catch(() => {});
    }, outputName).catch(() => {});
  }
});

test("animated AVIF cancellation removes the partial browser-owned ZIP", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "animated-pattern.avif"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("avif-to-zip");
  await page.locator('[data-testid="convert-button"]').click();
  await page.getByRole("button", { name: "Cancel safely" }).click();
  await expect
    .poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("cancelled");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-avif-to-zip")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("animated AVIF route rejects a high-resolution still item without retained output", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "highres-pattern.avif"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("avif-to-zip");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("error");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.error).toContain("AVIF");
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-avif-to-zip")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

for (const invalidKind of ["truncated", "corrupt"] as const) {
  test(`animated AVIF rejects ${invalidKind} input without retained output`, async () => {
    const validBytes = await readFile(
      path.join(projectRoot, "fixtures", "images", "animated-pattern.avif"),
    );
    const buffer = invalidKind === "truncated"
      ? validBytes.subarray(0, 512)
      : Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles({
      name: `${invalidKind}.avif`,
      mimeType: "image/avif",
      buffer,
    });
    await page.locator('[data-testid="format-select"]').selectOption("avif-to-zip");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
        { timeout: 30_000 },
      )
      .toBe("error");
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    expect(state?.error).toContain("AVIF");
    expect(state?.opfsName).toBeNull();
    expect(state?.metrics?.pendingOperations).toBe(0);
    expect(state?.metrics?.queuedBytes).toBe(0);
    const leftovers = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-test-avif-to-zip")) names.push(name);
      }
      return names;
    });
    expect(leftovers).toEqual([]);
  });
}

test("animated JPEG XL rejects an oversized decoded frame without retained output", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, "fixtures", "images", "highres-pattern.jxl"),
  );
  await page.locator('[data-testid="format-select"]').selectOption("jxl-to-zip");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("error");
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.error).toContain("16 MiB safety limit");
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-jxl-to-zip")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("multipage TIFF ZIP converts through the bounded direct-save worker", async () => {
  const outputName = "test-pattern-multipage.zip";
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
      path.join(projectRoot, "fixtures", "images", "test-pattern-multipage.tiff"),
    );
    await page.locator('[data-testid="format-select"]').selectOption("tiff-to-zip");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
        { timeout: 30_000 },
      )
      .toBe("complete");
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
      const signature = Array.from(
        new Uint8Array(await file.slice(0, 4).arrayBuffer()),
      );
      await root.removeEntry(name);
      return { bytes: file.size, signature };
    }, outputName);
    expect(output.bytes).toBeGreaterThan(1_000);
    expect(output.signature).toEqual([80, 75, 3, 4]);
  } finally {
    await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name).catch(() => {});
    }, outputName).catch(() => {});
  }
});

for (const [sourceName, expectedError] of [
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

for (const sourceName of ["truncated.jxl", "corrupt.jxl"] as const) {
  test(`rejects invalid JPEG XL input ${sourceName} without output`, async () => {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(
      path.join(projectRoot, "fixtures", "images", sourceName),
    );
    await page.locator('[data-testid="format-select"]').selectOption("jxl-to-png");
    await page.locator('[data-testid="convert-button"]').click();
    await expect.poll(
      async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    ).toBe("error");
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    expect(state?.error).toContain("JPEG XL");
    expect(state?.metrics?.outputBytes).toBeLessThanOrEqual(64 * 1024);
    expect(state?.opfsName).toBeNull();
    expect(state?.metrics?.pendingOperations).toBe(0);
    expect(state?.metrics?.queuedBytes).toBe(0);
  });
}

for (const [sourceName, expectedError] of [
  ["unsafe-tiff-pages.tiff", "1,000-page safety limit"],
  ["unsafe-tiff-aggregate.tiff", "1,000:1 aggregate decoded safety limit"],
] as const) {
  test(`rejects unsafe multipage TIFF input ${sourceName} without retained output`, async () => {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(
      path.join(projectRoot, "fixtures", "images", sourceName),
    );
    await page.locator('[data-testid="format-select"]').selectOption("tiff-to-zip");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
        { timeout: 30_000 },
      )
      .toBe("error");
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    expect(state?.error).toContain(expectedError);
    expect(state?.opfsName).toBeNull();
    expect(state?.metrics?.pendingOperations).toBe(0);
    expect(state?.metrics?.queuedBytes).toBe(0);
    const leftovers = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-test-tiff-to-zip")) names.push(name);
      }
      return names;
    });
    expect(leftovers).toEqual([]);
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
  ["unsafe-svg-effect-pixels.svg", "6-megapixel"],
  ["unsafe-svg-filter-primitive.svg", "outside the bounded filter profile"],
  ["unsafe-svg-effect-reuse.svg", "at most once"],
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
