// Local diagnostic host: exact built worker/modules, direct workerd HTTP ingress.
// The separate loopback service can only read dist/client; it never converts files.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { queryReliableProcessIdentity } from "./reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./owned-process-exit-observation.mjs";

const root = path.resolve(import.meta.dirname, "../.."), execute = promisify(execFile);
const slash = value => value.replaceAll("\\", "/");
const hashFile = async file => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 262144 })) digest.update(chunk);
  return digest.digest("hex");
};
const mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain" };

export async function startDirectWorkerdHost({ runtime, port, receipt }) {
  assert.equal(process.platform, "win32");
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
  const configPath = path.join(root, "dist/server/wrangler.json"), build = JSON.parse(await readFile(configPath));
  assert.equal(build.main, "index.js"); assert.equal(build.no_bundle, true);
  assert.deepEqual(build.compatibility_flags, ["nodejs_compat"]);
  assert.equal(build.assets.binding, "ASSETS"); assert.equal(build.assets.run_worker_first, true);
  const assetsRoot = await realpath(path.join(root, "dist/client"));
  assert.equal(assetsRoot, path.join(root, "dist/client"));
  const headerText = await readFile(path.join(assetsRoot, "_headers"), "utf8"), headerRules = [];
  for (const block of headerText.trim().split(/\r?\n\s*\r?\n/)) {
    const [pattern, ...lines] = block.split(/\r?\n/); assert.match(pattern, /^\/[a-z/]*\*$/);
    const headers = {};
    for (const line of lines) { const match = /^\s+([A-Za-z-]+): (.+)$/.exec(line); assert.ok(match); headers[match[1]] = match[2]; }
    headerRules.push({ prefix: pattern.slice(0, -1), headers });
  }
  const assetReceipt = { root: "dist/client", headerFileSha256: await hashFile(path.join(assetsRoot, "_headers")),
    requests: 0, nonReadRequests: 0, streamedFiles: 0, servedFiles: {}, maxReadBufferBytes: 65536 };
  receipt.assetService = assetReceipt;
  let assetServer, child, identity, log = "", closing;
  const close = () => closing ??= (async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      assert.ok(identity, "No cleanup authority without launch birth");
      assert.deepEqual(await queryReliableProcessIdentity(child.pid), identity);
      await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
    }
    if (identity) receipt.cleanup = await observeOwnedProcessExit(identity);
    else assert.ok(!child || child.exitCode !== null || child.signalCode !== null);
    if (assetServer?.listening) {
      assetServer.closeAllConnections();
      await new Promise((resolve, reject) => assetServer.close(error => error ? reject(error) : resolve()));
    }
    receipt.assetServiceClosed = !assetServer?.listening;
    receipt.log = log;
  })();
  try {
    assetServer = createServer(async (req, res) => {
      assetReceipt.requests++;
      try {
        if (req.method !== "GET" && req.method !== "HEAD") {
          assetReceipt.nonReadRequests++; res.writeHead(405, { Allow: "GET, HEAD" }); res.end(); return;
        }
        const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        const segments = pathname.split("/").filter(Boolean);
        if (segments.some(segment => segment.startsWith(".") || /[\\:\0]/.test(segment)) ||
          segments.some(segment => segment === "_headers" || segment === "_redirects")) { res.writeHead(404); res.end(); return; }
        const file = path.resolve(assetsRoot, ...segments);
        if (!file.startsWith(assetsRoot + path.sep)) { res.writeHead(404); res.end(); return; }
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || await realpath(file) !== file) { res.writeHead(404); res.end(); return; }
        const relative = slash(path.relative(assetsRoot, file));
        if (!assetReceipt.servedFiles[relative]) assetReceipt.servedFiles[relative] = { bytes: info.size, sha256: await hashFile(file) };
        const headers = { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream", "Content-Length": String(info.size) };
        for (const rule of headerRules) if (pathname.startsWith(rule.prefix)) Object.assign(headers, rule.headers);
        res.writeHead(200, headers);
        if (req.method === "HEAD") res.end();
        else { assetReceipt.streamedFiles++; await pipeline(createReadStream(file, { highWaterMark: 65536 }), res); }
      } catch (error) {
        if (!res.headersSent) { res.writeHead(error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500); res.end(); }
        else res.destroy();
      }
    });
    assetServer.requestTimeout = 10000; assetServer.headersTimeout = 10000; assetServer.maxConnections = 32;
    await new Promise((resolve, reject) => { assetServer.once("error", reject); assetServer.listen(0, "127.0.0.1", resolve); });
    const modules = [], serverRoot = path.join(root, "dist/server");
    async function visit(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        assert.equal(entry.isSymbolicLink(), false);
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (/\.(?:m?js|wasm)$/.test(entry.name)) modules.push({ name: slash(path.relative(serverRoot, file)), file, sha256: await hashFile(file) });
      }
    }
    await visit(serverRoot); modules.sort((a, b) => a.name === "index.js" ? -1 : b.name === "index.js" ? 1 : a.name.localeCompare(b.name));
    assert.equal(modules[0].name, "index.js"); assert.ok(modules.length <= 64);
    receipt.modules = modules.map(({ name, sha256 }) => ({ name, sha256 }));
    const workerConfig = `using Workerd = import "/workerd/workerd.capnp";\nconst config :Workerd.Config = (\nservices = [\n` +
      `(name = "app", worker = (modules = [${modules.map(module => `(name = ${JSON.stringify(module.name)}, ${module.name.endsWith(".wasm") ? "wasm" : "esModule"} = embed ${JSON.stringify(slash(path.relative(runtime.directory, module.file)))})`).join(",\n")}],\n` +
      `compatibilityDate = ${JSON.stringify(build.compatibility_date)}, compatibilityFlags = ${JSON.stringify(build.compatibility_flags)},\nbindings = [(name = "ASSETS", service = "assets") ])),\n` +
      `(name = "assets", external = (address = "127.0.0.1:${assetServer.address().port}", http = ()))\n],\n` +
      `sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "app")]\n);\n`;
    receipt.workerdConfig = workerConfig; receipt.configSha256 = createHash("sha256").update(workerConfig).digest("hex");
    receipt.incomingBodyMiddleware = false; receipt.exactBuiltWorker = true;
    const filename = path.join(runtime.directory, "direct.capnp"); await writeFile(filename, workerConfig, { flag: "wx" });
    const binary = path.join(root, "node_modules/@cloudflare/workerd-windows-64/bin/workerd.exe"); await access(binary);
    receipt.workerdVersion = JSON.parse(await readFile(path.join(root, "node_modules/workerd/package.json"))).version;
    receipt.workerdBinarySha256 = await hashFile(binary);
    child = spawn(binary, ["serve", filename], { cwd: root, env: runtime.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.on("error", error => { log = (log + String(error)).slice(-16384); });
    for (const pipe of [child.stdout, child.stderr]) pipe.on("data", value => { log = (log + value.toString()).slice(-16384); });
    identity = await queryReliableProcessIdentity(child.pid); receipt.launchIdentity = identity;
    assert.ok(identity, log || "Native runtime did not remain alive for birth observation");
    return { child, close, assertAlive() { assert.equal(child.exitCode, null, log); assert.equal(child.signalCode, null, log); },
      async verifySourcePins() {
        for (const entry of modules) assert.equal(await hashFile(entry.file), entry.sha256);
        for (const [relative, pin] of Object.entries(assetReceipt.servedFiles)) assert.equal(await hashFile(path.join(assetsRoot, relative)), pin.sha256);
        assert.equal(await hashFile(path.join(assetsRoot, "_headers")), assetReceipt.headerFileSha256);
        assert.equal(await hashFile(binary), receipt.workerdBinarySha256);
      } };
  } catch (error) { await close(); throw error; }
}
