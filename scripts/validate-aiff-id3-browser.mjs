// Private production-browser correctness gate. Never promotes an engine or replaces
// a stress run. All children hidden, browser headless, assets restored in finally.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, lstat, readFile, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startChromiumMemoryMonitor } from "./lib/persistent-chromium-memory.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
assert.equal(process.argv.length, 2);
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), proofPath = `evidence/${stamp}-aiff-id3-browser.json`;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(path.join(root, file));
const buildPath = "evidence/aiff-id3-specialist-build-37998603437.json", buildBytes = await read(buildPath), build = JSON.parse(buildBytes);
assert.equal(build.run.conclusion, "success"); assert.equal(build.actualWasmLimitsIndependentlyVerified, true);
assert.equal(build.run.headSha, "20cf3cb851fd45225754e0a1e42be0343aabeaf1");
const tool = path.join(root, "work/aiff-id3-specialist-37998603437");
for (const row of build.files) assert.equal(sha(await readFile(path.join(tool, row.file))), row.sha256);
const fixture = path.join(root, "fixtures/media/audio-source-artwork.m4a");
const fixtureBytes = await readFile(fixture), fixtureMeta = JSON.parse(await read("fixtures/media/audio-source-artwork.m4a.json"));
assert.equal(fixtureBytes.length, fixtureMeta.bytes); assert.equal(sha(fixtureBytes), fixtureMeta.sha256);
const sourcePins = {};
for (const file of ["scripts/validate-aiff-id3-browser.mjs", "workers/media-remux.ts", "app/converter/ConverterApp.tsx",
  "public/engines/remux/build-manifest.json", "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/windows-tree-monitor.cs",
  "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/owned-runtime-scratch.mjs"])
  sourcePins[file] = sha(await read(file));
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
await access(chrome);
const runtime = await createOwnedRuntimeScratch("aiff-id3-browser-");
const env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" };
const native = async (args, probe = false) => (await execute(probe ? "C:/ffmpeg/bin/ffprobe.exe" : "C:/ffmpeg/bin/ffmpeg.exe", args,
  { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout;
const identities = [], staged = [], cases = [], samples = [], forbiddenRequests = [], assetRequests = new Set();
let host = null, diskBytes = null, server, chromeChild, browser, monitor, failure = null, baseline = null, browserVersion = null;
let monitorClosed = false, assetsRestored = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = async (child, role) => {
  const identity = await queryProcessIdentity(child.pid);
  assert.ok(identity && identity.parentPid === process.pid); child.ownedIdentity = identity;
  identities.push({ role, identity, absence: null });
};
const stop = async child => {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return;
  const current = await queryProcessIdentity(child.pid); if (!current) return;
  assert.ok(child.ownedIdentity && current.parentPid === child.ownedIdentity.parentPid &&
    Math.abs(Date.parse(current.createdAt) - Date.parse(child.ownedIdentity.createdAt)) < 1);
  await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10000 });
};
const drain = async phase => {
  const batch = await monitor.drain();
  for (const row of batch.samples) samples.push({ ...row, phase });
  assert.ok(samples.length < 4096, "Bounded short-test sample inventory");
};
const decoded = async file => {
  const payload = await native(["-v", "error", "-cpuflags", "0", "-i", file, "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash", "-hash", "sha256", "pipe:1"]);
  const pcm = /SHA256=([0-9a-f]{64})/i.exec(payload)?.[1]; assert.ok(pcm);
  const frameText = await native(["-v", "error", "-cpuflags", "0", "-copyts", "-i", file, "-map", "0:a:0",
    "-af", "asetnsamples=n=1024:p=0", "-c:a", "pcm_s16le", "-f", "framehash", "-hash", "sha256", "pipe:1"]);
  const rows = frameText.split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => line.split(",").map(value => value.trim()));
  assert.ok(rows.length > 0 && rows.length < 1024);
  for (const row of rows) { assert.equal(row.length, 6); assert.match(row[5], /^[0-9a-f]{64}$/); }
  return { pcmSha256: pcm, frames: rows.length, samples: rows.reduce((sum, row) => sum + Number(row[3]), 0), rows };
};
try {
  host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true);
  const disk = await statfs(root); diskBytes = disk.bavail * disk.bsize; assert.ok(diskBytes >= 256 * 1024 ** 2);
  // Native tools only make deterministic small fixtures and independent references.
  const cover = path.join(runtime.directory, "cover.png");
  await native(["-v", "error", "-i", fixture, "-map", "0:v:0", "-c:v", "copy", cover]);
  assert.equal(sha(await readFile(cover)), fixtureMeta.artwork.sha256);
  const definitions = [{ id: "existing-aac-artwork", file: fixture, tags: fixtureMeta.expectedTags, author: fixtureMeta.expectedTags.artist, artwork: true }];
  const unicode = { title: "Titre café — 音楽", artist: "Émile / कलाकार", album: "Album naïf", genre: "Essai", date: "2026", track: "3/9", comment: "αβγ & <texte>" };
  for (const explicitAuthor of [false, true]) {
    const tags = { ...unicode, ...(explicitAuthor ? { author: "Auteur indépendant Ω" } : {}) };
    const file = path.join(runtime.directory, explicitAuthor ? "unicode-author.m4a" : "unicode-artist.m4a");
    await native(["-v", "error", "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=2", "-i", cover,
      "-map", "0:a:0", "-map", "1:v:0", "-c:a", "alac", "-c:v", "copy", "-disposition:v:0", "attached_pic",
      "-map_metadata", "-1", ...Object.entries(tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
      "-fflags", "+bitexact", "-flags:a", "+bitexact", ...(explicitAuthor ? ["-movflags", "use_metadata_tags"] : []), file]);
    definitions.push({ id: explicitAuthor ? "unicode-existing-author" : "unicode-artist-alias", file, tags, author: explicitAuthor ? tags.author : tags.artist, artwork: !explicitAuthor });
  }
  const references = new Map();
  const inputProbes = new Map();
  for (const definition of definitions) {
    const probe = JSON.parse(await native(["-v", "error", "-show_streams", "-show_format", "-of", "json", definition.file], true));
    for (const [key, value] of Object.entries(definition.tags)) assert.equal(probe.format.tags[key], value, `Qualified source/${key}`);
    const pictures = probe.streams.filter(stream => stream.disposition?.attached_pic === 1);
    assert.equal(pictures.length, definition.artwork ? 1 : 0, "Qualify real source artwork before any browser staging");
    if (definition.artwork) { assert.equal(pictures[0].codec_name, "png"); assert.equal(pictures[0].width, 64); assert.equal(pictures[0].height, 64); }
    inputProbes.set(definition.id, probe); references.set(definition.id, await decoded(definition.file));
  }
  // Change only private served dist engine files; public source/manifests/UI unchanged.
  for (const name of ["within-aiff.mjs", "within-aiff.wasm"]) {
    const target = path.join(root, "dist/client/engines/remux", name), backup = path.join(runtime.directory, `original-${name}`);
    const info = await lstat(target); assert.ok(info.isFile() && !info.isSymbolicLink());
    const originalSha256 = sha(await readFile(target)); assert.equal(originalSha256, sha(await read("public/engines/remux/" + name)));
    await copyFile(target, backup, constants.COPYFILE_EXCL); staged.push({ name, target, backup, originalSha256 });
    await copyFile(path.join(tool, name), target);
    assert.equal(sha(await readFile(target)), build.files.find(row => row.file === name).sha256);
  }
  const port = await new Promise((resolve, reject) => { const listener = createServer(); listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => { const value = listener.address().port; listener.close(error => error ? reject(error) : resolve(value)); }); });
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port)],
    { cwd: root, env, windowsHide: true, stdio: "ignore" }); await record(server, "production-server");
  let ready = false;
  for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
    assert.equal(server.exitCode, null); try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* bounded startup */ } await pause(250);
  }
  assert.ok(ready);
  const profile = path.join(runtime.directory, "chrome-profile");
  chromeChild = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"],
    { cwd: root, env, windowsHide: true, stdio: "ignore" }); await record(chromeChild, "headless-chrome");
  let devtools;
  for (const deadline = Date.now() + 15000; Date.now() < deadline;) {
    try { devtools = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/); break; } catch { await pause(100); }
  }
  assert.ok(devtools); browser = await chromium.connectOverCDP(`http://127.0.0.1:${devtools[0]}`); browserVersion = browser.version();
  const context = browser.contexts()[0], page = context.pages()[0];
  monitor = await startChromiumMemoryMonitor(chromeChild.pid, runtime.directory, 100);
  const monitorIdentity = await queryProcessIdentity(monitor.pid); assert.ok(monitorIdentity);
  identities.push({ role: "read-only-memory-observer", identity: monitorIdentity, absence: null });
  const blankStarted = Date.now();
  for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
    await pause(1000); await drain("blank");
    baseline = stableWindow(samples.filter(row => row.phase === "blank").map(row => ({ ...row, elapsedMs: Date.parse(row.timestamp) - blankStarted })), 8000);
    if (baseline) break;
  }
  assert.ok(baseline, "Clean blank baseline must be stable; no unavailable samples as zero");
  await context.route("**/*", route => {
    const request = route.request();
    if (!request.url().startsWith(origin + "/") || !["GET", "HEAD"].includes(request.method()) || request.postData()) {
      forbiddenRequests.push({ method: request.method(), url: request.url().slice(0, 256) }); return route.abort();
    }
    assetRequests.add(new URL(request.url()).pathname); return route.continue();
  });
  for (const definition of definitions) {
    const row = { id: definition.id, status: "started", sourceSha256: sha(await readFile(definition.file)), inputProbe: inputProbes.get(definition.id), expectedArtwork: definition.artwork }; cases.push(row);
    try {
      await page.goto(origin + "/?test=1");
      await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", null, { timeout: 15000 });
      await page.locator('[data-testid="file-input"]').setInputFiles(definition.file);
      await page.locator('[data-testid="format-select"]').selectOption("m4a-to-aiff");
      await page.locator('[data-testid="convert-button"]').waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector('[data-testid="convert-button"]').disabled);
      await drain("loaded-idle"); await page.locator('[data-testid="convert-button"]').click();
      const started = Date.now();
      for (const deadline = started + 30000; Date.now() < deadline;) {
        row.state = await page.evaluate(() => window.__WITHIN_TEST__.getState()); await drain("conversion");
        if (row.state.jobState !== "idle" && row.state.jobState !== "running") break; await pause(100);
      }
      row.elapsedMs = Date.now() - started; assert.equal(row.state.jobState, "complete", row.state.error ?? row.state.phase);
      const metrics = row.state.metrics; assert.ok(metrics);
      for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.ok(metrics[key] <= 262144, key);
      assert.ok(metrics.peakPendingOperations <= 1); assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
      assert.equal(metrics.peakWasmMemoryBytes, 16777216);
      const output = path.join(runtime.directory, `${definition.id}.aiff`);
      const bytes = await page.evaluate(async name => {
        const directory = await navigator.storage.getDirectory(), file = await (await directory.getFileHandle(name)).getFile();
        if (file.size > 1048576) throw new Error("Small validation fixture cap");
        return Array.from(new Uint8Array(await file.arrayBuffer()));
      }, row.state.opfsName);
      await writeFile(output, Buffer.from(bytes), { flag: "wx" }); row.outputBytes = bytes.length; row.outputSha256 = sha(Buffer.from(bytes));
      row.probe = JSON.parse(await native(["-v", "error", "-show_streams", "-show_format", "-of", "json", output], true));
      const audio = row.probe.streams.filter(stream => stream.codec_type === "audio"), art = row.probe.streams.filter(stream => stream.disposition?.attached_pic === 1);
      assert.equal(audio.length, 1); assert.equal(audio[0].codec_name, "pcm_s16be"); assert.equal(audio[0].sample_rate, "48000"); assert.equal(audio[0].channels, 1);
      assert.equal(art.length, definition.artwork ? 1 : 0);
      if (definition.artwork) {
        assert.equal(art[0].codec_name, "png"); assert.equal(art[0].width, 64); assert.equal(art[0].height, 64);
        const outputCover = path.join(runtime.directory, `${definition.id}.png`);
        await native(["-v", "error", "-i", output, "-map", "0:v:0", "-c:v", "copy", outputCover]);
        row.artworkSha256 = sha(await readFile(outputCover)); assert.equal(row.artworkSha256, fixtureMeta.artwork.sha256);
      }
      const tags = row.probe.format.tags;
      for (const [key, value] of Object.entries(definition.tags)) assert.equal(tags[key], value, `${definition.id}/${key}`);
      assert.equal(tags.author, definition.author);
      assert.ok(!row.state.warnings.some(warning => warning.includes("cover art is explicitly excluded")));
      const before = references.get(definition.id), after = await decoded(output);
      row.audio = { source: before, output: after }; assert.equal(after.pcmSha256, before.pcmSha256); assert.deepEqual(after.rows, before.rows);
      row.status = "passed-small-browser-tag-artwork-full-pcm-and-clock-check";
    } finally {
      row.opfsCleanup = await page.evaluate(async () => {
        const directory = await navigator.storage.getDirectory();
        for await (const [name] of directory.entries()) { if (!name.startsWith("within-")) throw new Error("Unowned OPFS entry"); await directory.removeEntry(name, { recursive: true }); }
        const remaining = []; for await (const [name] of directory.entries()) remaining.push(name); return remaining;
      }); assert.deepEqual(row.opfsCleanup, []);
    }
  }
  assert.equal(forbiddenRequests.length, 0);
  for (const name of ["within-aiff.mjs", "within-aiff.wasm"]) assert.ok(assetRequests.has("/engines/remux/" + name));
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; console.error(failure); }
finally {
  try {
    try {
      await finishOwnedCleanup([
        async () => { if (monitor) { try { await drain("terminal"); } finally { await monitor.close(); monitorClosed = true; } } },
        async () => { if (browser) await browser.close(); },
        () => stop(server),
      ]);
    } finally { await finishOwnedCleanup([() => stop(chromeChild), () => stop(server)]); }
    for (const row of identities) { row.absence = await observeOwnedProcessExit(row.identity); assert.equal(row.absence.status, "owned-identity-absent"); }
  } catch (error) { failure = `${failure ?? ""}\nProcess cleanup: ${error.stack ?? error}`.slice(0, 12288); process.exitCode = 1; }
  finally {
    try {
      for (const row of staged) { assert.equal(sha(await readFile(row.backup)), row.originalSha256); await copyFile(row.backup, row.target); assert.equal(sha(await readFile(row.target)), row.originalSha256); }
      assetsRestored = true;
      for (const [file, hash] of Object.entries(sourcePins)) assert.equal(sha(await read(file)), hash, file);
      assert.equal(sha(await readFile(fixture)), fixtureMeta.sha256);
    } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
  }
}
const validConversion = samples.filter(row => row.phase === "conversion" && row.privateBytes !== null);
const peakBytes = validConversion.length ? Math.max(...validConversion.map(row => row.privateBytes)) : null;
const incrementalPrivateMiB = baseline && peakBytes !== null ? (peakBytes - baseline.privateBytes) / 1048576 : null;
await writeFile(path.join(root, proofPath), JSON.stringify({ recordedAt: new Date().toISOString(), status: failure ? "failed-or-incomplete" : "passed-three-small-private-aiff-correctness-cases",
  failure, buildProof: { path: buildPath, sha256: sha(buildBytes) }, browserVersion, host, diskBytes, sourcePins, cases, assetRequests: [...assetRequests], forbiddenRequests,
  baseline, peakBytes, incrementalPrivateMiB, samples, monitorIntervalMs: 100, monitorClosed, identities, assetsRestored, ownedRuntime: runtime.directory, ownedRuntimeRemoved: true,
  validationTransferScope: "Only completed <1MiB fixture outputs copied for independent native validation; never production conversion I/O", browserMode: "headless", subprocessWindowsHidden: true,
  protectedOriginalRead: false, nativeToolsOnlyFixturesAndIndependentValidation: true, noDocker: true, publicAcceptance: false, stressMemoryAcceptance: false, scalingAcceptance: false, speedImprovementProven: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, cases: cases.map(row => ({ id: row.id, status: row.status })), failure, assetsRestored, incrementalPrivateMiB }));
