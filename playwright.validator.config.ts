import { defineConfig } from "@playwright/test";

// Test-runner scheduling control only: no server, browser, media or native codec.
export default defineConfig({ testDir: "./tests/browser", testMatch: "native-validator-fairness.spec.ts",
  workers: 1, fullyParallel: false, retries: 0, timeout: 60000, reporter: [["line"]],
  outputDir: "output/playwright/native-validator-fairness", use: { headless: true, trace: "off", screenshot: "off", video: "off" } });
