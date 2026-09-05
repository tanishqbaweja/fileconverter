import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const testPort = process.env.WITHIN_TEST_PORT ?? "3000";
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const expectedOrigin = new URL(baseURL).origin;
const profileRoot = path.join(projectRoot, "work", "playwright-profile-privacy");
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath =
  process.env.WITHIN_CHROME_PATH ??
  (existsSync(installedChromePath)
    ? installedChromePath
    : chromium.executablePath());
const fixturePath = path.join(projectRoot, "fixtures", "data", "sample.csv");
const tarFixturePath = path.join(
  projectRoot,
  "fixtures",
  "archives",
  "sample.tar",
);
const tarGzFixturePath = path.join(
  projectRoot,
  "fixtures",
  "archives",
  "sample.tar.gz",
);
const tarBz2FixturePath = path.join(
  projectRoot,
  "fixtures",
  "archives",
  "sample.tar.bz2",
);
const tarXzFixturePath = path.join(
  projectRoot,
  "fixtures",
  "archives",
  "sample.tar.xz",
);
const zipFixturePath = path.join(
  projectRoot,
  "fixtures",
  "archives",
  "sample.zip",
);
const sevenZipFixturePath = path.join(
  projectRoot,
  "fixtures",
  "archives",
  "sample.7z",
);
const gzipFixturePath = path.join(
  projectRoot,
  "fixtures",
  "compression",
  "sample.txt.gz",
);
const bzip2FixturePath = path.join(
  projectRoot,
  "fixtures",
  "compression",
  "sample.txt.bz2",
);
const xzFixturePath = path.join(
  projectRoot,
  "fixtures",
  "compression",
  "sample.txt.xz",
);
const m2vFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "mpeg2-video-source.m2v",
);
const wavFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.wav",
);
const mp3FixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.mp3",
);
const flacFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.flac",
);
const aiffFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.aiff",
);
const aacFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.aac",
);
const oggFixturePath = path.join(projectRoot, "fixtures", "media", "audio-source.ogg");
const opusFixturePath = path.join(projectRoot, "fixtures", "media", "audio-source.opus");
const amrFixturePath = path.join(projectRoot, "fixtures", "media", "audio-source.amr");
const m4aFixturePath = path.join(projectRoot, "fixtures", "media", "audio-source.m4a");
const alacFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source-alac.m4a",
);
const amrWbFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "amr-wb-source.awb",
);
const wmaFixturePath = path.join(projectRoot, "fixtures", "media", "audio-source.wma");
const movFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "quicktime-source.mov",
);
const threeGpFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "mobile-video-source.3gp",
);
const protectedMkvPath = path.join(projectRoot, "test.mkv");
const webmFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "webm-source.webm",
);
const flvFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "flash-video-source.flv",
);
const mpegTsFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "transport-source.mpegts",
);
const aviFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "legacy-video-source.avi",
);
const ogvFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "theora-video-source.ogv",
);

let context: BrowserContext;
let page: Page;

async function waitForWorker() {
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
}

test.beforeAll(async () => {
  await rm(profileRoot, { recursive: true, force: true });
  await mkdir(profileRoot, { recursive: true });
  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
    baseURL,
    serviceWorkers: "allow",
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options?: { suggestedName?: string }) => {
        const root = await navigator.storage.getDirectory();
        return root.getFileHandle(options?.suggestedName ?? "within-output.bin", {
          create: true,
        });
      },
    });
  });
  page = context.pages()[0] ?? (await context.newPage());
});

test.afterAll(async () => {
  await context?.setOffline(false);
  await context?.close();
  await rm(profileRoot, { recursive: true, force: true });
});

test("functional browser capability probes pass in production Chrome", async () => {
  await page.goto("/?test=1");
  await waitForWorker();
  await expect
    .poll(async () => page.evaluate(() => window.__WITHIN_TEST__?.getState().capabilities))
    .not.toBeNull();

  const capabilities = await page.evaluate(
    () => window.__WITHIN_TEST__!.getState().capabilities!,
  );
  expect(capabilities).toMatchObject({
    secure: true,
    wasm: true,
    wasmSimd: true,
    workers: true,
    fileSystemAccess: true,
    opfs: true,
    storageEstimate: true,
    compressionGzip: true,
    compressionDeflate: true,
    compressionDeflateRaw: true,
    sharedArrayBuffer: true,
    crossOriginIsolated: true,
    webCrypto: true,
    offscreenCanvas: true,
  });
  expect(capabilities.imageDecoderTypes["image/avif"]).toBe(true);
  expect(capabilities.imageDecoderTypes["image/heic"]).toBe(false);
  expect(capabilities.imageDecoderTypes["image/heic-sequence"]).toBe(false);
  expect(capabilities.imageDecoderTypes["image/heif"]).toBe(false);
  expect(capabilities.imageDecoderTypes["image/heif-sequence"]).toBe(false);
  expect(capabilities.imageDecoderTypes["image/png"]).toBe(true);
  expect(typeof capabilities.webCodecsVideo).toBe("boolean");
  expect(typeof capabilities.webCodecsAudio).toBe("boolean");
  await expect(page.getByTestId("capability-blocker")).toHaveCount(0);
});

test("a failed functional Wasm probe blocks a Wasm profile with an exact reason", async () => {
  const blockedPage = await context.newPage();
  try {
    await blockedPage.addInitScript(() => {
      Object.defineProperty(WebAssembly, "validate", {
        configurable: true,
        value: () => false,
      });
    });
    await blockedPage.goto("/?test=1");
    await blockedPage.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await blockedPage
      .locator('[data-testid="file-input"]')
      .setInputFiles(m2vFixturePath);
    await blockedPage
      .locator('[data-testid="format-select"]')
      .selectOption("m2v-to-webm-vp9");

    const blocker = blockedPage.getByTestId("capability-blocker");
    await expect(blocker).toContainText("WebAssembly");
    await expect(blocker).toContainText(
      "WebAssembly SIMD required by the media core",
    );
    await expect(blockedPage.getByTestId("convert-button")).toBeDisabled();
  } finally {
    await blockedPage.close();
  }
});

test("conversion transmits no filename or file content", async () => {
  const observed: Array<{
    method: string;
    url: string;
    body: string | null;
  }> = [];
  const observe = (request: {
    method(): string;
    url(): string;
    postData(): string | null;
  }) => {
    observed.push({
      method: request.method(),
      url: request.url(),
      body: request.postData(),
    });
  };
  page.on("request", observe);
  try {
    await page.goto("/?test=1");
    await waitForWorker();
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
    const sourceInspection = page.getByTestId("source-inspection");
    await expect(sourceInspection).toContainText("CSV");
    await expect(sourceInspection).toContainText("data");
    await expect(sourceInspection).toContainText("Exact input bytes");
    await expect(sourceInspection).toContainText(
      "Detailed pre-conversion parsing is not yet implemented",
    );
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("csv-to-tsv");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__WITHIN_TEST__?.getState().jobState ?? "missing",
          ),
        { timeout: 45_000 },
      )
      .toBe("complete");

    const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
    expect(state.opfsName).toBeTruthy();
    await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name!);
    }, state.opfsName);
  } finally {
    page.off("request", observe);
  }

  expect(observed.length).toBeGreaterThan(0);
  for (const request of observed) {
    expect(new URL(request.url).origin).toBe(expectedOrigin);
    expect(request.method).toBe("GET");
    expect(request.body).toBeNull();
    expect(request.url).not.toContain("sample.csv");
    expect(request.url).not.toContain("alpha");
  }
});

test("source inspection displays genuine audio and multi-stream video families from bounded local reads", async () => {
  await page.goto("/?test=1");
  await waitForWorker();
  await page.locator('[data-testid="file-input"]').setInputFiles(wavFixturePath);

  const sourceInspection = page.getByTestId("source-inspection");
  const status = page.getByTestId("media-inspection-status");
  await expect(sourceInspection).toContainText("RIFF/WAVE");
  await expect(sourceInspection).toContainText("PCM");
  await expect(sourceInspection).toContainText("768 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("16-bit");
  await expect(sourceInspection).toContainText("RIFF LIST metadata");
  await expect(sourceInspection).toContainText("52 bytes (max 262,144)");
  await expect(status).toContainText("bounded local header reads");
  await expect(status).toContainText("no media payload was uploaded or decoded");

  await page.locator('[data-testid="file-input"]').setInputFiles(mp3FixturePath);
  await expect(sourceInspection).toContainText("MPEG audio");
  await expect(sourceInspection).toContainText("MPEG-1 Layer III (MP3)");
  await expect(sourceInspection).toContainText("192 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("ID3v2.4 tag");
  await expect(sourceInspection).toContainText("Info frame index");
  await expect(sourceInspection).toContainText("4,234 bytes (max 4,234)");
  await expect(status).not.toContainText("Duration is estimated");

  await page.locator('[data-testid="file-input"]').setInputFiles(flacFixturePath);
  await expect(sourceInspection).toContainText("Native FLAC");
  await expect(sourceInspection).toContainText("129 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("16-bit");
  await expect(sourceInspection).toContainText("Vorbis comments");
  await expect(sourceInspection).toContainText("50 bytes (max 262,144)");
  await expect(status).toContainText("average file bitrate");

  await page.locator('[data-testid="file-input"]').setInputFiles(aiffFixturePath);
  await expect(sourceInspection).toContainText("AIFF");
  await expect(sourceInspection).toContainText("PCM (big-endian)");
  await expect(sourceInspection).toContainText("768 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("16-bit");
  await expect(sourceInspection).toContainText("Name");
  await expect(sourceInspection).toContainText("54 bytes (max 262,144)");

  await page.locator('[data-testid="file-input"]').setInputFiles(aacFixturePath);
  await expect(sourceInspection).toContainText("ADTS");
  await expect(sourceInspection).toContainText("AAC LC");
  await expect(sourceInspection).toContainText("268 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Stereo");
  await expect(sourceInspection).toContainText("234 bytes (max 234)");
  await expect(status).toContainText("estimated from up to 32 bounded ADTS frame headers");

  await page.locator('[data-testid="file-input"]').setInputFiles(oggFixturePath);
  await expect(sourceInspection).toContainText("Vorbis");
  await expect(sourceInspection).toContainText("96 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("Vorbis identification");
  await expect(sourceInspection).toContainText("12,893 bytes (max 68,122)");

  await page.locator('[data-testid="file-input"]').setInputFiles(opusFixturePath);
  await expect(sourceInspection).toContainText("Opus");
  await expect(sourceInspection).toContainText("155 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("OpusHead");
  await expect(sourceInspection).toContainText("67,631 bytes (max 68,122)");
  await expect(status).toContainText("average Ogg file bitrate");

  await page.locator('[data-testid="file-input"]').setInputFiles(amrFixturePath);
  await expect(sourceInspection).toContainText("AMR-NB storage");
  await expect(sourceInspection).toContainText("AMR-NB");
  await expect(sourceInspection).toContainText("12 kb/s");
  await expect(sourceInspection).toContainText("8,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("6,441 bytes (max 8,201)");
  await expect(status).toContainText("estimated from 201 frames");

  await page.locator('[data-testid="file-input"]').setInputFiles(m4aFixturePath);
  await expect(sourceInspection).toContainText("M4A / ISO-BMFF");
  await expect(sourceInspection).toContainText("AAC");
  await expect(sourceInspection).toContainText("125 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("User metadata box");
  await expect(sourceInspection).toContainText("1,122 bytes (max 65,536)");
  await expect(status).toContainText("encoded sample bytes");

  await page.locator('[data-testid="file-input"]').setInputFiles(alacFixturePath);
  await expect(sourceInspection).toContainText("ALAC");
  await expect(sourceInspection).toContainText("534 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Stereo");
  await expect(sourceInspection).toContainText("16-bit");
  await expect(sourceInspection).toContainText("780 bytes (max 65,536)");

  await page.locator('[data-testid="file-input"]').setInputFiles(amrWbFixturePath);
  await expect(sourceInspection).toContainText("3GP / ISO-BMFF");
  await expect(sourceInspection).toContainText("AMR-WB");
  await expect(sourceInspection).toContainText("24 kb/s");
  await expect(sourceInspection).toContainText("16,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("280 bytes (max 65,536)");
  await expect(status).toContainText("AMR codec mode");

  await page.locator('[data-testid="file-input"]').setInputFiles(wmaFixturePath);
  await expect(sourceInspection).toContainText("ASF");
  await expect(sourceInspection).toContainText("Windows Media Audio 2");
  await expect(sourceInspection).toContainText("320 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Stereo");
  await expect(sourceInspection).toContainText("Content description");
  await expect(sourceInspection).toContainText("Extended content description");
  await expect(sourceInspection).toContainText("326 bytes (max 65,536)");

  await page.locator('[data-testid="file-input"]').setInputFiles(movFixturePath);
  await expect(sourceInspection).toContainText("QuickTime / MOV");
  await expect(sourceInspection).toContainText("H.264/AVC");
  await expect(sourceInspection).toContainText("640×360");
  await expect(sourceInspection).toContainText("24.01 fps");
  await expect(sourceInspection).toContainText("Stream count");
  await expect(sourceInspection).toContainText("Stream 1 (Video)");
  await expect(sourceInspection).toContainText("Stream 2 (Audio)");
  await expect(sourceInspection).toContainText("AAC");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("1,784 bytes (max 65,536)");

  await page.locator('[data-testid="file-input"]').setInputFiles(threeGpFixturePath);
  await expect(sourceInspection).toContainText("3GP / ISO-BMFF");
  await expect(sourceInspection).toContainText("H.264/AVC");
  await expect(sourceInspection).toContainText("640×360");
  await expect(sourceInspection).toContainText("AAC");
  await expect(sourceInspection).toContainText("1,782 bytes (max 65,536)");

  await page.locator('[data-testid="file-input"]').setInputFiles(webmFixturePath);
  await expect(sourceInspection).toContainText("WebM");
  await expect(sourceInspection).toContainText("VP9");
  await expect(sourceInspection).toContainText("320×180");
  await expect(sourceInspection).toContainText("Opus");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("65,536 bytes (max 65,536)");

  if (existsSync(protectedMkvPath)) {
    await page.locator('[data-testid="file-input"]').setInputFiles(protectedMkvPath);
    await expect(sourceInspection).toContainText("Matroska");
    await expect(sourceInspection).toContainText("HEVC/H.265");
    await expect(sourceInspection).toContainText("1920×804");
    await expect(sourceInspection).toContainText("24.00 fps");
    await expect(sourceInspection).toContainText("Stream 1 (Video)");
    await expect(sourceInspection).toContainText("Stream 2 (Audio)");
    await expect(sourceInspection).toContainText("Stream 3 (Subtitle)");
    await expect(sourceInspection).toContainText("48,000 Hz");
    await expect(sourceInspection).toContainText("6 channels");
    await expect(sourceInspection).toContainText("SubRip subtitle");
    await expect(sourceInspection).toContainText("65,536 bytes (max 65,536)");
    await expect(status).toContainText("average whole-file rate");
  } else {
    test.info().annotations.push({
      type: "fixture",
      description: "test.mkv is an intentionally untracked local stress fixture",
    });
  }

  await page.locator('[data-testid="file-input"]').setInputFiles(flvFixturePath);
  await expect(sourceInspection).toContainText("FLV");
  await expect(sourceInspection).toContainText("H.264/AVC");
  await expect(sourceInspection).toContainText("640×360");
  await expect(sourceInspection).toContainText("24.00 fps");
  await expect(sourceInspection).toContainText("AAC");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("Script metadata");
  await expect(status).toContainText("FLV script metadata");

  await page.locator('[data-testid="file-input"]').setInputFiles(mpegTsFixturePath);
  await expect(sourceInspection).toContainText("MPEG transport stream");
  await expect(sourceInspection).toContainText("H.264/AVC");
  await expect(sourceInspection).toContainText("640×360");
  await expect(sourceInspection).toContainText("24.00 fps");
  await expect(sourceInspection).toContainText("AAC");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("PAT/PMT program map");
  await expect(sourceInspection).toContainText("131,072 bytes (max 131,072)");
  await expect(status).toContainText("head/tail PES timestamps");

  await page.locator('[data-testid="file-input"]').setInputFiles(aviFixturePath);
  await expect(sourceInspection).toContainText("AVI");
  await expect(sourceInspection).toContainText("MPEG-4 Part 2");
  await expect(sourceInspection).toContainText("640×360");
  await expect(sourceInspection).toContainText("24.00 fps");
  await expect(sourceInspection).toContainText("MP3");
  await expect(sourceInspection).toContainText("192 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("RIFF INFO metadata");
  await expect(sourceInspection).toContainText("394 bytes (max 262,144)");
  await expect(status).toContainText("movi payload is skipped");

  await page.locator('[data-testid="file-input"]').setInputFiles(ogvFixturePath);
  await expect(sourceInspection).toContainText("Ogg");
  await expect(sourceInspection).toContainText("Theora");
  await expect(sourceInspection).toContainText("640×360");
  await expect(sourceInspection).toContainText("24.00 fps");
  await expect(sourceInspection).toContainText("Vorbis");
  await expect(sourceInspection).toContainText("96 kb/s");
  await expect(sourceInspection).toContainText("48,000 Hz");
  await expect(sourceInspection).toContainText("Mono");
  await expect(sourceInspection).toContainText("133,120 bytes (max 133,120)");
  await expect(status).toContainText("final per-stream granules");
});

test("installed app shell loads offline without eagerly downloading engines", async () => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Big files. Small memory." }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cachedPaths = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (
      await Promise.all(
        keys
          .filter((key) => key.startsWith("within-"))
          .map(async (key) => (await caches.open(key)).keys()),
      )
    ).flat();
    return requests.map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths).toContain("/");
  expect(cachedPaths).toContain("/manifest.webmanifest");
  expect(cachedPaths.some((pathname) => pathname.startsWith("/engines/"))).toBe(
    false,
  );

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("cached VP9 media core performs a real conversion offline", async () => {
  test.setTimeout(120_000);
  const convert = async () => {
    await page.locator('[data-testid="file-input"]').setInputFiles(m2vFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("m2v-to-webm-vp9");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
        { timeout: 60_000 },
      )
      .toBe("complete");
    return page.evaluate(async () => {
      const state = window.__WITHIN_TEST__!.getState();
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(state.opfsName!);
      const file = await handle.getFile();
      const magic = Array.from(new Uint8Array(await file.slice(0, 4).arrayBuffer()));
      await root.removeEntry(state.opfsName!);
      return { bytes: file.size, magic };
    });
  };
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/?test=1");
  expect((await convert()).magic).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  const cachedVp9Paths = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(cachedVp9Paths).toContain("/engines/remux/within-vp9.mjs");
  expect(cachedVp9Paths).toContain("/engines/remux/within-vp9.wasm");
  await page.reload();
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__WITHIN_TEST__?.getState().workerStatus),
      { timeout: 15_000 },
    )
    .toBe("ready");
  await context.setOffline(true);
  try {
    const result = await convert();
    expect(result.bytes).toBeGreaterThan(50_000);
    expect(result.magic).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  } finally {
    await context.setOffline(false);
  }
});

test("cached direct destination writer converts while offline", async () => {
  const outputName = "sample.tsv";
  const convertDirect = async () => {
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("csv-to-tsv");
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await expect(page.getByRole("button", { name: new RegExp(outputName) })).toBeVisible();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(entryName);
      const text = await (await handle.getFile()).text();
      await root.removeEntry(entryName);
      return text;
    }, outputName);
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(await convertDirect()).toContain("name\tnote\tcount");
  const writerCached = await page.evaluate(async () => {
    const requests = (
      await Promise.all(
        (await caches.keys())
          .filter((key) => key.startsWith("within-"))
          .map(async (key) => (await caches.open(key)).keys()),
      )
    ).flat();
    return requests.some((request) =>
      /\/assets\/direct-file-writer\.worker-[^/]+\.js$/.test(
        new URL(request.url).pathname,
      ),
    );
  });
  expect(writerCached).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await convertDirect()).toContain("name\tnote\tcount");
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(entryName).catch(() => {});
    }, outputName).catch(() => {});
  }
});

test("cached TAR-to-7Z engine converts offline and removes scratch", async () => {
  const outputName = "sample.7z";
  const convertTarDirect = async () => {
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(tarFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("tar-to-sevenzip");
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(entryName);
      const file = await handle.getFile();
      const magic = Array.from(
        new Uint8Array(await file.slice(0, 6).arrayBuffer()),
      );
      const leftovers: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-sevenzip-scratch-")) leftovers.push(name);
      }
      await root.removeEntry(entryName);
      return { bytes: file.size, magic, leftovers };
    }, outputName);
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect((await convertTarDirect()).magic).toEqual([
    0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c,
  ]);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    const result = await convertTarDirect();
    expect(result.bytes).toBeGreaterThan(32);
    expect(result.magic).toEqual([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    expect(result.leftovers).toEqual([]);
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(entryName).catch(() => {});
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-sevenzip-scratch-")) {
          await root.removeEntry(name).catch(() => {});
        }
      }
    }, outputName).catch(() => {});
  }
});

test("cached compressed-TAR and ZIP pipelines convert to 7Z offline", async () => {
  const routes = [
    { fixture: tarGzFixturePath, profileId: "tar-gz-to-sevenzip" },
    { fixture: tarBz2FixturePath, profileId: "tar-bz2-to-sevenzip" },
    { fixture: tarXzFixturePath, profileId: "tar-xz-to-sevenzip" },
    { fixture: zipFixturePath, profileId: "zip-to-sevenzip" },
  ] as const;
  const outputName = "sample.7z";

  const convertDirect = async (route: (typeof routes)[number]) => {
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
    await page.locator('[data-testid="file-input"]').setInputFiles(route.fixture);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(route.profileId);
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(entryName);
      const file = await handle.getFile();
      const magic = Array.from(
        new Uint8Array(await file.slice(0, 6).arrayBuffer()),
      );
      const leftovers: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-sevenzip-scratch-")) leftovers.push(name);
      }
      await root.removeEntry(entryName);
      return { bytes: file.size, magic, leftovers };
    }, outputName);
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  for (const route of routes) {
    expect((await convertDirect(route)).magic).toEqual([
      0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c,
    ]);
  }

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    for (const route of routes) {
      const result = await convertDirect(route);
      expect(result.bytes).toBeGreaterThan(32);
      expect(result.magic).toEqual([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
      expect(result.leftovers).toEqual([]);
    }
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(entryName).catch(() => {});
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-sevenzip-scratch-")) {
          await root.removeEntry(name).catch(() => {});
        }
      }
    }, outputName).catch(() => {});
  }
});

test("cached compressed TAR transcoding pipelines convert offline", async () => {
  test.setTimeout(120_000);
  const routes = [
    {
      fixture: tarGzFixturePath,
      profileId: "tar-gz-to-tar-bz2",
      outputName: "sample.tar.bz2",
      signature: [0x42, 0x5a, 0x68],
    },
    {
      fixture: tarGzFixturePath,
      profileId: "tar-gz-to-tar-xz",
      outputName: "sample.tar.xz",
      signature: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00],
    },
    {
      fixture: tarBz2FixturePath,
      profileId: "tar-bz2-to-tar-gz",
      outputName: "sample.tar.gz",
      signature: [0x1f, 0x8b],
    },
    {
      fixture: tarBz2FixturePath,
      profileId: "tar-bz2-to-tar-xz",
      outputName: "sample.tar.xz",
      signature: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00],
    },
    {
      fixture: tarXzFixturePath,
      profileId: "tar-xz-to-tar-gz",
      outputName: "sample.tar.gz",
      signature: [0x1f, 0x8b],
    },
    {
      fixture: tarXzFixturePath,
      profileId: "tar-xz-to-tar-bz2",
      outputName: "sample.tar.bz2",
      signature: [0x42, 0x5a, 0x68],
    },
  ] as const;

  const convertDirect = async (route: (typeof routes)[number]) => {
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
    await page.locator('[data-testid="file-input"]').setInputFiles(route.fixture);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(route.profileId);
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async ({ outputName, signatureBytes }) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(outputName);
      const file = await handle.getFile();
      const signature = Array.from(
        new Uint8Array(await file.slice(0, signatureBytes).arrayBuffer()),
      );
      await root.removeEntry(outputName);
      return { bytes: file.size, signature };
    }, { outputName: route.outputName, signatureBytes: route.signature.length });
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  for (const route of routes) {
    expect((await convertDirect(route)).signature).toEqual(route.signature);
  }

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    for (const route of routes) {
      const result = await convertDirect(route);
      expect(result.bytes).toBeGreaterThan(100);
      expect(result.signature).toEqual(route.signature);
    }
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (names) => {
      const root = await navigator.storage.getDirectory();
      for (const name of names) {
        await root.removeEntry(name).catch(() => {});
      }
    }, routes.map((route) => route.outputName)).catch(() => {});
  }
});

test("cached raw compression transcoding pipelines convert offline", async () => {
  test.setTimeout(120_000);
  const routes = [
    { fixture: gzipFixturePath, profileId: "gzip-to-bzip2", outputName: "sample.txt.bz2", signature: [0x42, 0x5a, 0x68] },
    { fixture: gzipFixturePath, profileId: "gzip-to-xz", outputName: "sample.txt.xz", signature: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
    { fixture: bzip2FixturePath, profileId: "bzip2-to-gzip", outputName: "sample.txt.gz", signature: [0x1f, 0x8b] },
    { fixture: bzip2FixturePath, profileId: "bzip2-to-xz", outputName: "sample.txt.xz", signature: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
    { fixture: xzFixturePath, profileId: "xz-to-gzip", outputName: "sample.txt.gz", signature: [0x1f, 0x8b] },
    { fixture: xzFixturePath, profileId: "xz-to-bzip2", outputName: "sample.txt.bz2", signature: [0x42, 0x5a, 0x68] },
  ] as const;

  const convertDirect = async (route: (typeof routes)[number]) => {
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
    await page.locator('[data-testid="file-input"]').setInputFiles(route.fixture);
    await page.locator('[data-testid="format-select"]').selectOption(route.profileId);
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async ({ outputName, signatureBytes }) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(outputName);
      const file = await handle.getFile();
      const signature = Array.from(
        new Uint8Array(await file.slice(0, signatureBytes).arrayBuffer()),
      );
      await root.removeEntry(outputName);
      return { bytes: file.size, signature };
    }, { outputName: route.outputName, signatureBytes: route.signature.length });
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  for (const route of routes) {
    expect((await convertDirect(route)).signature).toEqual(route.signature);
  }

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    for (const route of routes) {
      const result = await convertDirect(route);
      expect(result.bytes).toBeGreaterThan(100);
      expect(result.signature).toEqual(route.signature);
    }
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (names) => {
      const root = await navigator.storage.getDirectory();
      for (const name of names) await root.removeEntry(name).catch(() => {});
    }, routes.map((route) => route.outputName)).catch(() => {});
  }
});

test("cached TAR.XZ-to-ZIP pipeline converts offline", async () => {
  const outputName = "sample.zip";
  const convertTarXzDirect = async () => {
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(tarXzFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("tar-xz-to-zip");
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(entryName);
      const file = await handle.getFile();
      const signature = Array.from(
        new Uint8Array(await file.slice(0, 4).arrayBuffer()),
      );
      await root.removeEntry(entryName);
      return { bytes: file.size, signature };
    }, outputName);
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect((await convertTarXzDirect()).signature).toEqual([
    0x50, 0x4b, 0x03, 0x04,
  ]);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    const result = await convertTarXzDirect();
    expect(result.bytes).toBeGreaterThan(100);
    expect(result.signature).toEqual([0x50, 0x4b, 0x03, 0x04]);
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(entryName).catch(() => {});
    }, outputName).catch(() => {});
  }
});

test("cached ZIP-to-TAR.XZ pipeline converts offline", async () => {
  const outputName = "sample.tar.xz";
  const convertZipDirect = async () => {
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
    await page.locator('[data-testid="file-input"]').setInputFiles(zipFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("zip-to-tar-xz");
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(entryName);
      const file = await handle.getFile();
      const signature = Array.from(
        new Uint8Array(await file.slice(0, 6).arrayBuffer()),
      );
      await root.removeEntry(entryName);
      return { bytes: file.size, signature };
    }, outputName);
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect((await convertZipDirect()).signature).toEqual([
    0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00,
  ]);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    const result = await convertZipDirect();
    expect(result.bytes).toBeGreaterThan(100);
    expect(result.signature).toEqual([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(entryName).catch(() => {});
    }, outputName).catch(() => {});
  }
});

test("cached 7Z-to-compressed-TAR pipelines convert offline", async () => {
  const routes = [
    {
      profileId: "sevenzip-to-tar-bz2",
      outputName: "sample.tar.bz2",
      signature: [0x42, 0x5a, 0x68],
    },
    {
      profileId: "sevenzip-to-tar-xz",
      outputName: "sample.tar.xz",
      signature: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00],
    },
  ] as const;

  const convertDirect = async (route: (typeof routes)[number]) => {
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(sevenZipFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(route.profileId);
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async ({ outputName, signatureBytes }) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(outputName);
      const file = await handle.getFile();
      const signature = Array.from(
        new Uint8Array(
          await file.slice(0, signatureBytes).arrayBuffer(),
        ),
      );
      await root.removeEntry(outputName);
      return { bytes: file.size, signature };
    }, { outputName: route.outputName, signatureBytes: route.signature.length });
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  for (const route of routes) {
    expect((await convertDirect(route)).signature).toEqual(route.signature);
  }

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    for (const route of routes) {
      const result = await convertDirect(route);
      expect(result.bytes).toBeGreaterThan(100);
      expect(result.signature).toEqual(route.signature);
    }
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (names) => {
      const root = await navigator.storage.getDirectory();
      for (const name of names) {
        await root.removeEntry(name).catch(() => {});
      }
    }, routes.map((route) => route.outputName)).catch(() => {});
  }
});

test("static codec assets preserve cross-origin isolation for pthread workers", async () => {
  const response = await page.request.get("/engines/remux/within-remux.mjs");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cross-origin-embedder-policy"]).toBe(
    "require-corp",
  );
  expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response.headers()["cross-origin-resource-policy"]).toBe("same-origin");
});
