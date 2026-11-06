// Real owned Chromium protocol fixture; no conversion, media, GC or memory acceptance.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { createRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { connectDebuggerTransport } from "./lib/cdp-debugger-transport.mjs";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";

assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = b => createHash("sha256").update(b).digest("hex"), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const archivePath = "fixtures/source/pre-cdp-lease-lifecycle-2026-11-07.json";
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", cases: [], sourcePins: {}, failures: [],
  scope: "Real CDP attach reply deliberately delayed across a real target's out-of-scope navigation; archived negative control versus repaired lifecycle",
  headed: false, conversionPerformed: false, protectedOriginalAccessed: false, inputOrOutputMediaCreated: false,
  forcedGc: false, browserServicesDisabled: false, memoryAcceptance: false, speedImprovementClaimed: false, publicPromotion: false };
let runtime, chrome, chromeBirth, driver, server;
const waitUntil = async (check, description) => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await check()) return; await pause(100); }
  throw new Error("Fixture deadline: " + description);
};
try {
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
  report.browserBefore = await inspectInstalledChromePin();
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"],
    { cwd: root, windowsHide: true, timeout: 10000 })).stdout.trim();
  for (const file of ["scripts/verify-cdp-realm-retirement.mjs", "scripts/lib/cdp-realm-memory.mjs", archivePath,
    "scripts/lib/cdp-debugger-transport.mjs", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/reliable-owned-identity.mjs"])
    report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  const pin = JSON.parse(await readFile(path.join(root, archivePath)));
  const bytes = gunzipSync(Buffer.from(pin.gzipBase64, "base64"), { maxOutputLength: 16384 });
  assert.equal(bytes.length, pin.bytes); assert.equal(sha(bytes), pin.sha256);
  report.archivedControl = { sourceCommit: pin.sourceCommit, bytes: pin.bytes, sha256: pin.sha256 };
  const old = await import("data:text/javascript;base64," + bytes.toString("base64"));
  runtime = await createOwnedRuntimeScratch("cdp-realm-retirement-");
  server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff" });
    response.end("<!doctype html><title>Owned CDP diagnostic fixture</title>");
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`, profile = path.join(runtime.directory, "profile");
  report.launchArguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "about:blank"];
  chrome = spawn(report.browserBefore.launcher.path, report.launchArguments,
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  chromeBirth = await queryReliableProcessIdentity(chrome.pid); assert.ok(chromeBirth); report.browserLaunchIdentity = chromeBirth;
  let activePort;
  await waitUntil(async () => {
    assert.equal(chrome.exitCode, null);
    try { activePort = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/); return activePort.length === 2; }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
  }, "owned Chrome debugger ready");
  assert.match(activePort[0], /^\d{1,5}$/); assert.match(activePort[1], /^\/devtools\/browser\/[a-zA-Z0-9-]+$/);
  const socketUrl = `ws://127.0.0.1:${activePort[0]}${activePort[1]}`;
  driver = await connectDebuggerTransport(socketUrl);
  // Create a replacement before closing the owned startup tab, keeping Chrome alive.
  const first = (await driver.send("Target.createTarget", { url: origin + "/control" })).targetId;
  for (const target of (await driver.send("Target.getTargets")).targetInfos)
    if (target.type === "page" && target.targetId !== first) await driver.send("Target.closeTarget", { targetId: target.targetId });
  const run = async (factory, name, targetId) => {
    const row = { name, targetId, actualDelayedAttachmentReply: false, samplerHeapQueriesAfterRetirement: 0,
      detachCommands: 0, sessionAddressableAfterReply: null, rawSessionProbeError: null };
    report.cases.push(row);
    let raw, sampler, drive, release, attachedSession;
    try {
      await waitUntil(async () => (await driver.send("Target.getTargetInfo", { targetId })).targetInfo.url.startsWith(origin + "/"), "fixture page navigation");
      drive = (await driver.send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
      raw = await connectDebuggerTransport(socketUrl);
      sampler = factory({ close() { raw.close(); }, async send(method, params, sessionId) {
        if (method === "Runtime.getHeapUsage" && sessionId === attachedSession) row.samplerHeapQueriesAfterRetirement++;
        if (method === "Target.detachFromTarget" && params.sessionId === attachedSession) row.detachCommands++;
        const result = await raw.send(method, params, sessionId);
        if (method === "Target.attachToTarget" && params.targetId === targetId) {
          attachedSession = result.sessionId; row.actualDelayedAttachmentReply = true;
          return new Promise(resolve => { release = () => resolve(result); });
        }
        return result;
      } }, origin, 100);
      const firstSample = await sampler.sample();
      assert.equal(firstSample.targets.find(target => target.targetId === targetId).usedJSHeapBytes, null);
      await waitUntil(async () => Boolean(release), "real attachment reply received and held");
      const outside = "data:text/html,owned-realm-outside-sampling-origin";
      await driver.send("Page.navigate", { url: outside }, drive);
      await waitUntil(async () => (await driver.send("Target.getTargetInfo", { targetId })).targetInfo.url === outside, "actual out-of-scope navigation");
      row.targetStillLiveAtRetirement = true; row.observedOutOfScopeUrl = outside;
      const retired = await sampler.sample(); assert.equal(retired.targets.some(target => target.targetId === targetId), false);
      release();
      await waitUntil(async () => name === "archived-control" ? row.samplerHeapQueriesAfterRetirement === 1
        : sampler.ownershipSummary().leasedEntries === 0, "late reply lifecycle settled");
      try {
        // Independent protocol probe, not a sampler heap or memory acceptance metric.
        await raw.send("Runtime.getHeapUsage", {}, attachedSession); row.sessionAddressableAfterReply = true;
      } catch (error) {
        row.rawSessionProbeError = String(error); assert.match(row.rawSessionProbeError, /Session with given id not found|No session with given id/i);
        row.sessionAddressableAfterReply = false;
      }
      if (name === "archived-control") {
        assert.equal(row.detachCommands, 0); assert.equal(row.samplerHeapQueriesAfterRetirement, 1); assert.equal(row.sessionAddressableAfterReply, true);
      } else {
        assert.equal(row.detachCommands, 1); assert.equal(row.samplerHeapQueriesAfterRetirement, 0); assert.equal(row.sessionAddressableAfterReply, false);
        row.attachmentSummary = sampler.ownershipSummary();
      }
      row.status = "observed-predicted-lifecycle";
    } finally {
      release?.(); sampler?.close(); raw?.close();
      if (drive) await driver.send("Target.detachFromTarget", { sessionId: drive });
      await driver.send("Target.closeTarget", { targetId }); row.ownedTargetClosed = true;
    }
  };
  // Keep a blank keeper outside each case's target so closing the case never exits Chrome.
  const keeper = (await driver.send("Target.createTarget", { url: "data:text/html,owned-keeper" })).targetId;
  await waitUntil(async () => (await driver.send("Target.getTargetInfo", { targetId: keeper })).targetInfo.url.startsWith("data:"), "keeper navigation");
  await run(old.createRealmSampler, "archived-control", first);
  const next = (await driver.send("Target.createTarget", { url: origin + "/repaired" })).targetId;
  await run(createRealmSampler, "repaired", next);
  await driver.send("Target.closeTarget", { targetId: keeper });
  report.status = "passed-real-cdp-retirement-control-and-repair-not-conversion-acceptance";
} catch (error) { report.status = "failed-not-acceptance"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  await finishOwnedCleanup([
    async () => {
      await driver?.send("Browser.close").catch(() => {}); driver?.close();
      if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
        assert.ok(chromeBirth); const current = await queryReliableProcessIdentity(chrome.pid);
        if (current) { assert.deepEqual(current, chromeBirth);
          await execute("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 }); }
      }
      if (chromeBirth) { report.browserCleanup = await observeOwnedProcessExit(chromeBirth); assert.equal(report.browserCleanup.status, "owned-identity-absent"); }
    },
    async () => { if (server) { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); report.serverClosed = true; } },
  ]).catch(error => { report.failures.push("Process cleanup: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; });
  try {
    assert.ok(!chrome || chrome.exitCode !== null || chrome.signalCode !== null || report.browserCleanup?.status === "owned-identity-absent");
    if (runtime) { await runtime.close(); report.ownedRuntimeRemoved = true; }
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest);
    if (report.browserBefore) { report.browserAfter = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(report.browserBefore, report.browserAfter); }
  } catch (error) { report.failures.push("Runtime/source cleanup: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", `${stamp}-cdp-realm-retirement.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, cases: report.cases, failures: report.failures }));
}
