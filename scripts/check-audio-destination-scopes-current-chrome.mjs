// Run the existing audited small suite, with current installed Chrome and owned temp.
// Never converts natively, touches the protected original or measures acceptance memory.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const reportRoot = path.join(root, "output/playwright");
const proof = path.join(root, "evidence/audio-destination-scopes-current-chrome-2026-10-08.json");
await assert.rejects(access(proof), { code: "ENOENT" });
await access("C:/Program Files/Google/Chrome/Application/chrome.exe");
const { stdout } = await execute("powershell", ["-NoProfile", "-Command",
  "Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json -Compress"],
{ windowsHide: true, timeout: 10000, maxBuffer: 4096 });
const host = JSON.parse(stdout);
assert.ok(host.FreePhysicalMemory * 1024 >= 2 * 1073741824);
assert.ok(host.FreeVirtualMemory * 1024 >= 2 * 1073741824);
const before = new Set(await readdir(reportRoot));
const pins = {};
for (const file of ["scripts/check-audio-destination-scopes-current-chrome.mjs", "playwright.config.ts",
  "tests/browser/audio-destination-scopes.spec.ts", "scripts/lib/scoped-audio-tag-validation.mjs",
  "scripts/lib/scoped-audio-tag-validation.d.mts"])
  pins[file] = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
const runtime = await createOwnedRuntimeScratch("audio-scope-current-chrome-");
let exitCode = null, failure = null;
const startedAt = new Date().toISOString();
try {
  const config = path.join(runtime.directory, "config.mjs");
  await writeFile(config, `import prior from ${JSON.stringify(pathToFileURL(path.join(root, "playwright.config.ts")).href)};
export default {...prior, testDir:${JSON.stringify(path.join(root, "tests/browser"))},
outputDir:${JSON.stringify(path.join(runtime.directory, "artifacts"))}, reporter:[["line"]],
use:{...prior.use,video:"off",trace:"off",screenshot:"off"},
webServer:{...prior.webServer,cwd:${JSON.stringify(root)}}};\n`, { flag: "wx" });
  const child = spawn(process.execPath, [path.join(root, "node_modules/@playwright/test/cli.js"), "test",
    "tests/browser/audio-destination-scopes.spec.ts", "--config", config], { cwd: root, windowsHide: true,
    stdio: "inherit", env: { ...runtime.env, WITHIN_BROWSER_CHANNEL: "chrome", WITHIN_TEST_VIDEO: "off",
      npm_config_cache: path.join(runtime.directory, "npm-cache"), WRANGLER_SEND_METRICS: "false",
      NEXT_TELEMETRY_DISABLED: "1" } });
  exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject); child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Browser suite terminated by ${signal}`)); else resolve(code);
    });
  });
} catch (error) { failure = String(error).slice(0, 2048); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const files = (await readdir(reportRoot)).filter(file => !before.has(file) &&
  /^audio-destination-scopes-[a-z0-9-]+-[0-9a-f-]{36}\.json$/.test(file));
const rows = [];
for (const file of files) {
  const bytes = await readFile(path.join(reportRoot, file)); assert.ok(bytes.length <= 256 * 1024);
  const result = JSON.parse(bytes);
  rows.push({ path: `output/playwright/${file}`, sha256: createHash("sha256").update(bytes).digest("hex"),
    profileId: result.profileId, browser: result.browser, status: result.status,
    opfsCleanupVerified: result.opfsCleanupVerified ?? null,
    ownedFixturesAndOutputsRemoved: result.ownedFixturesAndOutputsRemoved ?? null,
    sourcePinsUnchanged: result.sourcePinsUnchanged ?? null, fullIndependentDecode: result.fullIndependentDecode ?? null,
    failure: result.failure ?? null });
}
const passed = exitCode === 0 && failure === null && rows.length === 8 && rows.every(row =>
  row.status === "passed-small-destination-scope-check" && row.opfsCleanupVerified === true &&
  row.ownedFixturesAndOutputsRemoved === true && row.sourcePinsUnchanged === true && row.fullIndependentDecode === "passed");
for (const [file, hash] of Object.entries(pins))
  assert.equal(createHash("sha256").update(await readFile(path.join(root, file))).digest("hex"), hash);
await writeFile(proof, JSON.stringify({ startedAt, endedAt: new Date().toISOString(),
  status: passed ? "passed-eight-current-installed-chrome-small-scope-checks" : "failed-or-incomplete",
  exitCode, failure, hostPreflight: host, sourcePins: pins, reports: rows,
  ownedRuntime: runtime.directory, ownedRuntimeRemoved: true,
  scope: "Existing production-browser suite, exact common Unicode destination tags and independent full decode only",
  protectedOriginalRead: false, nativeConverterUsed: false, noDocker: true,
  completeChromiumMemoryAcceptance: false, scalingAcceptance: false, lossyQualityAcceptance: false,
  artworkAcceptance: false, speedupAcceptance: false, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ passed, conversionsReported: rows.length, runtimeRemoved: true, proof }));
assert.ok(passed, "Current-Chrome gate failed/incomplete; retain proof and diagnose before retry");
