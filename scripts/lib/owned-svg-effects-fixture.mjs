// Independent deterministic fixture generation only, never the production converter.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { runInNewContext } from "node:vm";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch } from "./owned-runtime-scratch.mjs";
import { queryReliableProcessIdentity } from "./reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./owned-process-exit-observation.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./installed-chrome-pin.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export const svgEffectsGeneratorSha256 = "bd3165aec5e8a48ac330fa1d422563c639e600f04c8b2423413baa1efc4816af";
const root = path.resolve(import.meta.dirname, "../.."), execute = promisify(execFile);
// Metadata only, never bodies/headers/cookies. This observes; it does not claim
// interception or suppress normal browser services, extensions, cache or workers.
export function createSvgReferenceNetworkObservation(forbidden) {
  assert.ok(Array.isArray(forbidden)&&forbidden.length===0);
  const identities=new WeakMap(),report={observedHttpRequests:0,overflow:false,requests:[],
    interceptionInstalled:false,blockedBeforeDispatch:null,requestBodiesOrHeadersRecorded:false,
    browserServicesDisabled:false,sourceAttributionIsBestEffort:true};
  const safe=action=>{try{return action();}catch{return null;}};
  const observe=request=>{
    const url=request.url();if(!["http:","https:"].includes(new URL(url).protocol))return;
    report.observedHttpRequests++;
    if(forbidden.length>=32){report.overflow=true;return;}
    const entry={method:request.method(),url:url.slice(0,512)};forbidden.push(entry);
    const frameUrl=safe(()=>request.frame()?.url()),workerUrl=safe(()=>request.serviceWorker()?.url());
    const record={...entry,resourceType:safe(()=>request.resourceType()),
      frameUrl:typeof frameUrl==="string"?frameUrl.slice(0,512):null,
      serviceWorkerUrl:typeof workerUrl==="string"?workerUrl.slice(0,512):null,
      responseStatus:null,responseFromServiceWorker:null,failureText:null,blockedBeforeDispatch:null};
    identities.set(request,record);report.requests.push(record);
  };
  const response=value=>{const record=identities.get(value.request());if(record){record.responseStatus=value.status();record.responseFromServiceWorker=safe(()=>value.fromServiceWorker());}};
  const failed=request=>{const record=identities.get(request);if(record){const message=safe(()=>request.failure()?.errorText);record.failureText=typeof message==="string"?message.slice(0,256):null;}};
  return{report,observe,response,failed};
}
export function buildHistoricalSvgEffectsSource(generatorBytes) {
  assert.equal(sha(generatorBytes), svgEffectsGeneratorSha256);
  const source = generatorBytes.toString(), begin = source.indexOf("function buildSvg("), end = source.indexOf("\nfunction countElements(", begin);
  assert.ok(begin > 0 && end > begin);
  return runInNewContext("(" + source.slice(begin, end) + ")(3000,2000,30)", {}, { timeout: 1000 });
}
export async function generateOwnedSvgEffectsFixture({ runtime, fixtureRoot, receipt }) {
  assert.equal(path.dirname(runtime.directory), path.join(root, "work"));
  assert.match(path.basename(runtime.directory), /^svg-reproduced-qualification-[A-Za-z0-9]{6}$/);
  assert.equal(fixtureRoot, path.join(runtime.directory, "fixture"));
  const generator = await readFile(path.join(root, "scripts/generate-svg-effects-fixtures.mjs"));
  const source = Buffer.from(buildHistoricalSvgEffectsSource(generator));
  const historical = JSON.parse(await readFile(path.join(root, "fixtures/stress/images/svg-effects-6m.svg.json")));
  assert.equal(source.length, historical.bytes); assert.equal(sha(source), historical.sha256);
  receipt.source = { bytes: source.length, sha256: sha(source), width: 3000, height: 2000,
    elements: 6719, filters: 1, masks: 1, filterPrimitives: 7, sameHistoricalSvgBytes: true };
  await mkdir(fixtureRoot);
  const sourceFile = path.join(fixtureRoot, "svg-effects-6m.svg"), referenceFile = path.join(fixtureRoot, "svg-effects-6m-reference.png");
  const inputHandle = await open(sourceFile, "wx");
  try { await inputHandle.writeFile(source); } finally { await inputHandle.close(); }
  let owned, child, childClosed, birth, browser, output, written = 0, chunks = 0, maximumChunkBytes = 0;
  const digest = createHash("sha256"), forbidden = [], network=createSvgReferenceNetworkObservation(forbidden);
  receipt.referenceNetwork=network.report;let primaryFailure=false;
  try {
    receipt.browserBefore = await inspectInstalledChromePin();
    owned = await createOwnedRuntimeScratch("svg-effects-reference-");
    const profile = path.join(owned.directory, "profile"); await mkdir(profile);
    receipt.chromeArguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
    child = spawn(receipt.browserBefore.launcher.path, receipt.chromeArguments,
      { cwd: root, env: owned.env, windowsHide: true, stdio: "ignore" });
    childClosed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    childClosed.catch(() => {});
    birth = await queryReliableProcessIdentity(child.pid); assert.ok(birth); receipt.birth = birth;
    const deadline = Date.now() + 30000; let lines;
    while (Date.now() < deadline && !lines) {
      assert.equal(child.exitCode, null);
      try { lines = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/); }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.ok(lines && Number(lines[0]) > 0);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${Number(lines[0])}`);
    assert.equal(browser.version(), receipt.browserBefore.version);
    const context = browser.contexts()[0], page = context.pages()[0]; assert.equal(page.url(), "about:blank");
    context.on("request",network.observe);context.on("response",network.response);context.on("requestfailed",network.failed);
    output = await open(referenceFile, "wx");
    await page.exposeBinding("__withinSvgReferenceChunk", async (_caller, values) => {
      assert.ok(Array.isArray(values) && values.length > 0 && values.length <= 65536);
      assert.ok(values.every(value => Number.isInteger(value) && value >= 0 && value <= 255));
      const bytes = Buffer.from(values); written += bytes.length; assert.ok(written <= 32 * 1024 ** 2);
      for (let offset = 0; offset < bytes.length;) {
        const row = await output.write(bytes, offset, bytes.length - offset); assert.ok(row.bytesWritten > 0); offset += row.bytesWritten;
      }
      digest.update(bytes); chunks++; maximumChunkBytes = Math.max(maximumChunkBytes, bytes.length);
    });
    receipt.render = await page.evaluate(async svg => {
      const image = new Image(), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      let canvas;
      try {
        image.src = url; await image.decode();
        canvas = document.createElement("canvas"); canvas.width = 3000; canvas.height = 2000;
        const context = canvas.getContext("2d", { alpha: true }); if (!context) throw new Error("No Canvas2D reference renderer");
        context.drawImage(image, 0, 0, 3000, 2000);
        const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (!(png instanceof Blob) || png.size < 1 || png.size > 32 * 1024 ** 2) throw new Error("Independent PNG reference size guard");
        const reader = png.stream().getReader();
        try { for (;;) { const { done, value } = await reader.read(); if (done) break;
          for (let offset = 0; offset < value.byteLength; offset += 65536)
            await window.__withinSvgReferenceChunk(Array.from(value.subarray(offset, offset + 65536)));
        } } finally { await reader.cancel(); reader.releaseLock(); }
        return { width: canvas.width, height: canvas.height, pngBytes: png.size, renderer: "Independent Chromium SVG and Canvas2D, not resvg" };
      } finally { URL.revokeObjectURL(url); image.src = ""; if (canvas) { canvas.width = 0; canvas.height = 0; } }
    }, source.toString());
    await output.close(); output = null;
    assert.equal(written, receipt.render.pngBytes); assert.equal((await stat(referenceFile)).size, written); assert.deepEqual(forbidden, []);
    receipt.reference = { bytes: written, sha256: digest.digest("hex"), chunks, maximumChunkBytes,
      rendererVersion: browser.version(), historicalRenderer: historical.referenceRenderer,
      historicalBytes: historical.validationBytes, historicalSha256: historical.validationSha256 };
    receipt.reference.sameHistoricalReferenceBytes = receipt.reference.bytes === historical.validationBytes && receipt.reference.sha256 === historical.validationSha256;
    const probe = await execute("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", referenceFile],
      { cwd: root, env: owned.env, windowsHide: true, timeout: 10000, maxBuffer: 16384 });
    receipt.reference.probe = JSON.parse(probe.stdout); assert.deepEqual(receipt.reference.probe.streams, [{ codec_name: "png", width: 3000, height: 2000 }]);
    await execute("ffmpeg", ["-v", "error", "-i", referenceFile, "-f", "null", "NUL"],
      { cwd: root, env: owned.env, windowsHide: true, timeout: 15000, maxBuffer: 16384 });
    receipt.reference.independentNativeDecodePassed = true;
    receipt.conversionAcceptance = false; receipt.forbiddenRequests = forbidden;
  } catch(error) { primaryFailure=true;throw error; } finally {
    const cleanupErrors = [], attempt = async action => { try { await action(); } catch (error) { cleanupErrors.push(error); } };
    await attempt(async () => { await output?.close(); });
    await attempt(async () => { await browser?.close(); });
    await attempt(async () => {
      if (child && child.exitCode === null && child.signalCode === null) {
        assert.ok(birth); assert.deepEqual(await queryReliableProcessIdentity(child.pid), birth);
        await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
        await childClosed;
      }
    });
    await attempt(async () => {
      if (birth) { receipt.cleanup = await observeOwnedProcessExit(birth); assert.equal(receipt.cleanup.status, "owned-identity-absent"); }
      assert.ok(!child?.pid || receipt.cleanup?.status === "owned-identity-absent", "Never dispose a live/unverified fixture browser profile");
      await owned?.close(); receipt.ownedReferenceProfileRemoved = Boolean(owned);
      if (owned) await assert.rejects(access(owned.directory), { code: "ENOENT" });
    });
    await attempt(async () => { if (receipt.browserBefore) assertInstalledChromePinsEqual(receipt.browserBefore, await inspectInstalledChromePin()); });
    receipt.cleanupErrors = cleanupErrors.map(error => String(error));
    receipt.forbiddenRequests=forbidden;receipt.forbiddenRequestOverflow=network.report.overflow;
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Independent SVG reference cleanup/pin verification failed");
    // Include late requests during native reference validation/browser closure.
    if(!primaryFailure){assert.deepEqual(forbidden,[]);assert.equal(network.report.overflow,false);}
  }
}
