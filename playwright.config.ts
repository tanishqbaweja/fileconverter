import { defineConfig } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run build && wrangler dev --config dist/server/wrangler.json --port 3000",
    url: "http://127.0.0.1:3000",
    env: {
      WRANGLER_SEND_METRICS: "false",
    },
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
