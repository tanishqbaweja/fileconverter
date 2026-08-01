import { expect, test, chromium, type BrowserContext, type Page } from "@playwright/test";
import { createWriteStream, existsSync } from "node:fs";
import { once } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const testPort = process.env.WITHIN_TEST_PORT ?? "3000";
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const profileRoot = path.join(projectRoot, "work", "playwright-profile-small");
const cancellationFixturePath = path.join(
  projectRoot,
  "work",
  "cancellation-source.ndjson",
);
const batchFixturePaths = [
  path.join(projectRoot, "work", "batch-café.txt"),
  path.join(projectRoot, "work", "batch-日本語.txt"),
];
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath =
  process.env.WITHIN_CHROME_PATH ??
  (existsSync(installedChromePath)
    ? installedChromePath
    : chromium.executablePath());

let context: BrowserContext;
let page: Page;
const browserDiagnostics: string[] = [];

interface TestState {
  jobState: "idle" | "running" | "complete" | "cancelled" | "error";
  phase: string;
  metrics: {
    inputBytes: number;
    outputBytes: number;
    queuedBytes: number;
    peakQueuedBytes: number;
    pendingOperations: number;
    peakPendingOperations: number;
    maxReadChunkBytes: number;
    maxWriteChunkBytes: number;
    elapsedMs: number;
  } | null;
  error: string | null;
  warnings: string[];
  selectedProfileId: string | null;
  opfsName: string | null;
  opfsNames: string[];
  batchOutputNames: string[];
  batchCompleted: number;
  batchTotal: number;
  startupCleanupComplete: boolean;
  workerStatus: "starting" | "ready" | "error";
}

async function currentState(): Promise<TestState> {
  return page.evaluate(() => {
    if (!window.__WITHIN_TEST__) throw new Error("Test bridge is unavailable.");
    return window.__WITHIN_TEST__.getState();
  });
}

async function selectFixture(relativePath: string, profileId: string) {
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, relativePath),
  );
  await expect(page.locator('[data-testid="format-select"]')).toBeVisible();
  await page.locator('[data-testid="format-select"]').selectOption(profileId);
}

async function convert(): Promise<TestState> {
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(
      async () => {
        const state = await currentState();
        return state.jobState === "running" ? "running" : state.jobState;
      },
      { timeout: 45_000 },
    )
    .not.toBe("running");
  const state = await currentState();
  expect(state.jobState, state.error ?? state.phase).toBe("complete");
  expect(state.error).toBeNull();
  expect(state.opfsName).not.toBeNull();
  expect(state.metrics?.pendingOperations).toBe(0);
  expect(state.metrics?.queuedBytes).toBe(0);
  expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
  expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
  return state;
}

async function readAndDeleteOpfsText(name: string): Promise<string> {
  return page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const file = await handle.getFile();
    const text = await file.text();
    await root.removeEntry(opfsName);
    return text;
  }, name);
}

async function appOwnedOpfsNames(prefix: string): Promise<string[]> {
  return page.evaluate(async (expectedPrefix) => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith(expectedPrefix)) names.push(name);
    }
    return names;
  }, prefix);
}

async function openFaultMode(
  fault: string,
  destination: "opfs-test" | "direct" = "opfs-test",
): Promise<void> {
  const directory = destination === "direct" ? "&directory=1" : "";
  await page.goto(`/?test=1&fault=${fault}${directory}`);
  await expect
    .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
    .toBe("ready");
}

async function removeOpfsEntryAndReportSize(
  name: string,
): Promise<number | null> {
  return page.evaluate(async (entryName) => {
    const root = await navigator.storage.getDirectory();
    try {
      const handle = await root.getFileHandle(entryName);
      const size = (await handle.getFile()).size;
      await root.removeEntry(entryName);
      return size;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return null;
      }
      throw error;
    }
  }, name);
}

test.beforeAll(async () => {
  await rm(profileRoot, { recursive: true, force: true });
  await rm(cancellationFixturePath, { force: true });
  await mkdir(profileRoot, { recursive: true });
  await writeFile(batchFixturePaths[0], "First private batch payload: café.\n", "utf8");
  await writeFile(batchFixturePaths[1], "Second private batch payload: 日本語.\n", "utf8");
  const cancellationFixture = createWriteStream(cancellationFixturePath, {
    flags: "w",
  });
  const payload = "x".repeat(1_000);
  for (let index = 0; index < 65_536; index += 1) {
    const line = `${JSON.stringify({ index, payload })}\n`;
    if (!cancellationFixture.write(line)) {
      await once(cancellationFixture, "drain");
    }
  }
  cancellationFixture.end();
  await once(cancellationFixture, "finish");
  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
    acceptDownloads: false,
    baseURL,
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on("console", (message) => {
    browserDiagnostics.push(`console:${message.type()}:${message.text()}`);
  });
  page.on("pageerror", (error) => {
    browserDiagnostics.push(`pageerror:${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browserDiagnostics.push(`response:${response.status()}:${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    browserDiagnostics.push(
      `requestfailed:${request.url()}:${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("worker", (worker) => {
    browserDiagnostics.push(`worker:${worker.url()}`);
    worker.on("close", () => {
      browserDiagnostics.push(`worker-closed:${worker.url()}`);
    });
  });
  await page.goto("/?test=1");
  await expect(page.getByRole("heading", { name: "Big files. Small memory." })).toBeVisible();
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  await page.waitForTimeout(1_000);
  const workerState = await currentState();
  expect(
    workerState.workerStatus,
    `${workerState.error ?? workerState.phase}\n${browserDiagnostics.join("\n")}`,
  ).toBe("ready");
});

test.afterAll(async () => {
  await context?.close();
  await rm(profileRoot, { recursive: true, force: true });
  await rm(cancellationFixturePath, { force: true });
  await Promise.all(batchFixturePaths.map((fixture) => rm(fixture, { force: true })));
});

test.beforeEach(async () => {
  await page.goto("/?test=1");
});

test("converts SRT to valid WebVTT with bounded writes", async () => {
  await selectFixture("fixtures/subtitles/sample.srt", "srt-to-vtt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output.startsWith("WEBVTT\r\n\r\n")).toBe(true);
  expect(output).toContain("00:00:01.250 --> 00:00:03.900");
  expect(output).toContain("<i>Hello</i> from Within.");
});

test("converts WebVTT to SRT and discloses unsupported positioning", async () => {
  await selectFixture("fixtures/subtitles/sample.vtt", "vtt-to-srt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("1\r\n00:00:01,250 --> 00:00:03,900\r\n");
  expect(output).not.toContain("position:20%");
  expect(output).toContain("2\r\n00:00:04,100 --> 00:00:07,000\r\n");
});

test("converts SRT to structurally valid TTML with basic styling", async () => {
  await selectFixture("fixtures/subtitles/sample.srt", "srt-to-ttml");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain(
    '<p begin="00:00:01.250" end="00:00:03.900"><span tts:fontStyle="italic">Hello</span> from Within.</p>',
  );
  expect(output).toContain("Second cue<br/>with two lines.");
  const parseError = await page.evaluate((text) => {
    const document = new DOMParser().parseFromString(text, "application/xml");
    return document.querySelector("parsererror")?.textContent ?? null;
  }, output);
  expect(parseError).toBeNull();
});

test("converts WebVTT to TTML and discloses removed cue settings", async () => {
  await selectFixture("fixtures/subtitles/sample.vtt", "vtt-to-ttml");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain(
    '<p begin="00:00:01.250" end="00:00:03.900"><span tts:fontStyle="italic">Hello</span> from Within.</p>',
  );
  expect(state.warnings.some((warning) => warning.includes("positioning"))).toBe(
    true,
  );
});

test("converts bounded TTML to SRT with timing and line breaks", async () => {
  await selectFixture("fixtures/subtitles/sample.ttml", "ttml-to-srt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain(
    "1\r\n00:00:01,250 --> 00:00:03,900\r\n<i>Hello</i> from Within.\r\n\r\n",
  );
  expect(output).toContain(
    "2\r\n00:00:04,100 --> 00:00:07,000\r\nSecond cue\r\nwith two lines.\r\n\r\n",
  );
});

test("converts bounded TTML to WebVTT with basic styling", async () => {
  await selectFixture("fixtures/subtitles/sample.ttml", "ttml-to-vtt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output.startsWith("WEBVTT\r\n\r\n")).toBe(true);
  expect(output).toContain(
    "00:00:01.250 --> 00:00:03.900\r\n<i>Hello</i> from Within.\r\n\r\n",
  );
});

test("rejects TTML DTDs and deletes partial output", async () => {
  await selectFixture(
    "fixtures/subtitles/unsafe-doctype.ttml",
    "ttml-to-vtt",
  );
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const state = await currentState();
  expect(state.error).toContain("DTD");
  expect(state.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-ttml-to-vtt")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("converts UTF-8 text to safe preformatted HTML", async () => {
  await selectFixture("fixtures/documents/sample.txt", "txt-to-html");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("&lt;private&gt; &amp; &quot;quoted&quot;");
  const result = await page.evaluate((html) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    return {
      scripts: document.scripts.length,
      text: document.querySelector("pre")?.textContent ?? null,
    };
  }, output);
  expect(result.scripts).toBe(0);
  expect(result.text).toBe(
    'Within keeps files on this device.\nSymbols: <private> & "quoted".\nUnicode: हिन्दी, 日本語, café.\n',
  );
});

test("streams DOCX main-document text with disclosed structural loss", async () => {
  await selectFixture("fixtures/documents/sample.docx", "docx-to-txt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toBe(
    "Within DOCX keeps files on this device.\n" +
      "Formatting stays readable.\n" +
      "Linked text\tafter tab\nafter break\n" +
      "Unicode: हिन्दी, 日本語, café, 😀.\n" +
      "Accepted insertion\n" +
      "Cell A\n" +
      "Cell B\n",
  );
  expect(output).not.toContain("deleted text");
  expect(state.warnings.join(" ")).toContain("Formatting");
  expect(state.warnings.join(" ")).toContain("headers");
  expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(await appOwnedOpfsNames("within-test-docx-to-txt")).toEqual([]);
});

for (const [fixture, expectedError] of [
  ["fixtures/documents/unsafe-doctype.docx", "DTD"],
  ["fixtures/documents/unsafe-path.docx", "Unsafe ZIP entry"],
] as const) {
  test(`rejects hostile DOCX package ${path.basename(fixture)} and removes partial output`, async () => {
    await selectFixture(fixture, "docx-to-txt");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error).toContain(expectedError);
    expect(state.opfsName).toBeNull();
    expect(await appOwnedOpfsNames("within-test-docx-to-txt")).toEqual([]);
  });
}

test("streams the first visible XLSX worksheet to coordinate-faithful CSV", async () => {
  await selectFixture("fixtures/spreadsheets/sample.xlsx", "xlsx-to-csv");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toBe(
    "Name,42.5,,inline\r\n" +
      '"Comma, quote "" and line\nbreak 😀",TRUE,#DIV/0!,2026-08-01T12:34:56Z\r\n' +
      "\r\n" +
      "7,,cached text\r\n",
  );
  const warnings = state.warnings.join(" ");
  expect(warnings).toContain("first visible worksheet");
  expect(warnings).toContain("additional visible XLSX worksheet was omitted");
  expect(warnings).toContain("hidden XLSX worksheet was omitted");
  expect(warnings).toContain("formula had no cached result");
  expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(await appOwnedOpfsNames("within-test-xlsx-to-csv")).toEqual([]);
});

for (const [fixture, expectedError] of [
  ["fixtures/spreadsheets/unsafe-doctype.xlsx", "DTD"],
  ["fixtures/spreadsheets/unsafe-reference.xlsx", "escapes its root"],
] as const) {
  test(`rejects hostile XLSX package ${path.basename(fixture)} and removes partial output`, async () => {
    await selectFixture(fixture, "xlsx-to-csv");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error).toContain(expectedError);
    expect(state.opfsName).toBeNull();
    expect(await appOwnedOpfsNames("within-test-xlsx-to-csv")).toEqual([]);
  });
}

test("streams EPUB spine text in reading order with explicit fidelity limits", async () => {
  await selectFixture("fixtures/ebooks/sample.epub", "epub-to-txt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toBe(
    "Chapter One\n" +
      "Within EPUB keeps files on this device.\n" +
      "Formatting stays readable. Linked text.\n" +
      "Inline, punctuation stays attached.\n" +
      "- First item\n" +
      "- Second item\n" +
      "Cell A\tCell B\n" +
      "Unicode: हिन्दी, 日本語, café, 😀.\n" +
      "Chapter Two\n" +
      "Line one\nafter break\n" +
      "Copyright © registered ®.\n",
  );
  expect(output).not.toContain("Hidden title");
  expect(output).not.toContain("hidden drawing text");
  expect(output).not.toContain("upload");
  expect(output).not.toContain("Non-linear appendix");
  expect(state.warnings.join(" ")).toContain("non-linear EPUB spine");
  expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(await appOwnedOpfsNames("within-test-epub-to-txt")).toEqual([]);
});

for (const [fixture, expectedError] of [
  ["fixtures/ebooks/unsafe-doctype.epub", "DTD"],
  ["fixtures/ebooks/unsafe-reference.epub", "escapes its root"],
] as const) {
  test(`rejects hostile EPUB package ${path.basename(fixture)} and removes partial output`, async () => {
    await selectFixture(fixture, "epub-to-txt");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error).toContain(expectedError);
    expect(state.opfsName).toBeNull();
    expect(await appOwnedOpfsNames("within-test-epub-to-txt")).toEqual([]);
  });
}

test("converts a Unicode-named batch sequentially and cleans every output", async () => {
  await page.goto("/?test=1&directory=1");
  await expect
    .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
    .toBe("ready");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const existing = await root.getFileHandle("batch-café.html", { create: true });
    const writable = await existing.createWritable();
    await writable.write("existing output must not be overwritten\n");
    await writable.close();
  });
  await page.locator('[data-testid="file-input"]').setInputFiles(batchFixturePaths);
  await expect(page.locator('[data-testid="format-select"]')).toBeVisible();
  await page.locator('[data-testid="format-select"]').selectOption("txt-to-html");
  await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
    /Convert 2 files/,
  );

  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 45_000 })
    .toBe("complete");
  const state = await currentState();
  expect(state.batchCompleted).toBe(2);
  expect(state.batchTotal).toBe(2);
  expect(state.opfsName).toBeNull();
  expect(state.opfsNames).toEqual([]);
  expect(state.batchOutputNames).toEqual([
    "batch-café-2.html",
    "batch-日本語.html",
  ]);
  expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
  expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);

  const outputs = await page.evaluate(async (names) => {
    const root = await navigator.storage.getDirectory();
    const texts: string[] = [];
    for (const name of names) {
      const handle = await root.getFileHandle(name);
      texts.push(await (await handle.getFile()).text());
      await root.removeEntry(name);
    }
    const existing = await root.getFileHandle("batch-café.html");
    const existingText = await (await existing.getFile()).text();
    await root.removeEntry("batch-café.html");
    return { texts, existingText };
  }, state.batchOutputNames);
  expect(outputs.texts[0]).toContain("First private batch payload: café.");
  expect(outputs.texts[1]).toContain("Second private batch payload: 日本語.");
  expect(outputs.existingText).toBe("existing output must not be overwritten\n");
  expect(await appOwnedOpfsNames("within-test-txt-to-html")).toEqual([]);
  await expect
    .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
    .toBe("ready");
});

test("rejects a mixed-format batch before creating any output", async () => {
  await page.locator('[data-testid="file-input"]').setInputFiles([
    path.join(projectRoot, "fixtures/documents/sample.txt"),
    path.join(projectRoot, "fixtures/data/sample.csv"),
  ]);
  await expect(page.getByRole("alert")).toContainText(
    "Batch files must share one detected format",
  );
  expect((await currentState()).batchTotal).toBe(0);
  await expect(page.locator('[data-testid="format-select"]')).toBeHidden();
  expect(await appOwnedOpfsNames("within-test-")).toEqual([]);
});

test("renders a disclosed bounded Markdown subset as valid HTML", async () => {
  await selectFixture("fixtures/documents/sample.md", "md-to-html");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  const result = await page.evaluate((html) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    return {
      heading: document.querySelector("h1")?.textContent,
      strong: document.querySelector("strong")?.textContent,
      listItems: [...document.querySelectorAll("li")].map(
        (item) => item.textContent,
      ),
      code: document.querySelector("pre code")?.textContent,
      scripts: document.scripts.length,
      escapedScriptText: document.body.textContent?.includes(
        '<script>alert("escaped")</script>',
      ),
    };
  }, output);
  expect(result).toEqual({
    heading: "Within document",
    strong: "conversion",
    listItems: ["No upload", "No filename telemetry"],
    code: "<raw code> & exact text\n",
    scripts: 0,
    escapedScriptText: true,
  });
});

test("extracts visible HTML text while removing active and styled content", async () => {
  await selectFixture("fixtures/documents/sample.html", "html-to-txt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toBe(
    "Within & privacy\n" +
      "Files stay on device.\n" +
      "Nothing is uploaded.\n" +
      "- Bounded reads\n" +
      "- Bounded writes\n" +
      "Limit\tValue\n" +
      "Memory\t250 MiB\n",
  );
  expect(output).not.toContain("Hidden title");
  expect(output).not.toContain("upload(\"never\")");
});

test("rejects unsupported HTML entities and deletes partial output", async () => {
  await selectFixture(
    "fixtures/documents/unsupported-entity.html",
    "html-to-txt",
  );
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const state = await currentState();
  expect(state.error).toContain("Unsupported HTML entity");
  expect(state.opfsName).toBeNull();
});

test("rejects invalid subtitle timing and deletes partial output", async () => {
  await selectFixture(
    "fixtures/subtitles/invalid-time.srt",
    "srt-to-vtt",
  );
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const state = await currentState();
  expect(state.error).toContain("later than");
  expect(state.opfsName).toBeNull();
});

test("streams ASS dialogue to SRT with explicit style loss", async () => {
  await selectFixture("fixtures/subtitles/sample.ass", "ass-to-srt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("1\r\n00:00:01,250 --> 00:00:03,900\r\n");
  expect(output).toContain("[Narrator] Hello\r\nfrom Within, safely.");
  expect(output).not.toContain("\\i1");
  expect(state.warnings.join(" ")).toContain("ASS styles");
});

test("streams ASS dialogue to WebVTT and preserves a speaker label", async () => {
  await selectFixture("fixtures/subtitles/sample.ass", "ass-to-vtt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output.startsWith("WEBVTT\r\n\r\n")).toBe(true);
  expect(output).toContain("00:00:01.250 --> 00:00:03.900");
  expect(output).toContain("<v Narrator>Hello\r\nfrom Within, safely.");
});

test("streams quoted CSV records to NDJSON", async () => {
  await selectFixture("fixtures/data/sample.csv", "csv-to-ndjson");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  const rows = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(rows).toEqual([
    { name: "alpha", note: 'comma, quote "and" newline\ninside', count: "2" },
    { name: "βeta", note: "Unicode survives", count: "3" },
  ]);
});

test("streams quoted CSV records to TSV", async () => {
  await selectFixture("fixtures/data/sample.csv", "csv-to-tsv");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("name\tnote\tcount\r\n");
  expect(output).toContain(
    "alpha\t\"comma, quote \"\"and\"\" newline\ninside\"\t2\r\n",
  );
});

test("streams TSV records to CSV", async () => {
  await selectFixture("fixtures/data/sample.tsv", "tsv-to-csv");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("name,note,count\r\n");
  expect(output).toContain("βeta,Unicode survives,3\r\n");
});

test("streams TSV records to NDJSON", async () => {
  await selectFixture("fixtures/data/sample.tsv", "tsv-to-ndjson");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  const rows = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(rows[1]).toEqual({
    name: "βeta",
    note: "Unicode survives",
    count: "3",
  });
});

test("streams NDJSON objects to TSV", async () => {
  await selectFixture("fixtures/data/sample.ndjson", "ndjson-to-tsv");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("name\tnote\tcount\r\n");
  expect(output).toContain("βeta\tUnicode survives\t3\r\n");
});

test("streams NDJSON objects to CSV", async () => {
  await selectFixture("fixtures/data/sample.ndjson", "ndjson-to-csv");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("name,note,count\r\n");
  expect(output).toContain(
    "alpha,\"comma, quote \"\"and\"\" newline\ninside\",2\r\n",
  );
});

test("streams an NDJSON sequence to a valid JSON array", async () => {
  await selectFixture("fixtures/data/sample.ndjson", "ndjson-to-json");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  const values = JSON.parse(output);
  expect(values).toHaveLength(2);
  expect(values[0].note).toContain("newline\ninside");
  expect(values[1].name).toBe("βeta");
});

test("streams a JSON array to NDJSON with nested values intact", async () => {
  await selectFixture("fixtures/data/sample.json", "json-to-ndjson");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  const values = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(values).toEqual([
    { id: 1, nested: { enabled: true }, tags: ["a", "b"] },
    { id: 2, text: "comma, bracket ] and escaped quote \"" },
  ]);
});

test("streams XML to ordered NDJSON structural events", async () => {
  await selectFixture("fixtures/data/sample.xml", "xml-to-ndjson");
  const state = await convert();
  expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(state.warnings.some((warning) => warning.includes("structural events"))).toBe(
    true,
  );
  const output = await readAndDeleteOpfsText(state.opfsName!);
  const events = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  expect(events[0]).toEqual({ type: "startDocument" });
  expect(events.at(-1)).toEqual({ type: "endDocument" });
  expect(events.find((event) => event.type === "declaration")).toEqual({
    type: "declaration",
    version: "1.0",
    encoding: "UTF-8",
    standalone: "yes",
  });
  expect(events.find((event) => event.type === "processingInstruction")).toEqual({
    type: "processingInstruction",
    target: "within",
    data: 'privacy="local"',
  });
  expect(events.find((event) => event.type === "comment")?.value).toBe(
    " deterministic XML fixture ",
  );
  expect(
    events
      .filter((event) => event.type === "startElement")
      .map((event) => ({ name: event.name, selfClosing: event.selfClosing })),
  ).toEqual([
    { name: "catalog", selfClosing: false },
    { name: "item", selfClosing: false },
    { name: "empty", selfClosing: true },
    { name: "item", selfClosing: false },
  ]);
  expect(
    events.find(
      (event) => event.type === "startElement" && event.name === "catalog",
    )?.attributes,
  ).toEqual([
    { name: "xmlns", value: "urn:within:catalog" },
    { name: "xml:lang", value: "en" },
  ]);
  expect(
    events.find(
      (event) => event.type === "startElement" && event.name === "empty",
    )?.attributes,
  ).toEqual([{ name: "mark", value: "✓" }]);
  expect(
    events
      .filter((event) => event.type === "text" && event.value.trim())
      .map((event) => ({ value: event.value, cdata: event.cdata ?? false })),
  ).toEqual([
    { value: "Alpha & Beta", cdata: false },
    { value: " <local> ", cdata: true },
    { value: "café", cdata: false },
  ]);

  const stack: string[] = [];
  for (const event of events) {
    if (event.type === "startElement" && !event.selfClosing) stack.push(event.name);
    if (event.type === "endElement") expect(stack.pop()).toBe(event.name);
  }
  expect(stack).toEqual([]);
});

test("rejects XML DTDs and deletes the partial OPFS output", async () => {
  await selectFixture("fixtures/data/unsafe-doctype.xml", "xml-to-ndjson");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const state = await currentState();
  expect(state.error).toContain("DTDs");
  expect(state.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-xml-to-ndjson")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("rejects malformed JSON and deletes its partial OPFS output", async () => {
  await selectFixture(
    "fixtures/data/invalid-trailing.json",
    "json-to-ndjson",
  );
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const state = await currentState();
  expect(state.error).toContain("trailing comma");
  expect(state.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-json-to-ndjson")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

for (const fault of [
  {
    id: "write",
    title: "propagates an output-write failure and deletes the partial output",
    message: "destination rejected a bounded write",
  },
  {
    id: "quota",
    title: "propagates OPFS quota exhaustion and deletes the partial output",
    message: "ran out of quota after a bounded write",
  },
  {
    id: "permission",
    title: "propagates revoked destination permission and deletes the partial output",
    message: "permission was revoked after a bounded write",
  },
]) {
  test(fault.title, async () => {
    await openFaultMode(fault.id);
    await selectFixture("fixtures/documents/sample.txt", "txt-to-html");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error?.toLowerCase()).toContain(fault.message);
    expect(state.opfsName).toBeNull();
    await expect
      .poll(
        async () =>
          (
            await appOwnedOpfsNames("within-test-txt-to-html")
          ).length,
        { timeout: 15_000 },
      )
      .toBe(0);
  });

  test(`${fault.title} through the asynchronous direct-save adapter`, async () => {
    const outputName = "sample.html";
    await openFaultMode(fault.id, "direct");
    await removeOpfsEntryAndReportSize(outputName);
    try {
      await selectFixture("fixtures/documents/sample.txt", "txt-to-html");
      await page.locator('[data-testid="convert-button"]').click();
      await expect
        .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
        .toBe("error");
      const state = await currentState();
      expect(state.error?.toLowerCase()).toContain(fault.message);
      expect(state.opfsName).toBeNull();
      expect(state.batchOutputNames).toEqual([outputName]);
      expect(state.metrics?.pendingOperations).toBe(0);
      expect(state.metrics?.queuedBytes).toBe(0);
      expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
      expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
      const abandonedSize = await removeOpfsEntryAndReportSize(outputName);
      expect(abandonedSize).toBe(0);
    } finally {
      await removeOpfsEntryAndReportSize(outputName);
    }
  });
}

test("recovers from a worker crash and removes its abandoned partial output", async () => {
  await openFaultMode("worker-crash");
  await selectFixture("fixtures/documents/sample.txt", "txt-to-html");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const failed = await currentState();
  expect(failed.error).toContain("Injected conversion worker crash");
  expect(failed.opfsName).toBeNull();
  await expect
    .poll(
      async () =>
        (await appOwnedOpfsNames("within-test-txt-to-html")).length,
      { timeout: 15_000 },
    )
    .toBe(0);
  await expect
    .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
    .toBe("ready");
});

test("reload removes an abandoned app-owned output and preserves unrelated storage", async () => {
  await page.goto("/?test=1&cleanup=1");
  await expect
    .poll(async () => (await currentState()).startupCleanupComplete, {
      timeout: 15_000,
    })
    .toBe(true);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const sentinel = await root.getFileHandle("user-owned-sentinel.txt", {
      create: true,
    });
    const writable = await sentinel.createWritable();
    await writable.write("preserve me\n");
    await writable.close();
  });

  await page
    .locator('[data-testid="file-input"]')
    .setInputFiles(cancellationFixturePath);
  await page
    .locator('[data-testid="format-select"]')
    .selectOption("ndjson-to-json");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).metrics?.inputBytes ?? 0, {
      timeout: 30_000,
    })
    .toBeGreaterThan(1024 * 1024);
  await expect
    .poll(async () => (await appOwnedOpfsNames("within-test-ndjson-to-json")).length)
    .toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(async () => (await currentState()).startupCleanupComplete, {
      timeout: 15_000,
    })
    .toBe(true);
  await expect
    .poll(async () => (await appOwnedOpfsNames("within-test-ndjson-to-json")).length, {
      timeout: 15_000,
    })
    .toBe(0);
  const sentinel = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle("user-owned-sentinel.txt");
    const text = await (await handle.getFile()).text();
    await root.removeEntry("user-owned-sentinel.txt");
    return text;
  });
  expect(sentinel).toBe("preserve me\n");
  await expect
    .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
    .toBe("ready");
});

test("cancels a large streaming conversion and deletes its partial output", async () => {
  await page
    .locator('[data-testid="file-input"]')
    .setInputFiles(cancellationFixturePath);
  await page
    .locator('[data-testid="format-select"]')
    .selectOption("ndjson-to-json");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => {
      const state = await currentState();
      return state.jobState === "running"
        ? (state.metrics?.inputBytes ?? 0)
        : -1;
    }, { timeout: 30_000 })
    .toBeGreaterThan(1024 * 1024);
  await page.getByRole("button", { name: "Cancel safely" }).click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("cancelled");
  const state = await currentState();
  expect(state.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-ndjson-to-json")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

test("cancels a direct-save conversion, releases its lock, and deletes the partial file", async () => {
  const outputName = "cancellation-source.json";
  await page.goto("/?test=1&directory=1");
  await expect
    .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
    .toBe("ready");
  await removeOpfsEntryAndReportSize(outputName);

  try {
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(cancellationFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("ndjson-to-json");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => {
        const state = await currentState();
        return state.jobState === "running"
          ? (state.metrics?.outputBytes ?? 0)
          : -1;
      }, { timeout: 30_000 })
      .toBeGreaterThan(1024 * 1024);

    await page.getByRole("button", { name: "Cancel safely" }).click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("cancelled");

    const state = await currentState();
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.outputBytes).toBeGreaterThan(1024 * 1024);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(await removeOpfsEntryAndReportSize(outputName)).toBe(0);

    const lockReleased = await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(entryName, { create: true });
      const writable = await handle.createWritable({ keepExistingData: false });
      await writable.close();
      await root.removeEntry(entryName);
      return true;
    }, outputName);
    expect(lockReleased).toBe(true);
    await expect
      .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
      .toBe("ready");
  } finally {
    await removeOpfsEntryAndReportSize(outputName);
  }
});

test("compresses a file with browser GZIP and verifies it in-browser", async () => {
  await selectFixture("fixtures/data/sample.csv", "gzip-compress");
  const state = await convert();
  const output = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const compressed = await handle.getFile();
    const text = await new Response(
      compressed.stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
    await root.removeEntry(opfsName);
    return { text, compressedBytes: compressed.size };
  }, state.opfsName!);
  expect(output.text).toContain("Unicode survives");
  expect(output.compressedBytes).toBeGreaterThan(20);
});

test("decompresses browser GZIP without buffering the output", async () => {
  await selectFixture(
    "fixtures/compression/sample.txt.gz",
    "gzip-decompress",
  );
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toBe(
    "Within deterministic GZIP fixture.\n" +
      "Unicode: β, हिन्दी, 日本語.\n" +
      "The decompressed bytes must match exactly.\n",
  );
});

test("compresses a valid TAR archive to TAR.GZ with bounded writes", async () => {
  await selectFixture("fixtures/archives/sample.tar", "tar-to-tar-gz");
  const state = await convert();
  const result = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const compressed = await handle.getFile();
    const tar = await new Response(
      compressed.stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
    const bytes = new Uint8Array(tar);
    const signature = new TextDecoder().decode(bytes.subarray(257, 262));
    await root.removeEntry(opfsName);
    return { bytes: bytes.byteLength, signature };
  }, state.opfsName!);
  expect(result.bytes).toBeGreaterThan(2_000);
  expect(result.signature).toBe("ustar");
});

test("decompresses TAR.GZ to a structurally valid TAR archive", async () => {
  await selectFixture("fixtures/archives/sample.tar.gz", "tar-gz-to-tar");
  const state = await convert();
  const result = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const archive = await handle.getFile();
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const signature = new TextDecoder().decode(bytes.subarray(257, 262));
    await root.removeEntry(opfsName);
    return { bytes: bytes.byteLength, signature };
  }, state.opfsName!);
  expect(result.bytes).toBeGreaterThan(2_000);
  expect(result.signature).toBe("ustar");
});

test("validates and preserves a 1,024-entry TAR without entry buffering", async () => {
  await selectFixture(
    "fixtures/archives/many-entries.tar.gz",
    "tar-gz-to-tar",
  );
  const state = await convert();
  const result = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const archive = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    let entries = 0;
    let offset = 0;
    while (offset + 512 <= archive.byteLength) {
      const header = archive.subarray(offset, offset + 512);
      if (header.every((value) => value === 0)) break;
      const sizeText = new TextDecoder()
        .decode(header.subarray(124, 136))
        .replace(/\0.*$/, "")
        .trim();
      const size = Number.parseInt(sizeText, 8);
      entries += 1;
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    await root.removeEntry(opfsName);
    return { bytes: archive.byteLength, entries };
  }, state.opfsName!);
  expect(result.bytes).toBe(1_049_600);
  expect(result.entries).toBe(1_024);
});

test("converts ZIP to USTAR with CRC validation and Unicode names", async () => {
  await selectFixture("fixtures/archives/sample.zip", "zip-to-tar");
  const state = await convert();
  expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  const entries = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    const decoder = new TextDecoder();
    const results: Array<{ name: string; text: string }> = [];
    let offset = 0;
    while (offset + 512 <= bytes.byteLength) {
      const header = bytes.subarray(offset, offset + 512);
      if (header.every((value) => value === 0)) break;
      const readField = (start: number, end: number) =>
        decoder.decode(header.subarray(start, end)).replace(/\0.*$/, "");
      const name = readField(0, 100);
      const prefix = readField(345, 500);
      const fullName = prefix ? `${prefix}/${name}` : name;
      const size = Number.parseInt(readField(124, 136).trim(), 8);
      const payload = bytes.subarray(offset + 512, offset + 512 + size);
      results.push({ name: fullName, text: decoder.decode(payload) });
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    await root.removeEntry(opfsName);
    return results;
  }, state.opfsName!);
  expect(entries).toEqual([
    { name: "hello.txt", text: "Within archive fixture.\n" },
    {
      name: "nested/data.json",
      text: '{"private":true,"uploadBytes":0}\n',
    },
    {
      name: "nested/unicode-café.txt",
      text: "Private Unicode archive entry.\n",
    },
  ]);
});

test("converts ZIP directly to TAR.GZ with bounded nested streams", async () => {
  await selectFixture("fixtures/archives/sample.zip", "zip-to-tar-gz");
  const state = await convert();
  expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  const entries = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const compressed = await handle.getFile();
    const bytes = new Uint8Array(
      await new Response(
        compressed.stream().pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer(),
    );
    const decoder = new TextDecoder();
    const results: Array<{ name: string; text: string }> = [];
    let offset = 0;
    while (offset + 512 <= bytes.byteLength) {
      const header = bytes.subarray(offset, offset + 512);
      if (header.every((value) => value === 0)) break;
      const readField = (start: number, end: number) =>
        decoder.decode(header.subarray(start, end)).replace(/\0.*$/, "");
      const name = readField(0, 100);
      const prefix = readField(345, 500);
      const fullName = prefix ? `${prefix}/${name}` : name;
      const size = Number.parseInt(readField(124, 136).trim(), 8);
      const payload = bytes.subarray(offset + 512, offset + 512 + size);
      results.push({ name: fullName, text: decoder.decode(payload) });
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    await root.removeEntry(opfsName);
    return results;
  }, state.opfsName!);
  expect(entries).toEqual([
    { name: "hello.txt", text: "Within archive fixture.\n" },
    {
      name: "nested/data.json",
      text: '{"private":true,"uploadBytes":0}\n',
    },
    {
      name: "nested/unicode-caf\u00e9.txt",
      text: "Private Unicode archive entry.\n",
    },
  ]);
});

test("converts a 1,024-entry ZIP directly to TAR.GZ", async () => {
  await selectFixture(
    "fixtures/archives/many-entries.zip",
    "zip-to-tar-gz",
  );
  const state = await convert();
  const entryCount = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const compressed = await handle.getFile();
    const archive = new Uint8Array(
      await new Response(
        compressed.stream().pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer(),
    );
    let entries = 0;
    let offset = 0;
    while (offset + 512 <= archive.byteLength) {
      const header = archive.subarray(offset, offset + 512);
      if (header.every((value) => value === 0)) break;
      const sizeText = new TextDecoder()
        .decode(header.subarray(124, 136))
        .replace(/\0.*$/, "")
        .trim();
      const size = Number.parseInt(sizeText, 8);
      entries += 1;
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    await root.removeEntry(opfsName);
    return entries;
  }, state.opfsName!);
  expect(entryCount).toBe(1_024);
});

test("converts USTAR to a valid ZIP with streamed DEFLATE entries", async () => {
  await selectFixture("fixtures/archives/sample.tar", "tar-to-zip");
  const state = await convert();
  expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  const entries = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    const view = new DataView(bytes.buffer);
    let endOffset = bytes.byteLength - 22;
    while (endOffset >= 0 && view.getUint32(endOffset, true) !== 0x06054b50) {
      endOffset -= 1;
    }
    if (endOffset < 0) throw new Error("ZIP end record is missing.");
    const entryCount = view.getUint16(endOffset + 10, true);
    let directoryOffset = view.getUint32(endOffset + 16, true);
    const decoder = new TextDecoder();
    const results: Array<{ name: string; text: string }> = [];
    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(directoryOffset, true) !== 0x02014b50) {
        throw new Error("ZIP central header is invalid.");
      }
      const method = view.getUint16(directoryOffset + 10, true);
      const compressedSize = view.getUint32(directoryOffset + 20, true);
      const nameLength = view.getUint16(directoryOffset + 28, true);
      const extraLength = view.getUint16(directoryOffset + 30, true);
      const commentLength = view.getUint16(directoryOffset + 32, true);
      const localOffset = view.getUint32(directoryOffset + 42, true);
      const name = decoder.decode(
        bytes.subarray(directoryOffset + 46, directoryOffset + 46 + nameLength),
      );
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      const payload =
        method === 8
          ? new Uint8Array(
              await new Response(
                new Blob([compressed]).stream().pipeThrough(
                  new DecompressionStream("deflate-raw" as CompressionFormat),
                ),
              ).arrayBuffer(),
            )
          : compressed;
      results.push({ name, text: decoder.decode(payload) });
      directoryOffset += 46 + nameLength + extraLength + commentLength;
    }
    await root.removeEntry(opfsName);
    return results;
  }, state.opfsName!);
  expect(entries).toEqual([
    { name: "hello.txt", text: "Within archive fixture.\n" },
    {
      name: "nested/data.json",
      text: '{"private":true,"uploadBytes":0}\n',
    },
    {
      name: "nested/unicode-café.txt",
      text: "Private Unicode archive entry.\n",
    },
  ]);
});

test("converts TAR.GZ directly to ZIP with bounded nested streams", async () => {
  await selectFixture("fixtures/archives/sample.tar.gz", "tar-gz-to-zip");
  const state = await convert();
  expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  const entries = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    const view = new DataView(bytes.buffer);
    let endOffset = bytes.byteLength - 22;
    while (endOffset >= 0 && view.getUint32(endOffset, true) !== 0x06054b50) {
      endOffset -= 1;
    }
    if (endOffset < 0) throw new Error("ZIP end record is missing.");
    const entryCount = view.getUint16(endOffset + 10, true);
    let directoryOffset = view.getUint32(endOffset + 16, true);
    const decoder = new TextDecoder();
    const results: Array<{ name: string; text: string }> = [];
    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(directoryOffset, true) !== 0x02014b50) {
        throw new Error("ZIP central header is invalid.");
      }
      const method = view.getUint16(directoryOffset + 10, true);
      const compressedSize = view.getUint32(directoryOffset + 20, true);
      const nameLength = view.getUint16(directoryOffset + 28, true);
      const extraLength = view.getUint16(directoryOffset + 30, true);
      const commentLength = view.getUint16(directoryOffset + 32, true);
      const localOffset = view.getUint32(directoryOffset + 42, true);
      const name = decoder.decode(
        bytes.subarray(directoryOffset + 46, directoryOffset + 46 + nameLength),
      );
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      const payload =
        method === 8
          ? new Uint8Array(
              await new Response(
                new Blob([compressed]).stream().pipeThrough(
                  new DecompressionStream("deflate-raw" as CompressionFormat),
                ),
              ).arrayBuffer(),
            )
          : compressed;
      results.push({ name, text: decoder.decode(payload) });
      directoryOffset += 46 + nameLength + extraLength + commentLength;
    }
    await root.removeEntry(opfsName);
    return results;
  }, state.opfsName!);
  expect(entries).toEqual([
    { name: "hello.txt", text: "Within archive fixture.\n" },
    {
      name: "nested/data.json",
      text: '{"private":true,"uploadBytes":0}\n',
    },
    {
      name: "nested/unicode-caf\u00e9.txt",
      text: "Private Unicode archive entry.\n",
    },
  ]);
});

test("converts a 1,024-entry TAR.GZ directly to ZIP", async () => {
  await selectFixture(
    "fixtures/archives/many-entries.tar.gz",
    "tar-gz-to-zip",
  );
  const state = await convert();
  const entryCount = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    const view = new DataView(bytes.buffer);
    let endOffset = bytes.byteLength - 22;
    while (endOffset >= 0 && view.getUint32(endOffset, true) !== 0x06054b50) {
      endOffset -= 1;
    }
    if (endOffset < 0) throw new Error("ZIP end record is missing.");
    const entries = view.getUint16(endOffset + 10, true);
    await root.removeEntry(opfsName);
    return entries;
  }, state.opfsName!);
  expect(entryCount).toBe(1_024);
});

for (const [fixture, profileId, expectedError] of [
  ["fixtures/archives/unsafe-entry.tar", "tar-to-tar-gz", "Unsafe TAR entry"],
  ["fixtures/archives/unsafe-entry.tar.gz", "tar-gz-to-tar", "Unsafe TAR entry"],
  ["fixtures/archives/unsafe-entry.zip", "zip-to-tar", "Unsafe ZIP entry"],
  ["fixtures/archives/unsafe-entry.zip", "zip-to-tar-gz", "Unsafe ZIP entry"],
  ["fixtures/archives/unsafe-entry.tar.gz", "tar-gz-to-zip", "Unsafe TAR entry"],
] as const) {
  test(`${profileId} rejects traversal entries and deletes partial output`, async () => {
    await selectFixture(fixture, profileId);
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error).toContain(expectedError);
    expect(state.opfsName).toBeNull();
    const leftovers = await page.evaluate(async (route) => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith(`within-test-${route}`)) names.push(name);
      }
      return names;
    }, profileId);
    expect(leftovers).toEqual([]);
  });
}

for (const [fixture, profileId] of [
  ["fixtures/archives/sample.zip", "zip-to-tar-gz"],
  ["fixtures/archives/sample.tar.gz", "tar-gz-to-zip"],
] as const) {
  test(`${profileId} propagates a nested output failure and cleans up`, async () => {
    await openFaultMode("write");
    await selectFixture(fixture, profileId);
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error?.toLowerCase()).toContain(
      "destination rejected a bounded write",
    );
    expect(state.opfsName).toBeNull();
    await expect
      .poll(
        async () =>
          (await appOwnedOpfsNames(`within-test-${profileId}`)).length,
        { timeout: 15_000 },
      )
      .toBe(0);
  });
}
