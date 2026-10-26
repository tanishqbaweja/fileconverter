// Source inspection only: native creates INPUTS; the production UI never converts.
// Owned media/profile/server scratch is removed in finally, including failures.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, statfs, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { inspectMediaSource } from "../lib/media-source-inspection.ts";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";

assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const runtime = await createOwnedRuntimeScratch("aiff-tail-inspection-"), env = runtime.env;
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const report = { schemaVersion: 1, status: "incomplete", scope: "two real AIFF/AIFC trailing-ID3 input inspections in the production UI; NOT conversions, metadata-preservation, process-memory or stress qualification",
  conversionExecuted: false, nativeConversionUsed: false, publicProfilePromoted: false, headedCoverage: false, cases: [], failures: [],
  network: { requests: 0, forbidden: [] }, screenshots: [] };
let context, server, browserIdentity;
const hashFile = async file => { const hash = createHash("sha256"); for await (const bytes of createReadStream(file, { highWaterMark: 65536 })) hash.update(bytes); return hash.digest("hex"); };
const command = async (name, args, timeout = 30000) => (await execute(name, args, { cwd: root, env, windowsHide: true, timeout, maxBuffer: 1048576 })).stdout;
const sourceFiles = ["lib/media-source-inspection.ts", "app/converter/ConverterApp.tsx", "scripts/validate-aiff-tail-inspection.mjs",
  "scripts/lib/owned-production-test-server.mjs", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/host-memory-preflight.mjs"];
const pins = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await readFile(path.join(root, file)))])));
// This independent walk reads only FORM/chunk headers and ten ID3 header bytes.
async function inspectInputHeaders(file) {
  const handle = await open(file, "r"), info = await handle.stat(), chunks = []; let readBytes = 0;
  const at = async (offset, length) => {
    assert.ok(length <= 22 && offset >= 0 && offset + length <= info.size);
    const bytes = Buffer.alloc(length); const result = await handle.read(bytes, 0, length, offset);
    assert.equal(result.bytesRead, length); readBytes += length; return bytes;
  };
  try {
    const header = await at(0, 12); assert.equal(header.toString("ascii", 0, 4), "FORM");
    assert.equal(header.readUInt32BE(4) + 8, info.size);
    for (let offset = 12; offset + 8 <= info.size;) {
      assert.ok(chunks.length < 32); const head = await at(offset, 8), id = head.toString("ascii", 0, 4), length = head.readUInt32BE(4);
      assert.ok(offset + 8 + length + (length & 1) <= info.size);
      chunks.push({ id, offset, length });
      if (id === "ID3 ") { const id3 = await at(offset + 8, 10); assert.equal(id3.toString("ascii", 0, 3), "ID3"); }
      offset += 8 + length + (length & 1);
    }
    return { container: header.toString("ascii", 8, 12), chunks, readBytes, maximumReadBytes: 12, noAudioPayloadRead: true };
  } finally { await handle.close(); }
}
async function inspectDiskFile(file, inspect) {
  const handle = await open(file, "r"), before = await handle.stat({ bigint: true }), reads = [];
  try {
    const result = await inspect({ size: Number(before.size), slice(start, end) {
      assert.ok(end > start && end - start <= 22 && reads.length < 258); reads.push([start, end]);
      return { async arrayBuffer() {
        const bytes = Buffer.alloc(end - start); const { bytesRead } = await handle.read(bytes, 0, bytes.length, start);
        assert.equal(bytesRead, bytes.length); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
      } };
    } }, "aiff");
    const after = await handle.stat({ bigint: true }); for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(after[key], before[key]);
    return { result, reads, allReadsBounded: true, inputUnchanged: true };
  } finally { await handle.close(); }
}
try {
  report.executedHead = (await command("git", ["rev-parse", "HEAD"])).trim(); report.sources = await pins();
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 2 * 1024 ** 3);
  report.browser = await inspectInstalledChromePin();
  const oldSource = await command("git", ["show", "9fcfdb61:lib/media-source-inspection.ts"]);
  report.baseline = { commit: "9fcfdb61", sourceSha256: sha(oldSource), scope: "same input / old production inspector only, not old browser or speed comparison" };
  // This data URL contains source CODE, never selected file data or converted output.
  const oldModule = await import("data:text/javascript;base64," + Buffer.from(stripTypeScriptTypes(oldSource)).toString("base64"));
  for (const [key, codec, container] of [["aiff", "pcm_s16be", "AIFF"], ["aifc", "pcm_s16le", "AIFC"]]) {
    const file = path.join(runtime.directory, "trailing-id3." + key), tags = { title: "Titre café — 音楽", artist: "Émile / कलाकार", album: "Album naïf", comment: "αβγ & <texte>", composer: "作曲者 Émile" };
    await command("ffmpeg", ["-v", "error", "-nostdin", "-n", "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=8", "-c:a", codec,
      "-write_id3v2", "1", "-map_metadata", "-1", ...Object.entries(tags).flatMap(([k, value]) => ["-metadata", k + "=" + value]), "-fflags", "+bitexact", "-flags:a", "+bitexact", "-f", "aiff", file]);
    const probe = JSON.parse(await command("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
    assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_name, codec); assert.equal(Number(probe.format.duration), 8);
    for (const [name, value] of Object.entries(tags)) assert.equal(probe.format.tags[name], value);
    const decoded = (await command("ffmpeg", ["-v", "error", "-xerror", "-nostdin", "-cpuflags", "0", "-i", file, "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash", "-hash", "sha256", "pipe:1"])).trim();
    assert.match(decoded, /^SHA256=[a-f0-9]{64}$/);
    const headers = await inspectInputHeaders(file); assert.equal(headers.container, container);
    const sound = headers.chunks.find(row => row.id === "SSND"), id3 = headers.chunks.find(row => row.id === "ID3 ");
    assert.ok(sound && id3 && id3.offset >= sound.offset + 8 + sound.length && id3.offset > 262144);
    const before = await inspectDiskFile(file, oldModule.inspectMediaSource), after = await inspectDiskFile(file, inspectMediaSource);
    assert.equal(before.result.metadataSignals.includes("ID3 tag"), false); assert.equal(after.result.metadataSignals.includes("ID3 tag"), true);
    report.cases.push({ key, bytes: (await lstat(file)).size, sha256: await hashFile(file), tags, probe, decodedPcmSha256: decoded.slice(7), headers, before, after });
  }
  await command(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], 180000);
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port: 3221 });
  context = await chromium.launchPersistentContext(path.join(runtime.directory, "chrome-profile"), { executablePath: report.browser.launcher.path, headless: true, env, serviceWorkers: "block" });
  const browser = context.browser(), session = await browser.newBrowserCDPSession();
  try { const roots = (await session.send("SystemInfo.getProcessInfo")).processInfo.filter(row => row.type === "browser"); assert.equal(roots.length, 1);
    browserIdentity = await queryProcessIdentity(Number(roots[0].id)); assert.ok(browserIdentity); report.browserBirth = browserIdentity;
  } finally { await session.detach(); }
  context.on("request", request => { report.network.requests++;
    if (!request.url().startsWith(server.baseURL + "/") || request.method() !== "GET" || request.postData() !== null) {
      assert.ok(report.network.forbidden.length < 16); report.network.forbidden.push({ url: request.url().slice(0, 256), method: request.method() });
    }
  });
  await context.addInitScript(() => {
    const original = Blob.prototype.slice, rows = [];
    Object.defineProperty(window, "__AIFF_SOURCE_READS__", { value: rows });
    Blob.prototype.slice = function(start = 0, end = this.size, type) {
      if (this instanceof File) { if (rows.length >= 32) throw new Error("Source inspection read inventory exceeded"); rows.push({ start, end, bytes: Math.min(this.size, end) - start }); }
      return original.call(this, start, end, type);
    };
  });
  const page = context.pages()[0] ?? await context.newPage(), response = await page.goto(server.baseURL + "/?test=1");
  assert.equal(response.status(), 200); assert.equal(response.headers()["cross-origin-opener-policy"], "same-origin"); assert.equal(response.headers()["cross-origin-embedder-policy"], "require-corp");
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  for (const row of report.cases) {
    await page.evaluate(() => { window.__AIFF_SOURCE_READS__.length = 0; });
    await page.getByTestId("file-input").setInputFiles(path.join(runtime.directory, "trailing-id3." + row.key));
    const view = page.getByTestId("source-inspection"); if (await view.getAttribute("open") === null) await view.locator("summary").click();
    await view.getByText(row.headers.container, { exact: true }).first().waitFor();
    await view.getByText("Metadata signals", { exact: true }).waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="source-inspection"] dt')).find(dt => dt.textContent === "Metadata signals")?.nextElementSibling?.textContent.includes("ID3 tag"));
    row.ui = { container: await view.getByText("Container", { exact: true }).evaluate(dt => dt.nextElementSibling.textContent),
      metadataSignals: await view.getByText("Metadata signals", { exact: true }).evaluate(dt => dt.nextElementSibling.textContent),
      inspectionRead: await view.getByText("Inspection read", { exact: true }).evaluate(dt => dt.nextElementSibling.textContent),
      slices: await page.evaluate(() => window.__AIFF_SOURCE_READS__), state: await page.evaluate(() => window.__WITHIN_TEST__.getState().jobState) };
    assert.equal(row.ui.container, row.headers.container); assert.equal(row.ui.state, "idle"); assert.ok(row.ui.inspectionRead.startsWith(row.after.result.inspectedBytes + " bytes"));
    assert.ok(row.ui.slices.some(read => read.start > 262144)); assert.ok(row.ui.slices.every(read => read.bytes <= 22));
    assert.equal(row.ui.slices.reduce((sum, read) => sum + read.bytes, 0), row.after.result.inspectedBytes);
    await view.scrollIntoViewIfNeeded(); const screenshot = `output/playwright/${stamp}-aiff-tail-${row.key}.png`;
    await page.screenshot({ path: path.join(root, screenshot) }); report.screenshots.push({ path: screenshot, sha256: await hashFile(path.join(root, screenshot)), headedCoverage: false });
  }
  assert.deepEqual(report.network.forbidden, []); assert.deepEqual(await pins(), report.sources); assertInstalledChromePinsEqual(report.browser, await inspectInstalledChromePin());
  report.status = "passed-two-real-input-inspections-not-conversion-or-stress-acceptance";
} catch (error) { report.status = "failed"; report.failures.push(String(error.stack ?? error).slice(0, 8192)); }
finally {
  await finishOwnedCleanup([async () => { if (context) await context.close(); }, async () => { if (server) report.serverCleanup = await server.close(); }])
    .catch(error => { report.status = "failed"; report.failures.push(String(error)); });
  try {
    if (browserIdentity) { report.browserCleanup = await observeOwnedProcessExit(browserIdentity); assert.equal(report.browserCleanup.status, "owned-identity-absent"); }
    await runtime.close(); report.ownedMediaProfileScratchRemoved = true;
  } catch (error) { report.status = "failed"; report.failures.push(String(error)); }
  report.finishedAt = new Date().toISOString(); await mkdir(path.join(root, "evidence"), { recursive: true });
  const destination = path.join(root, "evidence", stamp + "-aiff-tail-inspection.json");
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ receipt: destination, status: report.status, cleanup: report.ownedMediaProfileScratchRemoved, failures: report.failures }));
  if (report.status === "failed") process.exitCode = 1;
}
