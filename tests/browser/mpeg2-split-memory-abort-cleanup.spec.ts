import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { cancelBrowserConversionBeforeCleanup } from "../../scripts/lib/cancel-browser-conversion-before-cleanup.mjs";

const root = path.resolve(import.meta.dirname, "../.."), exec = promisify(execFile);
let fixtureDirectory: string;
const ownership: Array<{ closed: boolean; activePackets: number | null; aggregateWasmMemoryBytes: number }> = [];
const forbidden: string[] = [];
test.use({ channel: "chrome", serviceWorkers: "block" });

test.beforeAll(async () => {
  fixtureDirectory = await mkdtemp(path.join(root, "work/mpeg2-memory-abort-fixture-"));
  // Native tool creates ONLY a deterministic fixture, never the conversion.
  await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=20",
    "-c:v", "libx265", "-preset", "ultrafast", "-crf", "18", "-threads:v", "1",
    "-x265-params", "pools=none:frame-threads=1:wpp=0:bframes=2:keyint=48:scenecut=0:log-level=error",
    path.join(fixtureDirectory, "source.mkv")], { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  expect((await stat(path.join(fixtureDirectory, "source.mkv"))).size).toBeLessThan(16 * 1024 * 1024);
});

test.afterAll(async () => {
  if (fixtureDirectory) {
    expect(path.dirname(fixtureDirectory)).toBe(path.join(root, "work"));
    await rm(fixtureDirectory, { recursive: true });
  }
});

test("memory observer failure cancels the real active split codec before removing its locked OPFS stage", async ({ page, context }) => {
  page.on("console", message => {
    const text = message.text(), prefix = "WITHIN_MPEG2_SPLIT_FINAL ";
    if (text.startsWith(prefix) && text.length < 2048 && ownership.length < 4) ownership.push(JSON.parse(text.slice(prefix.length)));
  });
  const origin = process.env.WITHIN_TEST_BASE_URL!;
  context.on("request", request => {
    if ((new URL(request.url()).origin !== origin || !["GET", "HEAD"].includes(request.method()) || request.postData()) && forbidden.length < 16)
      forbidden.push(`${request.method()} ${request.url()}`);
  });
  let outcome;
  try {
    await page.goto("/?test=1&directory=1");
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
    await page.locator('[data-testid="file-input"]').setInputFiles(path.join(fixtureDirectory, "source.mkv"));
    await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
    await page.locator('[data-testid="convert-button"]').click();
    await page.waitForFunction(() => {
      const state = window.__WITHIN_TEST__?.getState();
      return state?.jobState === "running" && state.metrics?.wasmMemoryBytes === 50331648;
    });
    // Inject ONLY the parent observer's failure, not a codec or writer bypass.
    // This verifies cleanup ordering; it does NOT measure/certify250MiB memory.
    throw new Error("Synthetic parent memory-guard failure");
  } catch (error) {
    expect(String(error)).toContain("Synthetic parent memory-guard failure");
  } finally {
    outcome = await cancelBrowserConversionBeforeCleanup(page);
    await page.evaluate(async () => {
      const directory = await navigator.storage.getDirectory();
      for await (const [name] of directory.entries()) await directory.removeEntry(name, { recursive: true });
      const remaining = []; for await (const [name] of directory.entries()) remaining.push(name);
      if (remaining.length) throw new Error("OPFS stage did not quiesce");
    });
  }
  expect(outcome.cancellationRequested).toBe(true); expect(outcome.terminalState).toBe("cancelled");
  expect(ownership).toHaveLength(1); expect(ownership[0].closed).toBe(true); expect(ownership[0].activePackets).toBe(0);
  expect(ownership[0].aggregateWasmMemoryBytes).toBe(50331648); expect(forbidden).toEqual([]);
  await mkdir(path.join(root, "output/playwright"), { recursive: true });
  await writeFile(path.join(root, `output/playwright/${new Date().toISOString().replaceAll(":", "-")}-mpeg2-memory-abort-cleanup.json`),
    JSON.stringify({ scope: "real-codec-cleanup-after-synthetic-parent-memory-failure-not-memory-acceptance", outcome, ownership,
      forbidden, removedLockedOpfsWithoutError: true, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
});
