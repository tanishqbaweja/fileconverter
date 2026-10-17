// Real headless React UI coverage only; not conversion or250MiB acceptance.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, statfs } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import * as jsxRuntime from "react/jsx-runtime";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { conversionProfiles, formatById } from "../lib/capability-registry.ts";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sampleChromiumTree } from "./lib/chromium-private-memory.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { CATALOGUE_CSS } from "./lib/bounded-catalogue-candidate.mjs";
const root = path.resolve(import.meta.dirname, "..");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const runtime = await createOwnedRuntimeScratch("bounded-catalogue-ui-");
const result = { recordedAt: new Date().toISOString(), status: "running-component-only", conversions: 0,
  memoryAcceptance: false, publicAcceptance: false, headedManualValidation: false,
  sources: {}, cases: [], screenshots: [], identities: [], absences: [], cleanupErrors: [], failure: null,
  runtimeDirectory: runtime.directory, runtimeRemoved: false };
const reportPath = `evidence/${stamp}-bounded-catalogue-ui.json`;
let browser, server, identity;
try {
  const host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true); result.host = host;
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 3);
  for (const file of ["scripts/validate-bounded-catalogue.mjs", "scripts/lib/bounded-catalogue-candidate.mjs",
    "lib/published-catalogue.ts", "app/converter/PublishedFormatsCatalogue.tsx", "app/converter/ConverterApp.tsx",
    "lib/capability-registry.ts", "app/globals.css", "package-lock.json", "tests/bounded-catalogue.test.mjs"]) {
    const bytes = await readFile(path.join(root, file)); result.sources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
  }
  const app = (await readFile(path.join(root, "app/converter/ConverterApp.tsx"))).toString();
  const ast = ts.createSourceFile("ConverterApp.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression, helper;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "publishedFormatsSection") expression = node.initializer.arguments[0].body.getText(ast);
    if (ts.isFunctionDeclaration(node) && node.name?.text === "formatBytes") helper = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(expression && helper);
  const componentSource = (await readFile(path.join(root, "app/converter/PublishedFormatsCatalogue.tsx"), "utf8")).replaceAll("\r\n", "\n");
  assert.ok(componentSource.includes(helper.replaceAll("\r\n", "\n")), "Original card byte formatter retained exactly");
  const compiled = ts.transpileModule(`${helper}\nfunction Reference(){return ${expression};}\nReference;`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: "reference.tsx" });
  const Reference = runInNewContext(compiled.outputText, { exports: {}, conversionProfiles, formatById,
    require: id => { assert.equal(id, "react/jsx-runtime"); return jsxRuntime; } }, { timeout: 1000 });
  const referenceHtml = renderToStaticMarkup(createElement(Reference));
  const js = (await build({ stdin: { contents: 'import {createElement} from "react";import {createRoot} from "react-dom/client";import {PublishedFormatsCatalogue} from "./app/converter/PublishedFormatsCatalogue";createRoot(document.getElementById("root")).render(createElement(PublishedFormatsCatalogue));',
    resolveDir: root, loader: "tsx" }, bundle: true, write: false, format: "iife", jsx: "automatic", minify: true,
    define: { "process.env.NODE_ENV": '"production"' } })).outputFiles[0].text;
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  const requests = [];
  server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url }); assert.ok(requests.length < 32);
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    if (request.url === "/app.js") { response.setHeader("Content-Type", "text/javascript"); response.end(js); }
    else if (request.url === "/" || request.url === "/reference") {
      response.setHeader("Content-Type", "text/html");
      response.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}${CATALOGUE_CSS}</style><main id="root">${request.url === "/reference" ? referenceHtml : ""}</main>${request.url === "/" ? '<script src="/app.js"></script>' : ""}`);
    } else { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const pin = await inspectInstalledChromePin(); result.browserPin = pin;
  const child = spawn(pin.launcher.path, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync", "--remote-debugging-port=0", `--user-data-dir=${runtime.directory}`, "about:blank"],
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  child.on("error", () => {}); identity = await queryReliableProcessIdentity(child.pid); assert.equal(identity.parentPid, process.pid);
  result.identity = identity;
  // Durable launch record before interacting with a browser process.
  await writeFile(path.join(root, reportPath), JSON.stringify(result, null, 2), { flag: "wx" });
  let port;
  const deadline = Date.now() + 30000;
  while (!port && Date.now() < deadline) {
    try { port = Number((await readFile(path.join(runtime.directory, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); } catch { /* bounded startup */ }
    if (!port) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(port); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); assert.equal(browser.version(), pin.version);
  const context = browser.contexts()[0], page = context.pages()[0], forbidden = [], errors = [];
  await context.route("**/*", route => {
    if (!route.request().url().startsWith(origin + "/")) { forbidden.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  page.on("pageerror", error => errors.push(error.message));
  const cards = () => page.locator(".matrix article").evaluateAll(nodes => nodes.map(node => {
    const copy = node.cloneNode(true); copy.removeAttribute("data-profile-id"); return copy.outerHTML;
  }));
  await page.goto(origin + "/reference"); const expected = await cards();
  const profiles = conversionProfiles.filter(profile => profile.public && profile.automatedTestStatus === "passed");
  assert.equal(expected.length, profiles.length); result.registryCount = profiles.length;
  result.referenceCardsSha256 = sha(JSON.stringify(expected));
  result.registryIdsSha256 = sha(JSON.stringify(profiles.map(profile => profile.id)));
  const captureBirths = async () => result.identities.push(...(await sampleChromiumTree(child.pid)).processes);
  await captureBirths();
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.goto(origin);
    await page.getByRole("searchbox", { name: "Search supported formats" }).waitFor();
    const observed = [], ids = []; let pages = 0, maxMounted = 0;
    while (true) {
      const visible = await cards(); assert.ok(visible.length > 0 && visible.length <= 24); maxMounted = Math.max(maxMounted, visible.length);
      observed.push(...visible); ids.push(...await page.locator(".matrix article").evaluateAll(nodes => nodes.map(node => node.dataset.profileId)));
      pages++; assert.ok(pages <= Math.ceil(profiles.length / 24));
      const next = page.getByRole("button", { name: "Next formats", exact: true });
      if (await next.isDisabled()) break;
      await next.focus(); await page.keyboard.press("Enter");
      await page.getByRole("status").filter({ hasText: `Page ${pages + 1} of` }).waitFor();
    }
    assert.deepEqual(observed, expected, "Every card retains original rendered content exactly, in registry order");
    assert.deepEqual(ids, profiles.map(profile => profile.id));
    await page.getByRole("button", { name: "Previous formats", exact: true }).click();
    await page.getByRole("status").filter({ hasText: `Page ${pages - 1} of` }).waitFor();
    const search = page.getByRole("searchbox", { name: "Search supported formats" });
    await search.fill("  PNG  ");
    assert.ok((await cards()).length > 0); assert.ok((await page.getByRole("status").innerText()).includes("Page 1 of"));
    assert.equal(await page.getByRole("button", { name: "Previous formats", exact: true }).isDisabled(), true);
    await search.fill("NO_MATCH_音楽"); assert.equal((await cards()).length, 0);
    assert.ok((await page.getByRole("status").innerText()).includes("No matching routes"));
    assert.equal(await page.getByRole("button", { name: "Next formats", exact: true }).isDisabled(), true);
    await search.fill(profiles.at(-1).id); const found = await page.locator(".matrix article").evaluateAll(nodes => nodes.map(node => node.dataset.profileId));
    assert.ok(found.includes(profiles.at(-1).id));
    await search.fill(""); await search.focus();
    assert.equal(await search.evaluate(node => node === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const screenshot = `output/playwright/${stamp}-bounded-catalogue-${viewport.width}.png`;
    await page.screenshot({ path: path.join(root, screenshot), fullPage: true });
    const bytes = await readFile(path.join(root, screenshot)); result.screenshots.push({ path: screenshot, bytes: bytes.length, sha256: sha(bytes) });
    await captureBirths(); result.cases.push({ viewport, pages, allCardsExact: true, allIdsExact: true,
      maxMounted, finalMounted: (await cards()).length, keyboardNavigation: true, searchAndEmptyAndReset: true, noHorizontalOverflow: true });
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); result.requests = requests; result.pageErrors = errors; result.forbiddenRequests = forbidden;
  assertInstalledChromePinsEqual(pin, await inspectInstalledChromePin());
  for (const [file, record] of Object.entries(result.sources)) assert.equal(sha(await readFile(path.join(root, file))), record.sha256);
  result.status = "passed-component-only-all-routes-exact-bounded-dom";
} catch (error) { result.failure = { message: error.message, stack: error.stack?.slice(0, 8192) }; process.exitCode = 1; }
finally {
  try { if (browser) { const session = await browser.newBrowserCDPSession(); await session.send("Browser.close").catch(() => {}); } }
  catch (error) { result.cleanupErrors.push("close request: " + String(error)); }
  try {
    await browser?.close();
    const births = [...new Map([identity, ...result.identities].filter(Boolean).map(row => [row.pid + ":" + row.createdAt, row])).values()];
    for (const birth of births) { const absence = await observeOwnedProcessExit(birth); assert.equal(absence.status, "owned-identity-absent"); result.absences.push(absence); }
    await runtime.close(); result.runtimeRemoved = true;
  } catch (error) { result.cleanupErrors.push(String(error)); process.exitCode = 1; }
  if (server) await new Promise(resolve => server.close(resolve));
  if (result.failure || result.cleanupErrors.length) result.status = "failed-component-only-bounded-catalogue";
  await writeFile(path.join(root, reportPath), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ path: reportPath, status: result.status, cases: result.cases, failure: result.failure, cleanupErrors: result.cleanupErrors }));
}
