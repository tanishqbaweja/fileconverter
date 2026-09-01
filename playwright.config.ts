import { defineConfig } from "@playwright/test";

const testPort = Number.parseInt(process.env.WITHIN_TEST_PORT ?? "3000", 10);
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const captureVideo =
  process.env.WITHIN_TEST_VIDEO === "off" ? "off" : "retain-on-failure";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"], ["html", { outputFolder: "output/playwright/report", open: "never" }]],
  outputDir: "output/playwright/artifacts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: captureVideo,
  },
  webServer: {
    command:
      `npm run build && wrangler dev --config dist/server/wrangler.json --port ${testPort}`,
    url: baseURL,
    env: {
      WRANGLER_SEND_METRICS: "false",
    },
    reuseExistingServer: process.env.WITHIN_REUSE_SERVER === "1",
    timeout: 120_000,
  },
});
