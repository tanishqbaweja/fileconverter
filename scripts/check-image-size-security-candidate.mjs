// Isolate the reviewed patch before changing the application's dependency graph.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), destination = path.join(root, "evidence/2026-10-28-image-size-candidate-corrected.json");
await assert.rejects(access(destination), { code: "ENOENT" });
const sha = b => createHash("sha256").update(b).digest("hex");
const files = ["package.json", "package-lock.json", "scripts/check-image-size-security-candidate.mjs"];
const sourcePins = Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(path.join(root, file)))])));
const runtime = await createOwnedRuntimeScratch("image-size-candidate-");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), sourcePins, status: "running", cases: [],
  patchedVersion: "2.0.3", advisories: ["GHSA-5p2g-fcmc-qvqq", "GHSA-w3rx-r6r6-pgpr"],
  installedApplicationGraphChanged: false, conversionOrMemoryAcceptance: false, securityClosure: false };
const require = createRequire(import.meta.url);
const workerCode = `const { parentPort, workerData } = require("node:worker_threads");
const { imageSize } = require(workerData.entry);
parentPort.once("message", bytes => {
  try { parentPort.postMessage({ kind: "dimensions", value: imageSize(Buffer.from(bytes)) }); }
  catch (error) { parentPort.postMessage({ kind: "rejected", error: String(error).slice(0, 512) }); }
}); parentPort.postMessage({ kind: "ready" });`;
async function inspect(entry, bytes) {
  assert.ok(bytes.length <= 4 * 1048576);
  const worker = new Worker(workerCode, { eval: true, workerData: { entry },
    resourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4, stackSizeMb: 1 } });
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Isolated parser failed to start")), 10000);
      worker.on("message", result => {
        if (result.kind === "ready") { clearTimeout(timer); timer = setTimeout(() => resolve({ kind: "timeout", deadlineMs: 1000 }), 1000); worker.postMessage(bytes); }
        else { clearTimeout(timer); resolve(result); }
      });
      worker.once("error", error => { clearTimeout(timer); if (error.code === "ERR_WORKER_OUT_OF_MEMORY") resolve({ kind: "resource-limit", code: error.code }); else reject(error); });
      worker.once("exit", code => { if (code !== 0) { clearTimeout(timer); resolve({ kind: "worker-exit", code }); } });
    });
  } finally { clearTimeout(timer); await worker.terminate(); }
}
function box(type, payload, size = payload.length + 8) {
  const head = Buffer.alloc(8); head.writeUInt32BE(size); head.write(type, 4); return Buffer.concat([head, payload]);
}
try {
  const npmCli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  const install = spawnSync(process.execPath, [npmCli, "install", "--prefix", runtime.directory, "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", "--save-exact", "image-size@2.0.3"], {
    cwd: runtime.directory, env: { ...runtime.env, npm_config_cache: path.join(runtime.directory, "npm-cache"), npm_config_update_notifier: "false" },
    windowsHide: true, encoding: "utf8", timeout: 120000, maxBuffer: 65536,
  });
  assert.ifError(install.error); assert.equal(install.status, 0, install.stderr);
  const candidateRoot = path.join(runtime.directory, "node_modules/image-size");
  const pkgBytes = await readFile(path.join(candidateRoot, "package.json")), pkg = JSON.parse(pkgBytes);
  assert.equal(pkg.version, "2.0.3"); assert.equal(pkg.dependencies, undefined);
  const candidateRequire = createRequire(path.join(runtime.directory, "package.json"));
  const oldEntry = require.resolve("image-size"), candidateEntry = candidateRequire.resolve("image-size");
  report.candidate = { packageSha256: sha(pkgBytes), entrySha256: sha(await readFile(candidateEntry)), version: pkg.version, engines: pkg.engines, repository: pkg.repository };
  report.originalEntrySha256 = sha(await readFile(oldEntry));
  for (const ext of ["png", "jpg", "webp", "bmp", "avif", "jxl", "svg"]) {
    const file = "fixtures/images/test-pattern." + ext, bytes = await readFile(path.join(root, file));
    const before = await inspect(oldEntry, bytes), after = await inspect(candidateEntry, bytes);
    assert.equal(before.kind, "dimensions"); assert.equal(after.kind, "dimensions");
    assert.deepEqual(after.value, before.value, "Framework dimension API unchanged for " + ext);
    report.cases.push({ file, bytes: bytes.length, sha256: sha(bytes), before, after });
  }
  const ispe = Buffer.alloc(12); ispe.writeUInt32BE(1, 4); ispe.writeUInt32BE(1, 8);
  const malformed = {
    "icns-zero-entry": Buffer.concat([Buffer.from("icns"), Buffer.from([0,0,0,16]), box("icp4", Buffer.alloc(0), 0).subarray(4, 8), Buffer.alloc(4)]),
    "heif-zero-ispe": Buffer.concat([box("ftyp", Buffer.from("heic\0\0\0\0")), box("meta", Buffer.concat([Buffer.alloc(4), box("iprp", box("ipco", box("ispe", ispe, 0)))]))]),
    "jxl-zero-partial-box": Buffer.concat([box("JXL ", Buffer.from([13,10,135,10])), box("ftyp", Buffer.from("jxl \0\0\0\0jxl ")), box("jxlp", Buffer.from([0,0,0,0,255,10,0,0]), 0)]),
  };
  for (const [name, bytes] of Object.entries(malformed)) {
    const before = await inspect(oldEntry, bytes), after = await inspect(candidateEntry, bytes);
    report.cases.push({ name, bytes: bytes.length, sha256: sha(bytes), before, after });
    assert.ok(["timeout", "resource-limit", "worker-exit"].includes(before.kind), name + " must reproduce the old parser failure");
    assert.equal(after.kind, "rejected", name + " must reject promptly under the patch");
  }
  report.status = "passed-isolated-patch-api-and-malformed-parser-controls-not-installed";
} catch (error) { report.status = "failed-isolated-patch-candidate"; report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await runtime.close(); report.ownedScratchRemoved = true;
  for (const file of files) assert.equal(sha(await readFile(path.join(root, file))), sourcePins[file]);
  report.finishedAt = new Date().toISOString();
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
}
console.log(JSON.stringify({ path: path.relative(root, destination), status: report.status, cases: report.cases.length, cleanup: report.ownedScratchRemoved, failure: report.failure }));
