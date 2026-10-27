// Private candidate preview: serve only compiled assets; use unchanged browser specs.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { rejectNonStaticRequest } from "../../lib/static-host-request-policy.ts";
import { inspectStressHostMemory } from "./host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./owned-process-exit-observation.mjs";

const execute = promisify(execFile), mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm",
  ".html": "text/html; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".woff2": "font/woff2" };
const hashFile = async filename => { const digest = createHash("sha256");
  for await (const chunk of createReadStream(filename, { highWaterMark: 262144 })) digest.update(chunk); return digest.digest("hex"); };

export async function runStaticShellCandidatePrivacy({ root, runtime, clientDirectory, htmlFilename, report, stamp }) {
  assert.equal(process.platform, "win32", "This local preview uses native Windows birth-identity teardown");
  const proof = { scope: "Unchanged 19-case headless privacy/offline/static-host suite on a private static frontend candidate; not memory/fidelity/release qualification",
    safeToRemoveRuntime: false, status: "running", failures: [], serverRequests: 0, nonStaticRefusals: 0, streamedAssets: 0,
    noServerConversion: true, headed: false, maxReadBufferBytes: 65536 };
  report.privacy = proof; report.browserLaunched = null; report.syntheticBrowserFixturesSelected = true;
  let server, runner, birth, runnerLog = "";
  const original = path.join(root, "test.mkv");
  const readOriginal = async () => ({ bytes: (await stat(original)).size, sha256: await hashFile(original) });
  try {
    proof.hostMemory = await inspectStressHostMemory(); assert.equal(proof.hostMemory.safeToStart, true);
    proof.protectedOriginalBefore = await readOriginal(); report.protectedOriginalReadForChecksumOnly = true;
    assert.deepEqual(proof.protectedOriginalBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
    assert.equal(await realpath(clientDirectory), clientDirectory);
    const headerRules = (await readFile(path.join(clientDirectory, "_headers"), "utf8")).trim().split(/\r?\n\s*\r?\n/).map(block => {
      const [pattern, ...lines] = block.split(/\r?\n/); assert.match(pattern, /^\/[a-z/]*\*$/);
      return { prefix: pattern.slice(0, -1), headers: Object.fromEntries(lines.map(line => {
        const match = /^\s+([A-Za-z-]+): (.+)$/.exec(line); assert.ok(match); return [match[1], match[2]];
      })) };
    });
    server = createServer(async (req, res) => {
      proof.serverRequests++;
      try {
        const url = new URL(req.url, "http://127.0.0.1"), headers = {};
        for (const rule of headerRules) if (url.pathname.startsWith(rule.prefix)) Object.assign(headers, rule.headers);
        const denied = rejectNonStaticRequest(new Request(url, { method: req.method }));
        if (denied) { proof.nonStaticRefusals++; denied.headers.forEach((value, key) => { headers[key] = value; });
          res.writeHead(denied.status, { ...headers, "Content-Length": "0" }); res.end(); return; }
        const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
        if (segments.some(segment => segment.startsWith(".") || /[\\:\0]/.test(segment) || ["_headers", "_redirects"].includes(segment))) { res.writeHead(404, headers); res.end(); return; }
        const filename = path.resolve(clientDirectory, segments.length ? segments.join("/") : htmlFilename);
        assert.ok(filename.startsWith(clientDirectory + path.sep));
        const info = await lstat(filename);
        if (!info.isFile() || info.isSymbolicLink() || await realpath(filename) !== filename) { res.writeHead(404, headers); res.end(); return; }
        res.writeHead(200, { ...headers, "Content-Type": mime[path.extname(filename)] ?? "application/octet-stream", "Content-Length": String(info.size) });
        if (req.method === "HEAD") res.end();
        else { proof.streamedAssets++; await pipeline(createReadStream(filename, { highWaterMark: 65536 }), res); }
      } catch (error) { if (!res.headersSent) { res.writeHead(error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500); res.end(); } else res.destroy(); }
    });
    server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxConnections = 32;
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const port = server.address().port, origin = `http://127.0.0.1:${port}`;
    const response = await fetch(origin, { signal: AbortSignal.timeout(5000) }); assert.equal(response.status, 200);
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin"); assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
    assert.match(await response.text(), /Big files\./);
    proof.moduleMimePreflight = [];
    const modules = (await readdir(clientDirectory, { recursive: true })).filter(filename => filename.endsWith(".mjs"));
    assert.ok(modules.length > 0 && modules.length <= 512);
    for (const filename of modules) {
      const pathname = "/" + filename.replaceAll("\\", "/"), checked = await fetch(origin + pathname, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      const contentType = checked.headers.get("content-type"); proof.moduleMimePreflight.push({ pathname, status: checked.status, contentType });
      assert.equal(checked.status, 200); assert.match(contentType, /javascript|ecmascript/);
    }
    const resultFile = path.join(runtime.directory, "privacy-result.json"), configFile = path.join(runtime.directory, "privacy.config.mjs");
    await writeFile(configFile, `import base from ${JSON.stringify(pathToFileURL(path.join(root, "playwright.config.ts")).href)};\n` +
      `export default {...base,testDir:${JSON.stringify(path.join(root, "tests/browser"))},maxFailures:1,\n` +
      `testMatch:["**/privacy-offline.spec.ts","**/static-host-policy.spec.ts"],\n` +
      `outputDir:${JSON.stringify(path.join(runtime.directory, "privacy-artifacts"))},reporter:[["line"],["json",{outputFile:${JSON.stringify(resultFile)}}]],\n` +
      `use:{...base.use,baseURL:${JSON.stringify(origin)},headless:true},webServer:undefined};\n`, { flag: "wx" });
    runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", configFile], { cwd: root,
      env: { ...runtime.env, WITHIN_TEST_PORT: String(port), WITHIN_TEST_BASE_URL: origin, npm_config_cache: path.join(runtime.directory, "npm-cache") },
      windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    for (const pipe of [runner.stdout, runner.stderr]) pipe.on("data", value => { runnerLog = (runnerLog + value.toString()).slice(-16384); });
    let deadline;
    const completed = new Promise((resolve, reject) => {
      deadline = setTimeout(() => reject(new Error("Finite candidate privacy deadline exceeded")), 300000);
      runner.once("error", reject); runner.once("exit", code => resolve(code));
    });
    // Observe rejection immediately while obtaining native launch identity.
    completed.catch(() => {});
    try { birth = await queryReliableProcessIdentity(runner.pid); assert.ok(birth); proof.runnerBirth = birth;
      proof.runnerExitCode = await completed; } finally { clearTimeout(deadline); }
    const result = JSON.parse(await readFile(resultFile)); proof.stats = result.stats;
    assert.equal(proof.runnerExitCode, 0, runnerLog); assert.equal(result.stats.expected, 19);
    assert.equal(result.stats.unexpected, 0); assert.equal(result.stats.skipped, 0); assert.equal(result.stats.flaky, 0);
    report.browserLaunched = true; proof.status = "passed-unchanged-private-candidate-privacy-offline-specs";
  } catch (error) { proof.status = "failed-private-candidate-privacy"; proof.failures.push(String(error.stack ?? error)); throw error; }
  finally {
    proof.runnerLog = runnerLog;
    if (runner && runner.exitCode === null && runner.signalCode === null) {
      assert.ok(birth); assert.deepEqual(await queryReliableProcessIdentity(runner.pid), birth);
      await execute("taskkill.exe", ["/PID", String(runner.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
    }
    if (birth) { proof.processCleanup = await observeOwnedProcessExit(birth); assert.equal(proof.processCleanup.status, "owned-identity-absent"); }
    if (server?.listening) { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    proof.serverClosed = !server?.listening;
    proof.safeToRemoveRuntime = (!runner || runner.exitCode !== null || runner.signalCode !== null) && proof.serverClosed;
    if (proof.status !== "passed-unchanged-private-candidate-privacy-offline-specs") {
      const artifacts = path.join(runtime.directory, "privacy-artifacts");
      const files = await readdir(artifacts, { recursive: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      const firstTrace = files.find(filename => filename.endsWith("trace.zip"));
      if (firstTrace) {
        const source = path.join(artifacts, firstTrace), info = await stat(source); assert.ok(info.size < 2 * 1048576);
        const targetDirectory = path.join(root, "output/playwright", `${stamp}-static-shell-failure`); await mkdir(targetDirectory, { recursive: true });
        const target = path.join(targetDirectory, "trace.zip"); await cp(source, target, { force: false, errorOnExist: true });
        proof.retainedTrace = { path: path.relative(root, target), bytes: info.size, sha256: await hashFile(target) };
      }
    }
    proof.protectedOriginalAfter = await readOriginal(); assert.deepEqual(proof.protectedOriginalAfter, proof.protectedOriginalBefore);
  }
}
