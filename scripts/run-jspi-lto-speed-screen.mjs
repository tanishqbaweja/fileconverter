// Four sequential existing production-browser qualifications, never concurrent.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, readdir, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { SCREEN_ORDER, compareJspiLtoScreen } from "./lib/jspi-lto-speed-screen.mjs";
import { auditJspiLtoBlock } from "./lib/jspi-lto-block-audit.mjs";
import { boundedTail, supervisorJournal } from "./lib/bounded-supervisor-journal.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.resolve(root, file));
assert.equal(process.argv.length, 2, "No automatic resume/retry; observe an existing launch instead");
const ownFiles = ["scripts/run-jspi-lto-speed-screen.mjs", "scripts/lib/jspi-lto-speed-screen.mjs", "scripts/lib/jspi-lto-block-audit.mjs",
  "tests/jspi-lto-speed-screen.test.mjs", "scripts/lib/bounded-supervisor-journal.mjs", "scripts/lib/reliable-owned-identity.mjs",
  "scripts/lib/jspi-browser-observation.mjs", "scripts/lib/lto-browser-observation.mjs", "scripts/lib/installed-chrome-pin.mjs",
  "scripts/lib/host-memory-preflight.mjs", "scripts/lib/owned-process-exit-observation.mjs"];
const ownSources = {};
for (const file of ownFiles) { const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") }; }
for (const file of (await readdir(path.join(root, "evidence"))).filter(name => /-jspi-lto-speed-screen\.json$/.test(name))) {
  const previous = JSON.parse(await read("evidence/" + file));
  if (previous.identity) assert.equal((await observeOwnedProcessExit(previous.identity)).status, "owned-identity-absent", "Existing screen not proven absent");
}
const identity = await queryReliableProcessIdentity(process.pid); assert.ok(identity);
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), output = `evidence/${stamp}-jspi-lto-speed-screen.json`;
const record = supervisorJournal(path.join(root, output));
const state = { recordedAt: new Date().toISOString(), status: "preparing-not-accepted", identity, order: SCREEN_ORDER,
  ownSources, browserPin: null, originalBefore: null, originalAfter: null, active: null, blocks: [],
  comparison: null, failure: null, cleanupErrors: [], noAutomaticRetries: true, headlessOnly: true, publicAcceptance: false };
async function protectedOriginal() {
  const file = path.join(root, "test.mkv"), stat = await lstat(file); assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(stat.size, 2958573265);
  const digest = createHash("sha256"); for await (const chunk of createReadStream(file, { highWaterMark: 1048576 })) digest.update(chunk);
  const sha256 = digest.digest("hex"); assert.equal(sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34"); return { bytes: stat.size, sha256 };
}
async function compactSuccessfulBlock(block) {
  assert.equal(block.audit.complete, true); assert.equal(block.audit.allRecordedBirthsRecheckedAbsent, true);
  const checkpoint = block.checkpoint.file;
  assert.equal(path.dirname(checkpoint), path.join(root, "outputs/reports")); assert.match(path.basename(checkpoint), /^\d{4}-\d\d-\d\dT[\d-]+Z-private-mpeg2-updated-chrome-full-native-100ms-native-checkpoint\.json$/);
  const raw = await readFile(checkpoint); assert.ok(raw.length <= 1048576);
  const zipped = gzipSync(raw, { level: 9 }), zipPath = checkpoint + ".gz";
  await writeFile(zipPath, zipped, { flag: "wx" }); assert.deepEqual(gunzipSync(await readFile(zipPath)), raw);
  await rm(checkpoint);
  const trace = checkpoint.replace(/-native-checkpoint\.json$/, "-trace.zip"), traceStat = await lstat(trace);
  assert.ok(traceStat.isFile() && !traceStat.isSymbolicLink() && traceStat.size <= 33554432);
  const digest = createHash("sha256"); for await (const chunk of createReadStream(trace, { highWaterMark: 1048576 })) digest.update(chunk);
  const cleanup = { checkpoint: { path: path.relative(root, zipPath).replaceAll(path.sep, "/"), bytes: zipped.length,
    sha256: sha(zipped), restoredBytes: raw.length, restoredSha256: sha(raw) },
    disposableSuccessTrace: { path: path.relative(root, trace).replaceAll(path.sep, "/"), bytes: traceStat.size,
      sha256: digest.digest("hex"), removed: false, recoverable: false } };
  // Persist identity/hash before deleting only this proven-owned success trace.
  block.compaction = cleanup;
  try { await record(state); }
  finally { await rm(trace); await assert.rejects(access(trace), { code: "ENOENT" }); cleanup.disposableSuccessTrace.removed = true; }
  return cleanup;
}
try {
  state.browserPin = await inspectInstalledChromePin(); state.originalBefore = await protectedOriginal(); await record(state);
  for (const [index, variant] of SCREEN_ORDER.entries()) {
    const host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true);
    const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 3);
    assertInstalledChromePinsEqual(state.browserPin, await inspectInstalledChromePin());
    for (const [file, expected] of Object.entries(ownSources)) assert.equal(sha(await read(file)), expected.sha256, file);
    const command = variant === "jspi" ? "scripts/qualify-jspi-browser.mjs" : "scripts/qualify-lto-browser.mjs";
    state.status = "running-order-balanced-screen-not-accepted"; state.active = { index, variant, command, host, identity: null, exit: null };
    await record(state);
    const stdout = boundedTail(), stderr = boundedTail();
    const child = spawn(process.execPath, [command], { cwd: root, env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", bytes => { stdout.append(bytes); process.stdout.write(bytes); }); child.stderr.on("data", bytes => { stderr.append(bytes); process.stderr.write(bytes); });
    const closed = new Promise(resolve => { child.once("error", error => resolve({ code: null, error: String(error).slice(0, 2048) }));
      child.once("close", (code, signal) => resolve({ code, signal, error: null })); });
    try {
      state.active.identity = await queryReliableProcessIdentity(child.pid); assert.equal(state.active.identity?.parentPid, process.pid);
      await record(state); console.log(JSON.stringify({ screen: output, block: index, variant, child: state.active.identity }));
    } finally { state.active.exit = await closed; state.active.stdout = stdout.snapshot(); state.active.stderr = stderr.snapshot(); await record(state); }
    assert.equal((await observeOwnedProcessExit(state.active.identity)).status, "owned-identity-absent");
    assert.equal(state.active.exit.code, 0, "Stop on failure; no automatic rerun or next session");
    const rows = Buffer.from(stdout.snapshot().tailBase64, "base64").toString().split(/\r?\n/).flatMap(line => {
      try { const value = JSON.parse(line); return value.terminalPath ? [value] : []; } catch { return []; }
    });
    assert.equal(rows.length, 1); const block = await auditJspiLtoBlock(root, variant, rows[0].terminalPath);
    assertInstalledChromePinsEqual(state.browserPin, block.browserPinBefore);
    assertInstalledChromePinsEqual(state.browserPin, block.browserPinAfter);
    block.wrapperIdentity = state.active.identity; block.wrapperExit = state.active.exit;
    state.blocks.push(block); await record(state);
    await compactSuccessfulBlock(block); state.active = null; await record(state);
    console.log(JSON.stringify({ screen: output, completedBlocks: state.blocks.length, variant,
      elapsedMs: block.analysis.elapsedMs, peakIncrementalPrivateMiB: block.analysis.peakIncrementalPrivateMiB }));
  }
  state.comparison = compareJspiLtoScreen(state.blocks); state.status = "finished-order-balanced-screen-not-public-acceptance";
} catch (error) {
  state.failure = { name: error.name, message: String(error.message).slice(0, 8192), code: error.code ?? null };
  state.status = "failed-screen-no-automatic-retry"; process.exitCode = 1;
} finally {
  for (const action of [async () => { state.originalAfter = await protectedOriginal(); assert.deepEqual(state.originalAfter, state.originalBefore); },
    async () => { assertInstalledChromePinsEqual(state.browserPin, await inspectInstalledChromePin()); },
    async () => { assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256); },
    async () => { for (const [file, expected] of Object.entries(ownSources)) assert.equal(sha(await read(file)), expected.sha256, file); }]) {
    try { await action(); } catch (error) { state.cleanupErrors.push({ name: error.name, message: String(error.message).slice(0, 2048) }); process.exitCode = 1; }
  }
  state.finishedAt = new Date().toISOString(); await record(state);
  console.log(JSON.stringify({ screen: output, status: state.status, completedBlocks: state.blocks.length, comparison: state.comparison,
    failure: state.failure, cleanupErrors: state.cleanupErrors }));
}
