// Real Chromium CSS/component rendering only. No conversion or memory acceptance.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile, lstat, statfs } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sampleChromiumTree } from "./lib/chromium-private-memory.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { renderStatusPanels, PAINT_BASE_CSS, PAINT_WRAP_CSS, PAINT_BOUNDARY_CSS, PAINT_VISUAL_PROOF } from "./lib/paint-boundary-candidate.mjs";
const require = createRequire(import.meta.url), { PNG } = require("../node_modules/playwright-core/lib/utilsBundle.js");
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const runtime = await createOwnedRuntimeScratch("paint-boundary-visual-");
const app = await readFile(path.join(root, "app/converter/ConverterApp.tsx"), "utf8");
const ownFiles = ["scripts/validate-paint-boundary-visual.mjs", "scripts/lib/paint-boundary-candidate.mjs", "app/converter/ConverterApp.tsx", "package-lock.json"];
const sources = {}; for (const file of ownFiles) { const bytes = await readFile(path.join(root, file)); sources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") }; }
const original = async () => { const file = path.join(root, "test.mkv"), stat = await lstat(file); assert.equal(stat.size, 2958573265);
  const hash = createHash("sha256"); for await (const data of createReadStream(file, { highWaterMark: 1048576 })) hash.update(data);
  const sha256 = hash.digest("hex"); assert.equal(sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34"); return { bytes: stat.size, sha256 }; };
const result = { recordedAt: new Date().toISOString(), status: "running-component-only", css: PAINT_BOUNDARY_CSS,
  sources, cases: [], conversions: 0, memoryAcceptance: false, headedManualValidation: false, browserPin: null,
  identity: null, absence: null, sampledBirths: [], sampledBirthAbsences: [], protectedBefore: null, protectedAfter: null, failure: null, cleanupErrors: [], runtimeRemoved: false };
result.runtimeDirectory = runtime.directory;
const livePath=path.join(root,`evidence/${stamp}-paint-boundary-visual-live.json`);
let browser;
try {
  const host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true); result.host = host;
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 3);
  result.protectedBefore = await original(); const pin = await inspectInstalledChromePin(); result.browserPin = pin;
  const child = spawn(pin.launcher.path, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync", "--remote-debugging-port=0", `--user-data-dir=${runtime.directory}`, "about:blank"],
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  child.on("error", () => {}); result.identity = await queryReliableProcessIdentity(child.pid); assert.equal(result.identity.parentPid, process.pid);
  await writeFile(livePath, JSON.stringify(result, null, 2), { flag: "wx" });
  let port; const deadline = Date.now() + 30000;
  while (!port && Date.now() < deadline) { try { port = Number((await readFile(path.join(runtime.directory, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); } catch { /* bounded startup */ }
    if (!port) await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(port); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); assert.equal(browser.version(), pin.version);
  const context = browser.contexts()[0], page = context.pages()[0];
  result.sampledBirths.push(...(await sampleChromiumTree(child.pid)).processes);
  await context.route("**/*", route => route.abort("blockedbyclient"));
  const metrics = { inputBytes: 2958573265, outputBytes: 6414309978, queuedBytes: 0, elapsedMs: 123456,
    peakWasmMemoryBytes: 50331648, activeWorkerCount: 1 };
  const settleScroll=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const started=performance.now();let previous=scrollY,stable=0,frames=0;
    const frame=()=>{frames++;const current=scrollY;stable=Math.abs(current-previous)<0.01?stable+1:0;previous=current;
      if(performance.now()-started>=400&&stable>=4)return resolve({frames,elapsedMs:performance.now()-started,scrollY});
      if(performance.now()-started>2500)return reject(new Error("Component focus scroll did not settle"));requestAnimationFrame(frame);};requestAnimationFrame(frame);
  }));
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const state of ["idle", "running", "complete", "cancelled", "error", "unicode-long"]) {
      result.currentCase={viewport,state};await writeFile(livePath,JSON.stringify(result,null,2));
      const long = state === "unicode-long";
      const rendered = renderStatusPanels(app, { metrics: state === "idle" ? null : metrics, phase: "Browser conversion", progress: 37.5,
        throughput: 1234567, selectedProfile: { engine: "FFmpeg MPEG-2" }, estimatedRemainingMs: 45678, jobState: long ? "error" : state,
        peakJsHeap: null, warnings: state === "idle" ? [] : [long ? "警告_" + "長いファイル名".repeat(35) : "Source subtitles cannot be represented in this destination and are excluded."],
        error: state === "error" ? "The destination rejected a bounded write." : long ? "Erreur_" + "café音楽".repeat(50) : null });
      const baseCss = PAINT_BASE_CSS + (long ? PAINT_WRAP_CSS : "");
      await page.setContent('<!doctype html><meta charset="utf-8"><style>' + baseCss + '</style><style>main{padding:32px}.converter-card{width:510px;max-width:100%;margin:auto} @media(max-width:500px){main{padding:16px}}</style>' + rendered.markup);
      await page.evaluate(() => document.fonts.ready); await page.getByRole("button", { name: "Continue", exact: true }).focus();
      const referenceScroll=await settleScroll();
      const observe = () => page.evaluate(() => ({ text: document.querySelector("main").textContent,
        geometry: [...document.querySelectorAll("main,section,.progress-panel,.progress-panel *,p,button")].map(element => {
          const rect = element.getBoundingClientRect(); return { tag: element.tagName, className: element.className, x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }),
        overflow: [...document.querySelectorAll(".progress-panel,.warning,.error")].some(element => element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) }));
      const before = await observe(), imageA = await page.screenshot({ fullPage: true, animations: "disabled" });
      await page.addStyleTag({ content: PAINT_BOUNDARY_CSS }); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const candidateScroll=await settleScroll();
      const after = await observe(), imageB = await page.screenshot({ fullPage: true, animations: "disabled" });
      assert.deepEqual(after, before); assert.equal(after.overflow, false);
      const pngA = PNG.sync.read(imageA), pngB = PNG.sync.read(imageB);
      assert.equal(pngA.width, pngB.width); assert.equal(pngA.height, pngB.height);
      let changedPixels=0;
      for(let offset=0;offset<pngA.data.length;offset+=4){if(pngA.data[offset]!==pngB.data[offset]||pngA.data[offset+1]!==pngB.data[offset+1]||pngA.data[offset+2]!==pngB.data[offset+2]||pngA.data[offset+3]!==pngB.data[offset+3])changedPixels++;}
      if(changedPixels){result.pixelFailure={viewport,state,changedPixels,images:[]};for(const[side,bytes]of[["before",imageA],["after",imageB]]){
        const file=`output/playwright/${stamp}-paint-boundary-${viewport.width}-${state}-failed-${side}.png`;
        await writeFile(path.join(root,file),bytes,{flag:"wx"});result.pixelFailure.images.push({path:file,bytes:bytes.length,sha256:sha(bytes)});
      }}
      // Never ask assert to format multi-megabyte pixel arrays on failure.
      assert.equal(changedPixels,0,"Paint boundary changed visible pixels");
      const record = { viewport, state, componentScope: rendered.scope, sectionsSha256: rendered.sectionsSha256,
        helpersSha256: rendered.helpersSha256, markupSha256: sha(rendered.markup), longReferenceUsesWrapOnly: long,
        referenceScroll,candidateScroll,
        exactPixels: true, exactGeometry: true, textPreserved: true, noOverflow: true, pngBeforeSha256: sha(imageA), pngAfterSha256: sha(imageB) };
      if (state === "error") { record.images = [];
        for (const [side, bytes] of [["before", imageA], ["after", imageB]]) {
          const file = `output/playwright/${stamp}-paint-boundary-${viewport.width}-error-${side}.png`;
          await writeFile(path.join(root, file), bytes, { flag: "wx" }); record.images.push({ path: file, bytes: bytes.length, sha256: sha(bytes) });
        }
      }
      result.cases.push(record);
      await writeFile(livePath,JSON.stringify(result,null,2));
    }
  }
  assert.equal(result.cases.length, 12); assertInstalledChromePinsEqual(pin, await inspectInstalledChromePin());
} catch (error) { result.failure = { name: error.name, message: String(error.message).slice(0, 4096) }; process.exitCode = 1; }
finally {
  try{if(browser&&result.identity)result.sampledBirths.push(...(await sampleChromiumTree(result.identity.pid)).processes);}
  catch(error){result.cleanupErrors.push("Final tree sample: "+String(error).slice(0,1024));}
  // CDP-connected browser.close() disconnects; explicitly close ONLY our browser.
  try{if(browser){const session=await browser.newBrowserCDPSession();await session.send("Browser.close").catch(()=>{});}}
  catch(error){result.cleanupErrors.push("Browser close request: "+String(error).slice(0,1024));}
  try { await browser?.close(); if (result.identity) { result.absence = await observeOwnedProcessExit(result.identity); assert.equal(result.absence.status, "owned-identity-absent"); }
    const identities=[...new Map(result.sampledBirths.map(row=>[row.pid+":"+row.createdAt,row])).values()];
    for(const identity of identities){const absence=await observeOwnedProcessExit(identity);assert.equal(absence.status,"owned-identity-absent");result.sampledBirthAbsences.push(absence);}
    await runtime.close(); result.runtimeRemoved = true; result.protectedAfter = await original(); assert.deepEqual(result.protectedAfter, result.protectedBefore);
  } catch (error) { result.cleanupErrors.push(String(error).slice(0, 2048)); process.exitCode = 1; }
  result.status = result.failure || result.cleanupErrors.length ? "failed-component-only-paint-boundary-visual" : "passed-component-only-paint-boundary-pixels-and-geometry";
  await writeFile(path.join(root, PAINT_VISUAL_PROOF), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: PAINT_VISUAL_PROOF, status: result.status, cases: result.cases.length, failure: result.failure, cleanupErrors: result.cleanupErrors }));
}
