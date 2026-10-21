import { defineConfig } from "@playwright/test";
import standard from "./playwright.config";
process.env.WITHIN_PRIVATE_VPX_QUALIFICATION = "1";
export default defineConfig({ ...standard, testMatch: "vpx-decoder-qualification.spec.ts", timeout: 120_000,
  metadata: { privateVpxQualification: true },
  webServer: undefined, reporter: [["line"]], outputDir: "output/playwright/vpx-qualification-artifacts",
  use: { ...standard.use, headless: true, trace: "off", screenshot: "off", video: "off" } });
