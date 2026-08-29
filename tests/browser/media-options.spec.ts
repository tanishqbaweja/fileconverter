import { expect, test } from "@playwright/test";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const wavFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.wav",
);

test.use({ channel: "chrome" });

test("MP3 controls update the bounded native conversion request and plan", async ({
  page,
}) => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(wavFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("wav-to-mp3");

  const bitrate = page.locator('[data-testid="audio-bitrate-select"]');
  const sampleRate = page.locator('[data-testid="audio-sample-rate-select"]');
  const channels = page.locator('[data-testid="audio-channels-select"]');
  await expect(bitrate).toHaveValue("0");
  await expect(sampleRate).toHaveValue("0");
  await expect(channels).toHaveValue("0");

  await bitrate.selectOption("256000");
  await sampleRate.selectOption("44100");
  await channels.selectOption("1");

  await expect(page.locator('[data-testid="media-conversion-plan"]')).toContainText(
    "256 kb/s",
  );
  await expect(page.locator('[data-testid="media-conversion-plan"]')).toContainText(
    "44,100 Hz",
  );
  await expect(page.locator('[data-testid="media-conversion-plan"]')).toContainText(
    "mono",
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().audioOptions),
    )
    .toEqual({ bitRateBps: 256_000, sampleRateHz: 44_100, channels: 1 });

  await page.locator('[data-testid="format-select"]').selectOption("wav-to-flac");
  await expect(bitrate).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().audioOptions),
    )
    .toEqual({ bitRateBps: 0, sampleRateHz: 0, channels: 0 });
});
