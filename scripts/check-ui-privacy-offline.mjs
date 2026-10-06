// Execute the original three focused tests, changing only fresh owned paths/root.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile), sha = value => createHash("sha256").update(value).digest("hex");
const selected = ["functional browser capability probes pass in production Chrome", "conversion transmits no filename or file content", "installed app shell loads offline without eagerly downloading engines"];
let runtime, server, runner, result, error = null;
const stop = async child => {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return;
  await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
};
const source = await readFile(path.join(root, "tests/browser/privacy-offline.spec.ts"), "utf8");
const sourcePins = {};
for (const file of ["tests/browser/privacy-offline.spec.ts", "app/converter/ConverterApp.tsx", "scripts/check-ui-privacy-offline.mjs", "scripts/lib/owned-runtime-scratch.mjs"])
  sourcePins[file] = sha(await readFile(path.join(root, file)));
try {
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
  await access(path.join(root, "fixtures/data/sample.csv"));
  runtime = await createOwnedRuntimeScratch("ui-privacy-offline-");
  const port = await new Promise((resolve, reject) => { const socket = createServer(); socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const value = socket.address().port; socket.close(e => e ? reject(e) : resolve(value)); }); });
  const origin = `http://127.0.0.1:${port}`, env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", WITHIN_TEST_BASE_URL: origin,
    WITHIN_TEST_PORT: String(port), PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(runtime.directory, "result.json") };
  const changes = [
    ['const projectRoot = path.resolve(import.meta.dirname, "..", "..");', `const projectRoot = ${JSON.stringify(root)};`],
    ['const profileRoot = path.join(projectRoot, "work", "playwright-profile-privacy");', `const profileRoot = ${JSON.stringify(path.join(runtime.directory, "profile"))};`],
  ];
  let generated = source;
  for (const [before, after] of changes) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of changes) reverse = reverse.replace(after, before); assert.equal(reverse, source);
  await writeFile(path.join(runtime.directory, "privacy.spec.ts"), generated, { flag: "wx" });
  await writeFile(path.join(runtime.directory, "playwright.config.mjs"), `export default ${JSON.stringify({ testDir: runtime.directory, testMatch: "privacy.spec.ts", timeout: 60000,
    expect: { timeout: 15000 }, workers: 1, retries: 0, fullyParallel: false, outputDir: path.join(runtime.directory, "artifacts"), reporter: [["line"], ["json"]], use: { baseURL: origin, trace: "off", video: "off", screenshot: "off" } })};\n`, { flag: "wx" });
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port)], { cwd: root, env, windowsHide: true, stdio: "ignore" });
  let ready = false; const until = Date.now() + 30000;
  while (Date.now() < until) { assert.equal(server.exitCode, null);
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* bounded startup */ }
    await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(ready, "Production server startup deadline");
  runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", path.join(runtime.directory, "playwright.config.mjs"), "--grep", selected.join("|")], { cwd: root, env, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Focused regression deadline; no automatic retry")), 180000);
    runner.once("error", e => { clearTimeout(timer); reject(e); }); runner.once("exit", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`Focused suite exited ${code}`)); }); });
  result = JSON.parse(await readFile(path.join(runtime.directory, "result.json")));
  assert.equal(result.stats.expected, 3); assert.equal(result.stats.unexpected, 0); assert.equal(result.stats.skipped, 0);
} catch (e) { error = String(e.stack ?? e); process.exitCode = 1; }
finally {
  let cleanupError = null;
  try { await finishOwnedCleanup([() => stop(runner), () => stop(server)]); }
  catch (e) { cleanupError = String(e); process.exitCode = 1; }
  try { if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); } }
  catch (e) { cleanupError = `${cleanupError ?? ""} ${String(e)}`; process.exitCode = 1; }
  for (const [file, digest] of Object.entries(sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest);
  const report = { recordedAt: new Date().toISOString(), status: !error && !cleanupError ? "passed-focused-regression" : "failed-focused-regression", selectedTests: selected,
    stats: result?.stats ?? null, error, cleanupError, runtimeRemoved: !cleanupError && Boolean(runtime), originalSuiteChanges: "Only projectRoot and profileRoot; all assertions, real production conversion and offline/cache behavior unchanged.",
    conversionMemoryAcceptance: false, fullOfflineEngineCoverage: false, sourcePins };
  const file = path.join(root, `evidence/ui-privacy-offline-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); console.log(file);
}
