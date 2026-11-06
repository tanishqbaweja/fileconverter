// Genuine small production-browser conversion, not public/stress qualification.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { zipSync, strToU8 } from "fflate";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { startClassifiedChromiumMemoryMonitor } from "./lib/birth-type-capture.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { encodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { bindOpfsOutputValidationBacking, assertOpfsOutputValidationBackingUnchanged } from "./lib/opfs-output-validation-backing.mjs";
import { cancelBrowserConversionBeforeCleanup } from "./lib/cancel-browser-conversion-before-cleanup.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { selectOwnedLocalBrowserFile } from "./lib/select-owned-local-browser-file.mjs";

assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hashFile = async file => { const hash = createHash("sha256"); for await (const b of createReadStream(file, { highWaterMark: 262144 })) hash.update(b); return hash.digest("hex"); };
const original = async () => ({ bytes: (await stat(path.join(root, "test.mkv"))).size, sha256: await hashFile(path.join(root, "test.mkv")) });
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", cases: [], sourcePins: {}, failures: [],
  scope: "Small private DOCX HTML production worker: three same-page repeats, cancellation/write-failure recovery, independent physical-output validation and sampled full-Chrome memory",
  headed: false, browserServicesDisabled: false, nativeConversionUsed: false, publicPromotion: false,
  stressAcceptance: false, nativePickerVerified: false, largeFileScalingVerified: false, speedImprovementProven: false,
  memoryFormula: "(peak complete spawned Chrome process-tree private bytes during full control window - earliest stable same clean blank Chrome private bytes) / 1048576",
  traceMode: { screenshots: true, domSnapshots: false, networkBodies: false }, requestCount: 0, forbiddenRequests: [] };
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const p = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const packageBytes = (body, level = 6, invalidPackage = false) => zipSync({
  "[Content_Types].xml": strToU8('<Types xmlns="' + (invalidPackage ? "" : "http://schemas.openxmlformats.org/package/2006/content-types") + '">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  "word/document.xml": strToU8(`<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>`),
}, { level });
const sourceValidator = String.raw`
import sys,json,zipfile,xml.etree.ElementTree as ET,xml.parsers.expat
types='http://schemas.openxmlformats.org/package/2006/content-types'
rels='http://schemas.openxmlformats.org/package/2006/relationships'
word='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 def metadata(name):
  with z.open(name) as f:b=f.read(4097)
  assert len(b)<=4096
  return ET.fromstring(b)
 ct=metadata('[Content_Types].xml');assert ct.tag=='{'+types+'}Types'
 assert any(x.tag=='{'+types+'}Override' and x.get('PartName')=='/word/document.xml' and x.get('ContentType')=='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' for x in ct)
 assert any(x.tag=='{'+types+'}Default' and x.get('Extension')=='rels' and x.get('ContentType')=='application/vnd.openxmlformats-package.relationships+xml' for x in ct)
 relationships=metadata('_rels/.rels');assert relationships.tag=='{'+rels+'}Relationships'
 assert any(x.tag=='{'+rels+'}Relationship' and x.get('Id') and x.get('Type')=='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' and x.get('Target')=='word/document.xml' and x.get('TargetMode')!='External' for x in relationships)
 parser=xml.parsers.expat.ParserCreate(namespace_separator='}');state={'depth':0,'root':False,'body':0,'paragraphs':0}
 def start(name,attrs):
  if state['depth']==0:assert name==word+'}document';state['root']=True
  if name==word+'}body':assert state['depth']==1;state['body']+=1
  if name==word+'}p':state['paragraphs']+=1
  state['depth']+=1;assert state['depth']<=256
 def end(name):state['depth']-=1
 def forbidden(*args):raise ValueError('DTD forbidden')
 parser.StartElementHandler=start;parser.EndElementHandler=end;parser.StartDoctypeDeclHandler=forbidden
 with z.open('word/document.xml') as f:
  while True:
   b=f.read(65536)
   if not b:break
   parser.Parse(b,False)
 parser.Parse(b'',True)
 assert state['root'] and state['body']==1 and state['depth']==0
 print(json.dumps({'zipCrcVerified':True,'packageNamespacesAndMainRelationshipVerified':True,'wordXmlWellFormed':True,'paragraphs':state['paragraphs'],'sourceValidator':'independent Python zipfile, bounded package metadata ElementTree and streaming Expat; not complete OOXML XSD/layout validation'}))
`;
const validator = String.raw`
import sys,json,hashlib
from html.parser import HTMLParser
class Document(HTMLParser):
 def __init__(self): super().__init__(convert_charrefs=True); self.tags={}; self.paragraphs=[]; self.current=None; self.csp=False
 def handle_starttag(self,tag,attrs):
  assert tag in ['html','head','meta','title','style','body','p','strong','em','u','s','table','tr','td','br'],tag
  self.tags[tag]=self.tags.get(tag,0)+1
  if tag=='p': assert self.current is None; self.current=[]
  if tag=='meta' and dict(attrs).get('http-equiv','').lower()=='content-security-policy': self.csp="default-src 'none'" in dict(attrs).get('content','')
 def handle_endtag(self,tag):
  if tag=='p': assert self.current is not None; self.paragraphs.append(''.join(self.current)); self.current=None
 def handle_data(self,data):
  if self.current is not None:self.current.append(data)
h=hashlib.sha256(); parser=Document()
with open(sys.argv[1],'rb') as f:
 import codecs
 decoder=codecs.getincrementaldecoder('utf-8')('strict')
 while True:
  b=f.read(65536)
  if not b:break
  h.update(b);parser.feed(decoder.decode(b))
 parser.feed(decoder.decode(b'',True));parser.close()
assert parser.paragraphs==['Hello '+chr(0x03b2)+' & <script>not-executable</script> '+chr(0x1f600),'Cell one','Cell two','Inserted'],parser.paragraphs
assert parser.tags['strong']==1 and parser.tags['em']==1 and parser.tags['table']==1 and parser.tags['tr']==1 and parser.tags['td']==2
assert parser.csp and parser.current is None
print(json.dumps({'sha256':h.hexdigest(),'paragraphs':len(parser.paragraphs),'tableCells':parser.tags['td'],'strong':parser.tags['strong'],'italic':parser.tags['em'],'csp':parser.csp,'validator':'independent Python streaming HTMLParser, exact Unicode paragraph content and semantic tag counts'}))
`;
let runtime, server, chrome, chromeBirth, browser, page, context, monitor, timer, pending = null, observerError = null, traceStarted = false;
const samples = []; let controlStart = null, controlEnd = null;
const drain = () => pending ??= (async () => { if (!monitor) return; const batch = await monitor.drain();
  assert.equal(batch.overflow, false); assert.ok(samples.length + batch.samples.length <= 1200, "Finite small-control sample cap"); samples.push(...batch.samples);
})().finally(() => { pending = null; });
const stable = async () => {
  const rows = [], deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await drain(); const last = samples.at(-1);
    if (last && rows.at(-1)?.sequence !== last.sequence) rows.push({ ...last, elapsedMs: Date.parse(last.timestamp) });
    const value = stableWindow(rows); if (value) return value;
    await pause(1000);
  }
  throw new Error("Unchanged30s/five-sample/8s/2% stable baseline unavailable");
};
try {
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
  report.python = (await execute("python", ["--version"], { windowsHide: true, timeout: 10000 })).stdout.trim();
  report.protectedOriginalBefore = await original(); assert.deepEqual(report.protectedOriginalBefore,
    { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  report.browserBefore = await inspectInstalledChromePin();
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true, timeout: 10000 })).stdout.trim();
  for (const file of ["scripts/qualify-docx-html.mjs", "workers/docx-html-conversion.ts", "workers/docx-conversion.ts",
    "workers/conversion.worker.ts", "lib/capability-registry.ts", "package-lock.json", "scripts/lib/birth-aware-chromium-memory.mjs",
    "scripts/lib/birth-type-capture.mjs", "scripts/lib/select-owned-local-browser-file.mjs"])
    report.sourcePins[file] = await hashFile(path.join(root, file));
  runtime = await createOwnedRuntimeScratch("docx-html-qualification-");
  const env = { ...runtime.env, PYTHONDONTWRITEBYTECODE: "1", WRANGLER_SEND_METRICS: "false" };
  report.validatorControls = [];
  const referenceHtml = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>' +
    '<p><strong><em>Hello β &amp; &lt;script&gt;not-executable&lt;/script&gt; 😀</em></strong></p>' +
    '<table><tr><td><p>Cell one</p></td><td><p>Cell two</p></td></tr></table><p>Inserted</p></body></html>';
  for (const [name, html, accepted] of [["positive", referenceHtml, true], ["wrong-text", referenceHtml.replace("Cell two", "wrong"), false],
    ["active-markup", referenceHtml.replace("</body>", "<script>alert(1)</script></body>"), false]]) {
    const file = path.join(runtime.directory, `validator-${name}.html`); await writeFile(file, html, { flag: "wx" });
    let exitCode = 0;
    try { await execute("python", ["-c", validator, file], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 }); }
    catch (error) { assert.equal(typeof error.code, "number"); exitCode = error.code; }
    assert.equal(exitCode === 0, accepted, "Independent validator preflight: " + name);
    report.validatorControls.push({ name, expectedAccepted: accepted, exitCode });
  }
  const input = path.join(runtime.directory, "structure.docx"), cancellation = path.join(runtime.directory, "cancel.docx");
  const body = '<w:p><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Hello β &amp; &lt;script&gt;not-executable&lt;/script&gt; 😀</w:t></w:r></w:p>' +
    `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid><w:tr><w:tc>${p("Cell one")}</w:tc><w:tc>${p("Cell two")}</w:tc></w:tr></w:tbl>` +
    '<w:p><w:del w:id="1" w:author="fixture"><w:r><w:delText>Deleted</w:delText></w:r></w:del><w:ins w:id="2" w:author="fixture"><w:r><w:t>Inserted</w:t></w:r></w:ins></w:p>';
  await writeFile(input, packageBytes(body), { flag: "wx" });
  // Finite generated cancellation fixture BEFORE browser conversion, never a user-file copy.
  await writeFile(cancellation, packageBytes(p("cancel payload ".repeat(600000)), 0), { flag: "wx" });
  report.sourceValidation = [];
  for (const [kind, file] of [["structure", input], ["cancellation", cancellation]]) {
    const proof = JSON.parse((await execute("python", ["-c", sourceValidator, file], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 })).stdout);
    report.sourceValidation.push({ kind, ...proof });
  }
  const invalidPackage = path.join(runtime.directory, "invalid-package.docx"); await writeFile(invalidPackage, packageBytes(p("invalid package"), 6, true), { flag: "wx" });
  await assert.rejects(execute("python", ["-c", sourceValidator, invalidPackage], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 }), error => error.code === 1);
  report.invalidPackageControlRejected = true;
  report.fixture = { bytes: (await stat(input)).size, sha256: await hashFile(input), cancelBytes: (await stat(cancellation)).size };
  const port = await new Promise((resolve, reject) => { const socket = createServer(); socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const p = socket.address().port; socket.close(error => error ? reject(error) : resolve(p)); }); });
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port });
  const profile = path.join(runtime.directory, "profile");
  report.launchArguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  chrome = spawn(report.browserBefore.launcher.path, report.launchArguments, { cwd: root, env, windowsHide: true, stdio: "ignore" });
  chromeBirth = await queryReliableProcessIdentity(chrome.pid); assert.ok(chromeBirth);
  monitor = await startClassifiedChromiumMemoryMonitor(chrome.pid, runtime.directory, 100);
  let activePort; const debuggerDeadline = Date.now() + 15000;
  while (Date.now() < debuggerDeadline) {
    try { activePort = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]; if (/^\d+$/.test(activePort)) break; }
    catch (error) { if (error.code !== "ENOENT") throw error; } await pause(200);
  }
  assert.match(activePort ?? "", /^\d+$/); browser = await chromium.connectOverCDP(`http://127.0.0.1:${activePort}`);
  context = browser.contexts()[0]; page = context.pages()[0]; await page.goto("about:blank");
  report.blankBaseline = await stable();
  await context.addInitScript(`window.__WITHIN_AUDIO_VALIDATION_CHUNK__=(${encodeBoundedValidationChunk.toString()});`);
  await context.route("**/*", async route => {
    const request = route.request(); report.requestCount++;
    let frameUrl = null; try { frameUrl = request.frame()?.url() ?? null; } catch { /* worker-owned request */ }
    const classification = classifyPrivateRequest({ method: request.method(), url: request.url(),
      postData: ["GET", "HEAD"].includes(request.method()) ? request.postData() : "forbidden-non-read-method",
      frameUrl, serviceWorkerUrl: request.serviceWorker?.()?.url() ?? null }, server.baseURL);
    if (classification === "forbidden") {
      assert.ok(report.forbiddenRequests.length < 16); report.forbiddenRequests.push({ method: request.method(), url: request.url().slice(0, 2048) }); await route.abort();
    } else await route.continue();
  });
  await context.tracing.start({ screenshots: true, snapshots: false, sources: false }); traceStarted = true;
  const open = async fault => {
    await page.goto(server.baseURL + "/?test=1" + (fault ? "&fault=" + fault : ""));
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 });
  };
  const select = async file => {
    report.inputSelections ??= []; assert.ok(report.inputSelections.length < 8);
    report.inputSelections.push(await selectOwnedLocalBrowserFile(page, file, runtime.directory));
    await page.locator('[data-testid="format-select"]').selectOption("docx-to-html");
  };
  const leftovers = () => page.evaluate(async () => { const root = await navigator.storage.getDirectory(), names = [];
    for await (const [name] of root.entries()) if (name.startsWith("within-")) names.push(name); return names; });
  const waitEmpty = () => page.waitForFunction(async () => { const root = await navigator.storage.getDirectory();
    for await (const [name] of root.entries()) if (name.startsWith("within-")) return false; return true; }, undefined, { timeout: 10000 });
  await open(); report.loadedIdle = await stable(); controlStart = Date.now();
  timer = setInterval(() => { void drain().catch(error => { observerError ??= error; }); }, 500);
  const success = async previous => {
    await page.locator('[data-testid="convert-button"]').click();
    await page.waitForFunction(old => { const state = window.__WITHIN_TEST__?.getState(); return state?.jobState === "complete" && state.opfsName && state.opfsName !== old; }, previous, { timeout: 30000 });
    const state = await page.evaluate(() => window.__WITHIN_TEST__.getState());
    assert.equal(state.error, null); assert.equal(state.metrics.pendingOperations, 0); assert.equal(state.metrics.queuedBytes, 0);
    assert.ok(state.metrics.peakPendingOperations <= 1); assert.ok(state.metrics.maxReadChunkBytes <= 262144); assert.ok(state.metrics.maxWriteChunkBytes <= 65536);
    const binding = await bindOpfsOutputValidationBacking(page, profile, state.opfsName, state.metrics.outputBytes);
    const caseRow = { kind: "complete-unvalidated", outputBytes: state.metrics.outputBytes, metrics: state.metrics, binding: binding.proof };
    report.cases.push(caseRow);
    const validated = JSON.parse((await execute("python", ["-c", validator, binding.file], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 })).stdout);
    await assertOpfsOutputValidationBackingUnchanged(binding);
    caseRow.validated = validated; caseRow.kind = "complete";
    await page.evaluate(async name => (await navigator.storage.getDirectory()).removeEntry(name), state.opfsName);
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 });
    return state.opfsName;
  };
  await select(input); let previous = null; for (let n = 0; n < 3; n++) previous = await success(previous);
  await select(cancellation); await page.locator('[data-testid="convert-button"]').click();
  await page.waitForFunction(() => { const s = window.__WITHIN_TEST__?.getState(); return s?.jobState === "running" && s.metrics?.outputBytes >= 65536; }, undefined, { timeout: 30000 });
  const armed = await page.evaluate(() => window.__WITHIN_TEST__.getState().metrics);
  await page.getByRole("button", { name: "Cancel safely", exact: true }).click();
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "cancelled", undefined, { timeout: 30000 });
  await waitEmpty(); assert.deepEqual(await leftovers(), []); report.cases.push({ kind: "payload-cancel", armedMetrics: armed,
    metrics: await page.evaluate(() => window.__WITHIN_TEST__.getState().metrics), leftovers: [] });
  await open("write"); await select(input); await page.locator('[data-testid="convert-button"]').click();
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "error", undefined, { timeout: 30000 });
  const failure = await page.evaluate(() => window.__WITHIN_TEST__.getState()); assert.ok(failure.error); await waitEmpty(); assert.deepEqual(await leftovers(), []);
  report.cases.push({ kind: "write-error", message: failure.error, leftovers: [] });
  await open(); await select(input); await success(null); assert.deepEqual(await leftovers(), []);
  controlEnd = Date.now(); clearInterval(timer); timer = null; await drain(); await monitor.close(); report.nativeObserverOwnership = monitor.ownershipSummary(); monitor = null;
  assert.equal(observerError, null); const active = samples.filter(s => Date.parse(s.timestamp) >= controlStart && Date.parse(s.timestamp) <= controlEnd);
  const valid = active.filter(s => s.privateBytes !== null && s.processes); assert.ok(valid.length > 0);
  const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
  report.memory = { peak, validSamples: valid.length, unavailableSamples: active.length - valid.length,
    incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, limitMiB: 250,
    windowStart: new Date(controlStart).toISOString(), windowEnd: new Date(controlEnd).toISOString(), scope: "sampled-complete-tree-small-control-not-stress-acceptance" };
  assert.ok(report.memory.incrementalPrivateMiB <= 250); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(new Set(report.cases.filter(c => c.kind === "complete").map(c => c.validated.sha256)).size, 1);
  report.screenshot = `output/playwright/${stamp}-docx-html-complete.png`; await page.screenshot({ path: path.join(root, report.screenshot), fullPage: true });
  report.status = "passed-private-small-docx-html-production-control-not-public-qualification";
} catch (error) { report.status = "failed-not-acceptance"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  clearInterval(timer); await pending?.catch(() => {}); await monitor?.close().catch(error => report.failures.push("Observer cleanup: " + error));
  try {
    if (page && !page.isClosed()) {
      report.jobCleanup = await cancelBrowserConversionBeforeCleanup(page);
      await page.evaluate(async () => { const root = await navigator.storage.getDirectory();
        for await (const [name] of root.entries()) if (name.startsWith("within-test-") || name.startsWith("within-stage-")) await root.removeEntry(name, { recursive: true }); });
    }
    if (traceStarted) {
      const pathName = report.status === "failed-not-acceptance" ? path.join(root, "output/playwright", `${stamp}-docx-html-failure.zip`) : undefined;
      await context.tracing.stop(pathName ? { path: pathName } : {}); if (pathName) report.failureTrace = path.relative(root, pathName); traceStarted = false;
    }
  } catch (error) { report.failures.push("Browser data cleanup: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; }
  await finishOwnedCleanup([
    async () => { await browser?.close().catch(() => {});
      if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
        assert.ok(chromeBirth); const current = await queryReliableProcessIdentity(chrome.pid);
        if (current) { assert.deepEqual(current, chromeBirth); await execute("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 }); }
      }
      if (chromeBirth) { report.browserCleanup = await observeOwnedProcessExit(chromeBirth); assert.equal(report.browserCleanup.status, "owned-identity-absent"); }
    },
    async () => { if (server) report.serverCleanup = await server.close(); },
  ]).catch(error => { report.failures.push("Owned process cleanup: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; });
  try {
    assert.ok(!chrome || chrome.exitCode !== null || chrome.signalCode !== null || report.browserCleanup?.status === "owned-identity-absent");
    if (runtime) { await runtime.close(); report.ownedRuntimeRemoved = true; }
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(await hashFile(path.join(root, file)), digest);
    if (report.browserBefore) { report.browserAfter = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(report.browserBefore, report.browserAfter); }
    report.protectedOriginalAfter = await original(); assert.deepEqual(report.protectedOriginalAfter, report.protectedOriginalBefore);
  } catch (error) { report.failures.push("Runtime/source protection: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; }
  const raw = Buffer.from(JSON.stringify(samples)), packed = gzipSync(raw);
  const archive = `evidence/${stamp}-docx-html-native-samples.json.gz`;
  await writeFile(path.join(root, archive), packed, { flag: "wx" });
  report.nativeArchive = { file: archive, bytes: packed.length, sha256: sha(packed), decodedBytes: raw.length, decodedSha256: sha(raw) };
  report.finishedAt = new Date().toISOString(); const file = path.join(root, "evidence", `${stamp}-docx-html-qualification.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, cases: report.cases.map(c => c.kind), memory: report.memory?.incrementalPrivateMiB, failures: report.failures }));
}
