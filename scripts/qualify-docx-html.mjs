// Genuine production-browser controls. --scaling adds completed large documents;
// neither mode alone establishes public/full-route qualification.
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
import { encodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { bindOpfsOutputValidationBacking, assertOpfsOutputValidationBackingUnchanged } from "./lib/opfs-output-validation-backing.mjs";
import { cancelBrowserConversionBeforeCleanup } from "./lib/cancel-browser-conversion-before-cleanup.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { selectOwnedLocalBrowserFile } from "./lib/select-owned-local-browser-file.mjs";
import { bindLargeDocumentOutputValidationBacking } from "./lib/opfs-output-validation-backing.mjs";
import { DOCX_HTML_SCALING_PLAN as scalingPlan, summarizeDocxHtmlRunMemory, renderDocxHtmlScalingSummary } from "./lib/docx-html-scaling-control.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { cancelAfterRealBrowserPayload } from "./lib/browser-payload-cancellation.mjs";
import { completeNewBrowserJob, installDocxDestinationObservation, assertDirectDocxCompletion } from "./lib/docx-direct-control.mjs";
import { boundedErrorDetails } from "./lib/bounded-error-details.mjs";
import { createDocxCleanupDiagnostic } from "./lib/docx-cleanup-diagnostic.mjs";
import { cleanupOwnedChromium } from "./lib/owned-chromium-cleanup.mjs";

assert.equal(process.platform, "win32");
const memoryDiagnostic = process.argv[2] === "--outline-memory-diagnostic";
const outlineSmall = process.argv[2] === "--outline-small-control";
const tableSmall = process.argv[2] === "--table-small-control";
const emphasisControl = process.argv[2] === "--emphasis-direct-scaling";
const outlineControl = process.argv[2] === "--outline-direct-scaling" || memoryDiagnostic || outlineSmall || emphasisControl;
const benchmark = process.argv[2] === "--direct-async-scaling";
const asyncDirect = benchmark || outlineControl || tableSmall;
const direct = process.argv[2] === "--direct-scaling" || asyncDirect;
const scaling = !outlineSmall && !tableSmall && (process.argv[2] === "--scaling" || direct);
const cancellationOnly = process.argv[2] === "--cancel-control";
const payloadControl = scaling || cancellationOnly || outlineSmall || tableSmall;
assert.ok(process.argv.length === (payloadControl ? 3 : 2));
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const tableFixtureHelper = path.join(root, "scripts/lib/docx-table-span-fixtures.py");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hashFile = async file => { const hash = createHash("sha256"); for await (const b of createReadStream(file, { highWaterMark: 262144 })) hash.update(b); return hash.digest("hex"); };
const original = async () => ({ bytes: (await stat(path.join(root, "test.mkv"))).size, sha256: await hashFile(path.join(root, "test.mkv")) });
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", cases: [], sourcePins: {}, failures: [],
  scope: "Small private DOCX HTML production worker: three same-page repeats, cancellation/write-failure recovery, independent physical-output validation and sampled full-Chrome memory",
  headed: false, browserServicesDisabled: false, nativeConversionUsed: false, publicPromotion: false,
  stressAcceptance: false, nativePickerVerified: false, largeFileScalingVerified: false, speedImprovementProven: false,
  memoryFormula: "(peak complete spawned Chrome process-tree private bytes during full control window - earliest stable same clean blank Chrome private bytes) / 1048576",
  traceMode: { screenshots: true, domSnapshots: false, networkBodies: false }, requestCount: 0, forbiddenRequests: [] };
if (scaling) {
  report.scope = "Private DOCX HTML: genuine progressively larger completed documents, three same-session repeats each and unchanged whole-tree/cleanup observation; not full route qualification";
  report.scalingPlan = scalingPlan;
  report.cleanupRecoveryLimitMiB = scalingPlan.cleanupRecoveryLimitMiB;
  report.freshSessionRepeatVerified = false;
  report.fullOoxmlLayoutFidelityVerified = false;
  report.largeFileScalingVerified = false;
  report.scalingRuns = [];
}
if (cancellationOnly) report.scope = "Changed real-payload cancellation trigger plus write-error/recovery only; not a replay of completed scaling controls or full route qualification";
if (direct) {
  report.scope = "Changed direct-handle writer path: progressively larger genuine DOCX outputs/repeats/recovery; OPFS-backed test directory, NOT native picker/external drive/full route qualification";
  report.destinationAdapter = "Existing production directory=1 adapter supplies real FileSystemFileHandle from owned browser OPFS; engine/writer/bridge unchanged";
  report.destinationMode = "handle";
  report.nativeExternalDestinationVerified = false;
  report.directHandleWriterControlVerified = false;
  report.directWriterImplementation = asyncDirect ? "async-file-stream" : "shared-atomics";
  if (benchmark) report.performanceCandidate = { baseline: "evidence/2026-11-07T02-15-56-367Z-docx-html-qualification.json",
    baselineSha256: "df685c42d11a994276f03dbb2cef99570d0ae717881e7a15bc6e11cdc8ce2e47",
    minimumLargeMedianImprovement: .10, accepted: false,
    caveat: "Three repeats per size; sequential fresh sessions, not randomized interleaved A/B or universal fastest proof" };
}
if (outlineControl) report.scope = "Changed outline reader: real python-docx headings and inherited/default/direct outlines plus large documents with257referenced styles, actual async handle writer; not full Word layout, native picker or promotion";
if (outlineSmall) report.scope = "Previously unreached real python-docx heading repetitions plus actual payload cancellation/write-error/recovery only; NOT scaling, native picker, full Word rendering or public qualification";
if (emphasisControl) report.scope = "Changed supported inherited style emphasis: three native-generated semantic fixtures then unchanged full styled scaling inputs/repeats, native heading checks and payload-cancel/write-error/recovery; NOT full Word rendering/native external destination/public promotion";
if (tableSmall) report.scope = "New native DOCX horizontal span and nested table fixture with repeated async handle writes and recovery; not stress, speed, native picker, full Word layout or promotion";
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
const validateArgs = file => tableSmall ? [tableFixtureHelper, "validate", file] : ["-c", validator, file];
let runtime, server, chrome, chromeBirth, browser, page, context, monitor, timer, pending = null, observerError = null, traceStarted = false;
let realmSampler, realmPending = null, rejectSafetyStop;
let cleanupDiagnostic;
const realmObservations = [], safetyStop = new Promise((_, reject) => { rejectSafetyStop = reject; });
// This single bounded signal is observed from creation, including between jobs.
void safetyStop.catch(() => {});
const samples = []; let controlStart = null, controlEnd = null;
const drain = () => pending ??= (async () => { if (!monitor) return; const batch = await monitor.drain();
  assert.equal(batch.overflow, false); assert.ok(samples.length + batch.samples.length <= (scaling ? scalingPlan.sampleCap : 1200), "Finite control sample cap"); samples.push(...batch.samples);
  if ((scaling || tableSmall) && controlStart !== null && report.blankBaseline) {
    const valid = batch.samples.filter(row => Date.parse(row.timestamp) >= controlStart && row.privateBytes !== null);
    assert.ok(valid.every(row => (row.privateBytes - report.blankBaseline.privateBytes) / 1048576 <= 250), "Unchanged full-process-tree250MiB safety stop");
  }
})().finally(() => { pending = null; });
const sampleRealms = () => realmPending ??= (async () => {
  if (!realmSampler) return;
  assert.ok(realmObservations.length < 600);
  realmObservations.push({ timestamp: new Date().toISOString(), ...await realmSampler.sample() });
})().finally(() => { realmPending = null; });
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
  const disk = await statfs(root); report.diskFreeBytes = disk.bavail * disk.bsize;
  assert.ok(report.diskFreeBytes >= (scaling ? scalingPlan.requiredDiskBytes : 512 * 1024 ** 2));
  report.python = (await execute("python", ["--version"], { windowsHide: true, timeout: 10000 })).stdout.trim();
  report.protectedOriginalBefore = await original(); assert.deepEqual(report.protectedOriginalBefore,
    { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  report.browserBefore = await inspectInstalledChromePin();
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true, timeout: 10000 })).stdout.trim();
  for (const file of ["scripts/qualify-docx-html.mjs", "workers/docx-html-conversion.ts", "workers/docx-conversion.ts",
    "workers/conversion.worker.ts", "lib/capability-registry.ts", "package-lock.json", "scripts/lib/birth-aware-chromium-memory.mjs",
    "scripts/lib/birth-type-capture.mjs", "scripts/lib/select-owned-local-browser-file.mjs",
    "scripts/lib/docx-html-scaling-control.mjs", "scripts/lib/docx-html-scaling-fixtures.py", "scripts/lib/opfs-output-validation-backing.mjs", "scripts/lib/cdp-realm-memory.mjs", "scripts/lib/browser-payload-cancellation.mjs",
    "scripts/lib/docx-direct-control.mjs", "app/converter/ConverterApp.tsx", "workers/random-access-destination.ts", "workers/direct-file-writer.worker.ts", "workers/direct-writer-protocol.ts",
    "workers/docx-outline.ts", "scripts/lib/docx-outline-fixtures.py", "scripts/lib/docx-emphasis-fixtures.py", "scripts/lib/bounded-error-details.mjs",
    "scripts/lib/docx-cleanup-diagnostic.mjs", "scripts/lib/bounded-dom-counters.mjs", "scripts/lib/live-memory-infra.mjs", "scripts/lib/memory-infra-attribution.mjs", "scripts/lib/owned-chromium-cleanup.mjs"])
    report.sourcePins[file] = await hashFile(path.join(root, file));
  if (tableSmall) report.sourcePins["scripts/lib/docx-table-span-fixtures.py"] = await hashFile(tableFixtureHelper);
  runtime = await createOwnedRuntimeScratch("docx-html-qualification-");
  const env = { ...runtime.env, PYTHONDONTWRITEBYTECODE: "1", WRANGLER_SEND_METRICS: "false" };
  report.validatorControls = [];
  const referenceHtml = tableSmall
    ? (await execute("python", [tableFixtureHelper, "reference"], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 })).stdout
    : '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>' +
    '<p><strong><em>Hello β &amp; &lt;script&gt;not-executable&lt;/script&gt; 😀</em></strong></p>' +
    '<table><tr><td><p>Cell one</p></td><td><p>Cell two</p></td></tr></table><p>Inserted</p></body></html>';
  const validatorCases = [["positive", referenceHtml, true], ["wrong-text", referenceHtml.replace("Cell two", "wrong"), false],
    ["active-markup", referenceHtml.replace("</body>", "<script>alert(1)</script></body>"), false]];
  if (tableSmall) validatorCases.push(["missing-column-span", referenceHtml.replace(' colspan="2"', ""), false],
    ["lost-nested-table", referenceHtml.replace("<table><tr><td colspan=", "<tr><td colspan="), false]);
  for (const [name, html, accepted] of validatorCases) {
    const file = path.join(runtime.directory, `validator-${name}.html`); await writeFile(file, html, { flag: "wx" });
    let exitCode = 0;
    try { await execute("python", validateArgs(file), { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 }); }
    catch (error) { assert.equal(typeof error.code, "number"); exitCode = error.code; }
    assert.equal(exitCode === 0, accepted, "Independent validator preflight: " + name);
    report.validatorControls.push({ name, expectedAccepted: accepted, exitCode });
  }
  const ownedPrefix = direct ? "within-test-direct-docx-html-" : "";
  const input = path.join(runtime.directory, ownedPrefix + "structure.docx"), cancellation = path.join(runtime.directory, ownedPrefix + "cancel.docx");
  const body = '<w:p><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Hello β &amp; &lt;script&gt;not-executable&lt;/script&gt; 😀</w:t></w:r></w:p>' +
    `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid><w:tr><w:tc>${p("Cell one")}</w:tc><w:tc>${p("Cell two")}</w:tc></w:tr></w:tbl>` +
    '<w:p><w:del w:id="1" w:author="fixture"><w:r><w:delText>Deleted</w:delText></w:r></w:del><w:ins w:id="2" w:author="fixture"><w:r><w:t>Inserted</w:t></w:r></w:ins></w:p>';
  if (tableSmall) report.tableFixture = JSON.parse((await execute("python", [tableFixtureHelper, "generate", input],
    { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 32768 })).stdout);
  else await writeFile(input, packageBytes(body), { flag: "wx" });
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
  const scalingInputs = [];
  if (scaling) {
    const helper = path.join(root, "scripts/lib/docx-html-scaling-fixtures.py");
    for (const paragraphs of scalingPlan.paragraphs) {
      const file = path.join(runtime.directory, direct ? `${ownedPrefix}${paragraphs}.docx` : `scaling-${paragraphs}.docx`);
      const generated = JSON.parse((await execute("python", [helper, outlineControl ? "generate-styled" : "generate", file, String(paragraphs)],
        { cwd: root, env, windowsHide: true, timeout: 120000, maxBuffer: 32768 })).stdout);
      const validated = JSON.parse((await execute("python", ["-c", sourceValidator, file],
        { cwd: root, env, windowsHide: true, timeout: 120000, maxBuffer: 32768 })).stdout);
      assert.equal(validated.paragraphs, paragraphs);
      const bytes = (await stat(file)).size;
      if (paragraphs === scalingPlan.paragraphs.at(-1)) assert.ok(bytes > 100 * 1024 ** 2);
      scalingInputs.push({ file, paragraphs, bytes, sha256: await hashFile(file), generated, validated });
    }
    report.scalingInputs = scalingInputs.map(({ file, ...proof }) => { void file; return proof; });
    if (memoryDiagnostic) {
      const file = "evidence/2026-11-07T02-51-38-596Z-docx-html-qualification.json", bytes = await readFile(path.join(root, file));
      assert.equal(sha(bytes), "ecea1214979260e55527d2592daf71033ea1a9dd140543dc8e4cd17c8dced3ac");
      const failed = JSON.parse(bytes);
      for (const key of ["workers/docx-html-conversion.ts", "workers/docx-conversion.ts", "workers/docx-outline.ts", "workers/conversion.worker.ts",
        "workers/random-access-destination.ts", "workers/direct-file-writer.worker.ts", "workers/direct-writer-protocol.ts", "app/converter/ConverterApp.tsx", "lib/capability-registry.ts", "package-lock.json"])
        assert.equal(report.sourcePins[key], failed.sourcePins[key], "Diagnostic must retain failed production source: " + key);
      for (const fixture of scalingInputs) {
        const prior = failed.scalingInputs.find(row => row.paragraphs === fixture.paragraphs);
        assert.equal(fixture.bytes, prior.bytes); assert.equal(fixture.sha256, prior.sha256);
      }
      report.diagnosticComparison = { file, sha256: sha(bytes), identicalProductionSourcesAndInputs: true,
        identicalSettings: true, browserServiceExclusions: false, qualification: false };
    }
    // Test the separate streaming large-output validator BEFORE conversion.
    const fixture = path.join(runtime.directory, "validator-scaling.html");
    const text = number => String(number).padStart(8, "0") + "|" + "bounded-stream-".repeat(280) + "|β 😀 &amp; &lt;script&gt;safe&lt;/script&gt;";
    const positive = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body><p>${text(0)}</p><p>${text(1)}</p></body></html>`;
    report.scalingValidatorControls = [];
    for (const [name, value, accepted] of [["positive", positive, true], ["wrong-ordinal", positive.replace("00000001|", "00000007|"), false],
      ["active-markup", positive.replace("</body>", "<script>bad</script></body>"), false], ["truncated", positive.slice(0, -25), false]]) {
      await writeFile(fixture, value); let exitCode = 0;
      try { await execute("python", [helper, "validate", fixture, "2"], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 }); }
      catch (error) { assert.equal(typeof error.code, "number"); exitCode = error.code; }
      assert.equal(exitCode === 0, accepted); report.scalingValidatorControls.push({ name, exitCode, expectedAccepted: accepted });
    }
  }
  let outlineFixture;
  if (outlineControl) {
    const helper = path.join(root, "scripts/lib/docx-outline-fixtures.py");
    outlineFixture = path.join(runtime.directory, ownedPrefix + "outline.docx");
    const generated = JSON.parse((await execute("python", [helper, "generate", outlineFixture], { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 32768 })).stdout);
    const sourceValidation = JSON.parse((await execute("python", ["-c", sourceValidator, outlineFixture], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 })).stdout);
    report.outlineControl = { fixtureBytes: (await stat(outlineFixture)).size, fixtureSha256: await hashFile(outlineFixture), generated, sourceValidation,
      validatorControls: [], cases: [], fullWordRenderingVerified: false };
    const reference = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>' +
      '<h1><strong>Outline α 😀</strong></h1><h2>Inherited heading</h2><p>Body override</p><h3><strong>Third level</strong></h3><p role="heading" aria-level="9">Deep outline</p>' +
      '<p><strong><em>Direct emphasis</em></strong></p><table><tr><td><p>Cell one</p></td><td><p>Cell two</p></td></tr></table></body></html>';
    const file = path.join(runtime.directory, "outline-validator.html");
    for (const [name, html, accepted] of [["positive", reference, true], ["wrong-heading", reference.replaceAll("h2>", "p>"), false],
      ["wrong-text", reference.replace("Cell two", "bad"), false], ["active-markup", reference.replace("</body>", "<script>bad</script></body>"), false],
      ["unclosed", reference.replace("</html>", ""), false]]) {
      await writeFile(file, html); let exitCode = 0;
      try { await execute("python", [helper, "validate", file], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 }); }
      catch (error) { assert.equal(typeof error.code, "number"); exitCode = error.code; }
      assert.equal(exitCode === 0, accepted); report.outlineControl.validatorControls.push({ name, exitCode, expectedAccepted: accepted });
    }
  }
  let emphasisFixture;
  if (emphasisControl) {
    const helper = path.join(root, "scripts/lib/docx-emphasis-fixtures.py");
    emphasisFixture = path.join(runtime.directory, ownedPrefix + "emphasis.docx");
    const generated = JSON.parse((await execute("python", [helper, "generate", emphasisFixture], { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 32768 })).stdout);
    const validated = JSON.parse((await execute("python", ["-c", sourceValidator, emphasisFixture], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 })).stdout);
    report.emphasisControl = { generated, sourceValidation: validated, fixtureBytes: (await stat(emphasisFixture)).size,
      fixtureSha256: await hashFile(emphasisFixture), validatorControls: [], cases: [], fullWordRenderingVerified: false };
    const reference = (await execute("python", [helper, "reference"], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 })).stdout;
    const file = path.join(runtime.directory, "emphasis-validator.html");
    for (const [name, value, accepted] of [["positive", reference, true], ["wrong-toggle", reference.replace("<strong>Direct override</strong>", "Direct override"), false],
      ["wrong-text", reference.replace("Mixed second", "bad"), false], ["active-markup", reference.replace("</body>", "<script>bad</script></body>"), false],
      ["unclosed", reference.replace("</html>", ""), false]]) {
      await writeFile(file, value); let exitCode = 0;
      try { await execute("python", [helper, "validate", file], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 }); }
      catch (error) { assert.equal(typeof error.code, "number"); exitCode = error.code; }
      assert.equal(exitCode === 0, accepted); report.emphasisControl.validatorControls.push({ name, expectedAccepted: accepted, exitCode });
    }
  }
  const port = await new Promise((resolve, reject) => { const socket = createServer(); socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const p = socket.address().port; socket.close(error => error ? reject(error) : resolve(p)); }); });
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port });
  report.serverLaunchIdentity = server.identity;
  const profile = path.join(runtime.directory, "profile");
  report.launchArguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  chrome = spawn(report.browserBefore.launcher.path, report.launchArguments, { cwd: root, env, windowsHide: true, stdio: "ignore" });
  chromeBirth = await queryReliableProcessIdentity(chrome.pid); assert.ok(chromeBirth);
  report.browserLaunchIdentity = chromeBirth;
  monitor = await startClassifiedChromiumMemoryMonitor(chrome.pid, runtime.directory, 100);
  let activePort; const debuggerDeadline = Date.now() + 15000;
  while (Date.now() < debuggerDeadline) {
    try { activePort = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]; if (/^\d+$/.test(activePort)) break; }
    catch (error) { if (error.code !== "ENOENT") throw error; } await pause(200);
  }
  assert.match(activePort ?? "", /^\d+$/); browser = await chromium.connectOverCDP(`http://127.0.0.1:${activePort}`);
  context = browser.contexts()[0]; page = context.pages()[0]; await page.goto("about:blank");
  report.blankBaseline = await stable();
  if (scaling) {
    const debuggerVersion = await (await fetch(`http://127.0.0.1:${activePort}/json/version`)).json();
    realmSampler = await connectRealmSampler(debuggerVersion.webSocketDebuggerUrl, server.baseURL);
  }
  await context.addInitScript(`window.__WITHIN_AUDIO_VALIDATION_CHUNK__=(${encodeBoundedValidationChunk.toString()});`);
  if (payloadControl) await context.addInitScript(`window.__WITHIN_PAYLOAD_CANCEL__=(${cancelAfterRealBrowserPayload.toString()});`);
  if (direct) {
    await context.addInitScript(`window.__WITHIN_NEW_DOCX_COMPLETION__=(${completeNewBrowserJob.toString()});`);
    await context.addInitScript(`(${installDocxDestinationObservation.toString()})();`);
  }
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
    await page.goto(server.baseURL + "/?test=1" + (direct ? "&directory=1" : "") + (fault ? "&fault=" + fault : ""));
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
  const directCompletion = () => page.evaluate(() => window.__WITHIN_NEW_DOCX_COMPLETION__({
    getState: () => window.__WITHIN_TEST__.getState(),
    start: () => document.querySelector('[data-testid="convert-button"]').click(),
    nextFrame: () => new Promise(resolve => requestAnimationFrame(resolve)), now: () => performance.now(),
  }));
  const directObservation = async () => {
    const observation = await page.evaluate(() => window.__WITHIN_DOCX_DESTINATIONS__?.at(-1));
    assert.equal(observation?.mode, "handle"); assert.equal(observation.actualFileHandle, true);
    report.destinationObservations ??= []; assert.ok(report.destinationObservations.length < 16);
    report.destinationObservations.push(observation); return observation;
  };
  await open(); report.loadedIdle = await stable(); controlStart = Date.now();
  if (memoryDiagnostic) {
    report.scope = "Diagnostic-only unchanged styled inputs/settings: three small conversions then first full large conversion, phase DOM/realm/native allocator observations; NOT qualification or a speed benchmark";
    cleanupDiagnostic = await createDocxCleanupDiagnostic({ page, context, browser, realms: realmSampler,
      nativeSnapshot: async () => { await drain(); return samples.at(-1) ?? null; },
      archiveDirectory: path.join(root, "output/playwright"), stamp });
    await cleanupDiagnostic.sample("loaded");
  }
  timer = setInterval(() => {
    void drain().catch(error => { observerError ??= error; rejectSafetyStop(error); });
    if (scaling && Math.floor(Date.now() / 500) % 4 === 0) void sampleRealms().catch(error => { observerError ??= error; rejectSafetyStop(error); });
  }, 500);
  const success = async previous => {
    const started = Date.now();
    if (direct) await Promise.race([safetyStop, directCompletion()]);
    else {
      await page.locator('[data-testid="convert-button"]').click();
      await page.waitForFunction(old => { const state = window.__WITHIN_TEST__?.getState(); return state?.jobState === "complete" && state.opfsName && state.opfsName !== old; }, previous, { timeout: 30000 });
    }
    const state = await page.evaluate(() => window.__WITHIN_TEST__.getState());
    assert.equal(state.error, null); assert.equal(state.metrics.pendingOperations, 0); assert.equal(state.metrics.queuedBytes, 0);
    assert.ok(state.metrics.peakPendingOperations <= 1); assert.ok(state.metrics.maxReadChunkBytes <= 262144); assert.ok(state.metrics.maxWriteChunkBytes <= 65536);
    const observation = direct ? await directObservation() : null;
    const name = direct ? assertDirectDocxCompletion(state, observation, report.directWriterImplementation) : state.opfsName;
    const binding = await bindOpfsOutputValidationBacking(page, profile, name, state.metrics.outputBytes);
    const caseRow = { kind: "complete-unvalidated", outputBytes: state.metrics.outputBytes, metrics: state.metrics, binding: binding.proof };
    if (direct) caseRow.destinationObservation = observation;
    report.cases.push(caseRow);
    const validated = JSON.parse((await execute("python", validateArgs(binding.file), { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 })).stdout);
    await assertOpfsOutputValidationBackingUnchanged(binding);
    caseRow.validated = validated; caseRow.kind = "complete";
    await page.evaluate(async name => (await navigator.storage.getDirectory()).removeEntry(name), name);
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 });
    if (tableSmall) {
      assert.ok(state.warnings.some(message => message.includes("Vertical and legacy table merges")));
      assert.ok(state.metrics.peakQueuedBytes <= 65536);
      await waitEmpty(); assert.deepEqual(await leftovers(), []);
      const cleanup = await Promise.race([safetyStop, stable()]); await drain();
      caseRow.smallRunMemory = summarizeDocxHtmlRunMemory(samples, started, Date.now(), report.blankBaseline, report.loadedIdle, cleanup);
      assert.ok(caseRow.smallRunMemory.incrementalPrivateMiB <= 250);
      assert.ok(caseRow.smallRunMemory.cleanupDeltaFromLoadedMiB <= scalingPlan.cleanupRecoveryLimitMiB);
    }
    return name;
  };
  if (scaling) {
    if (emphasisControl) {
      await select(emphasisFixture);
      for (let repeat = 1; repeat <= 3; repeat++) {
        const started = Date.now(); await Promise.race([safetyStop, directCompletion()]);
        const state = await page.evaluate(() => window.__WITHIN_TEST__.getState());
        assert.equal(state.error, null); assert.equal(state.metrics.pendingOperations, 0); assert.equal(state.metrics.queuedBytes, 0);
        assert.ok(state.metrics.maxReadChunkBytes <= 262144 && state.metrics.maxWriteChunkBytes <= 65536);
        assert.equal(state.metrics.peakPendingOperations, 1); assert.ok(state.metrics.peakQueuedBytes <= 65536);
        const observation = await directObservation(), name = assertDirectDocxCompletion(state, observation, report.directWriterImplementation);
        const binding = await bindOpfsOutputValidationBacking(page, profile, name, state.metrics.outputBytes);
        const row = { repeat, outputBytes: state.metrics.outputBytes, metrics: state.metrics, destinationObservation: observation, binding: binding.proof, warnings: state.warnings };
        report.emphasisControl.cases.push(row);
        assert.ok(state.warnings.includes(`DOCX outline metadata read ${report.emphasisControl.generated.styleDefinitions} style definitions from a referenced internal package part.`));
        row.validated = JSON.parse((await execute("python", [path.join(root, "scripts/lib/docx-emphasis-fixtures.py"), "validate", binding.file], { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 })).stdout);
        await assertOpfsOutputValidationBackingUnchanged(binding);
        await page.evaluate(async name => (await navigator.storage.getDirectory()).removeEntry(name), name);
        await waitEmpty(); assert.deepEqual(await leftovers(), []);
        await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 });
        const cleanup = await Promise.race([safetyStop, stable()]); await drain();
        row.smallRunMemory = summarizeDocxHtmlRunMemory(samples, started, Date.now(), report.blankBaseline, report.loadedIdle, cleanup);
        assert.ok(row.smallRunMemory.incrementalPrivateMiB <= 250);
        assert.ok(row.smallRunMemory.cleanupDeltaFromLoadedMiB <= scalingPlan.cleanupRecoveryLimitMiB, "Unchanged96MiB emphasis cleanup gate");
      }
      assert.equal(new Set(report.emphasisControl.cases.map(row => row.validated.sha256)).size, 1);
    }
    for (const fixture of scalingInputs) {
      await select(fixture.file);
      let previous = null;
      for (let repeat = 1; repeat <= scalingPlan.repeats; repeat++) {
        const diagnoseLarge = memoryDiagnostic && fixture.paragraphs === scalingPlan.paragraphs.at(-1);
        if (diagnoseLarge) await cleanupDiagnostic.sample("before-large");
        const started = Date.now();
        if (direct) await Promise.race([safetyStop, directCompletion()]);
        else {
          await page.locator('[data-testid="convert-button"]').click();
          await Promise.race([safetyStop, page.waitForFunction(old => {
            const s = window.__WITHIN_TEST__?.getState(); return s?.jobState === "complete" && s.opfsName && s.opfsName !== old;
          }, previous, { timeout: scalingPlan.conversionTimeoutMs })]);
        }
        const state = await page.evaluate(() => window.__WITHIN_TEST__.getState());
        if (diagnoseLarge) await cleanupDiagnostic.sample("complete");
        assert.equal(state.error, null); assert.equal(state.metrics.pendingOperations, 0); assert.equal(state.metrics.queuedBytes, 0);
        assert.equal(state.metrics.inputBytes, fixture.bytes); assert.ok(state.metrics.maxReadChunkBytes <= 262144);
        assert.ok(state.metrics.maxWriteChunkBytes <= 65536); assert.ok(state.metrics.peakQueuedBytes <= 65536); assert.equal(state.metrics.peakPendingOperations, 1);
        const row = { kind: "complete-unvalidated", paragraphs: fixture.paragraphs, repeat, sourceBytes: fixture.bytes,
          sourceSha256: fixture.sha256, outputBytes: state.metrics.outputBytes, metrics: state.metrics,
          storageBeforeValidation: await page.evaluate(async () => { const s = await navigator.storage.estimate(); return { usage: s.usage ?? null, quota: s.quota ?? null }; }) };
        report.cases.push(row);
        if (outlineControl) {
          row.outlineWarnings = state.warnings;
          assert.ok(state.warnings.includes("DOCX outline metadata read 257 style definitions from a referenced internal package part."));
          assert.equal(fixture.generated.referencedOutlineStyleDefinitions, 257);
        }
        const observation = direct ? await directObservation() : null;
        const name = direct ? assertDirectDocxCompletion(state, observation, report.directWriterImplementation) : state.opfsName;
        if (direct) row.destinationObservation = observation;
        const binding = await bindLargeDocumentOutputValidationBacking(page, profile, name, state.metrics.outputBytes);
        row.binding = binding.proof;
        if (diagnoseLarge) await cleanupDiagnostic.sample("bound");
        row.validated = JSON.parse((await execute("python", [path.join(root, "scripts/lib/docx-html-scaling-fixtures.py"), "validate", binding.file, String(fixture.paragraphs)],
          { cwd: root, env, windowsHide: true, timeout: scalingPlan.validatorTimeoutMs, maxBuffer: 32768 })).stdout);
        await assertOpfsOutputValidationBackingUnchanged(binding);
        if (diagnoseLarge) await cleanupDiagnostic.sample("validated");
        assert.equal(row.validated.bytes, row.outputBytes); assert.equal(row.validated.paragraphs, fixture.paragraphs);
        if (fixture.paragraphs === scalingPlan.paragraphs.at(-1)) assert.ok(row.outputBytes > 100 * 1024 ** 2);
        await page.evaluate(async name => (await navigator.storage.getDirectory()).removeEntry(name), name);
        await waitEmpty(); assert.deepEqual(await leftovers(), []);
        await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 });
        if (diagnoseLarge) await cleanupDiagnostic.sample("deleted");
        // Natural stable observation only: no forced GC, service changes, page
        // replacement or baseline substitution to hide retained allocations.
        const cleanup = await Promise.race([safetyStop, stable()]);
        await drain();
        row.runMemory = summarizeDocxHtmlRunMemory(samples, started, Date.now(), report.blankBaseline, report.loadedIdle, cleanup);
        row.kind = "complete";
        if (diagnoseLarge) {
          // Freeze the ORIGINAL stable window before any later observation. The
          // added delay is diagnostic, never a replacement cleanup acceptance.
          controlEnd = Date.now(); report.firstCleanupWithinGate = row.runMemory.cleanupDeltaFromLoadedMiB <= scalingPlan.cleanupRecoveryLimitMiB;
          await cleanupDiagnostic.sample("cleanup-first");
          await Promise.race([safetyStop, pause(45000)]);
          await cleanupDiagnostic.sample("cleanup-plus45s");
          assert.ok(row.runMemory.incrementalPrivateMiB <= 250);
          assert.ok(report.firstCleanupWithinGate, "Unchanged96MiB FIRST cleanup recovery gate; later diagnostic cannot override");
          const complete = new Error("Changed diagnostic complete; remaining qualification deliberately not executed");
          complete.code = "DOCX_DIAGNOSTIC_COMPLETE"; throw complete;
        }
        assert.ok(row.runMemory.incrementalPrivateMiB <= 250);
        assert.ok(row.runMemory.cleanupDeltaFromLoadedMiB <= scalingPlan.cleanupRecoveryLimitMiB, "Unchanged96MiB cleanup recovery gate");
        row.realmsAfterCleanup = await realmSampler.sample();
        previous = name;
      }
      const hashes = report.cases.filter(c => c.kind === "complete" && c.paragraphs === fixture.paragraphs).map(c => c.validated.sha256);
      assert.equal(hashes.length, 3); assert.equal(new Set(hashes).size, 1);
    }
  } else if (!cancellationOnly) {
    await select(input); let previous = null; for (let n = 0; n < 3; n++) previous = await success(previous);
  }
  if (outlineControl) {
    await select(outlineFixture);
    for (let repeat = 1; repeat <= 3; repeat++) {
      const started = Date.now();
      await Promise.race([safetyStop, directCompletion()]);
      const state = await page.evaluate(() => window.__WITHIN_TEST__.getState());
      assert.ok(state.metrics.maxReadChunkBytes <= 262144 && state.metrics.maxWriteChunkBytes <= 65536);
      assert.equal(state.metrics.pendingOperations, 0); assert.equal(state.metrics.queuedBytes, 0);
      assert.equal(state.metrics.peakPendingOperations, 1); assert.ok(state.metrics.peakQueuedBytes <= 65536);
      const observation = await directObservation(), name = assertDirectDocxCompletion(state, observation, report.directWriterImplementation);
      const binding = await bindOpfsOutputValidationBacking(page, profile, name, state.metrics.outputBytes);
      const row = { repeat, outputBytes: state.metrics.outputBytes, metrics: state.metrics, destinationObservation: observation, binding: binding.proof };
      row.outlineWarnings = state.warnings;
      assert.ok(state.warnings.includes(`DOCX outline metadata read ${report.outlineControl.generated.styleDefinitions} style definitions from a referenced internal package part.`));
      report.outlineControl.cases.push(row);
      row.validated = JSON.parse((await execute("python", [path.join(root, "scripts/lib/docx-outline-fixtures.py"), "validate", binding.file],
        { cwd: root, env, windowsHide: true, timeout: 10000, maxBuffer: 32768 })).stdout);
      await assertOpfsOutputValidationBackingUnchanged(binding);
      await page.evaluate(async name => (await navigator.storage.getDirectory()).removeEntry(name), name);
      await waitEmpty(); assert.deepEqual(await leftovers(), []);
      await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 });
      if (outlineSmall) {
        const cleanup = await Promise.race([safetyStop, stable()]); await drain();
        row.smallRunMemory = summarizeDocxHtmlRunMemory(samples, started, Date.now(), report.blankBaseline, report.loadedIdle, cleanup);
        assert.ok(row.smallRunMemory.incrementalPrivateMiB <= 250);
        assert.ok(row.smallRunMemory.cleanupDeltaFromLoadedMiB <= scalingPlan.cleanupRecoveryLimitMiB, "Unchanged96MiB small-heading cleanup gate");
      }
    }
    assert.equal(new Set(report.outlineControl.cases.map(c => c.validated.sha256)).size, 1);
  }
  await select(cancellation);
  let armed;
  if (payloadControl) {
    const trigger = await page.evaluate(() => window.__WITHIN_PAYLOAD_CANCEL__({
      getState: () => window.__WITHIN_TEST__.getState(),
      start: () => document.querySelector('[data-testid="convert-button"]').click(),
      cancel: () => {
        const button = [...document.querySelectorAll("button")].find(node => node.textContent.trim() === "Cancel safely");
        if (!button || button.disabled) throw new Error("Production cancel button unavailable"); button.click();
      },
      nextFrame: () => new Promise(resolve => requestAnimationFrame(resolve)), now: () => performance.now(),
    }));
    armed = trigger.armedMetrics; report.cancellationTrigger = trigger.method;
  } else {
    await page.locator('[data-testid="convert-button"]').click();
    await page.waitForFunction(() => { const s = window.__WITHIN_TEST__?.getState(); return s?.jobState === "running" && s.metrics?.outputBytes >= 65536; }, undefined, { timeout: 30000 });
    armed = await page.evaluate(() => window.__WITHIN_TEST__.getState().metrics);
    await page.getByRole("button", { name: "Cancel safely", exact: true }).click();
  }
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "cancelled", undefined, { timeout: 30000 });
  await waitEmpty(); assert.deepEqual(await leftovers(), []); report.cases.push({ kind: "payload-cancel", armedMetrics: armed,
    metrics: await page.evaluate(() => window.__WITHIN_TEST__.getState().metrics), leftovers: [],
    ...(direct ? { destinationObservation: await directObservation() } : {}) });
  await open("write"); await select(input); await page.locator('[data-testid="convert-button"]').click();
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "error", undefined, { timeout: 30000 });
  const failure = await page.evaluate(() => window.__WITHIN_TEST__.getState()); assert.ok(failure.error); await waitEmpty(); assert.deepEqual(await leftovers(), []);
  report.cases.push({ kind: "write-error", message: failure.error, leftovers: [],
    ...(direct ? { metrics: failure.metrics, destinationObservation: await directObservation() } : {}) });
  await open(); await select(input); await success(null); assert.deepEqual(await leftovers(), []);
  controlEnd = Date.now(); clearInterval(timer); timer = null; await drain(); await monitor.close(); report.nativeObserverOwnership = monitor.ownershipSummary(); monitor = null;
  assert.equal(observerError, null); const active = samples.filter(s => Date.parse(s.timestamp) >= controlStart && Date.parse(s.timestamp) <= controlEnd);
  const valid = active.filter(s => s.privateBytes !== null && s.processes); assert.ok(valid.length > 0);
  const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
  report.memory = { peak, validSamples: valid.length, unavailableSamples: active.length - valid.length,
    incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, limitMiB: 250,
    windowStart: new Date(controlStart).toISOString(), windowEnd: new Date(controlEnd).toISOString(),
    scope: scaling ? "sampled-complete-tree-progressive-document-control-with-repeats-and-cleanup-not-full-route-acceptance" : "sampled-complete-tree-small-control-not-stress-acceptance" };
  assert.ok(report.memory.incrementalPrivateMiB <= 250); assert.deepEqual(report.forbiddenRequests, []);
  if (!scaling) assert.equal(new Set(report.cases.filter(c => c.kind === "complete").map(c => c.validated.sha256)).size, 1);
  if (!tableSmall) { report.screenshot = `output/playwright/${stamp}-docx-html-complete.png`; await page.screenshot({ path: path.join(root, report.screenshot), fullPage: true }); }
  report.status = scaling ? "passed-private-progressive-docx-html-control-not-full-route-qualification" : "passed-private-small-docx-html-production-control-not-public-qualification";
  if (cancellationOnly) report.status = "passed-changed-docx-html-payload-cancel-write-recovery-control-not-scaling-or-promotion";
  if (direct) { report.status = outlineSmall ? "passed-private-native-heading-and-recovery-control-not-scaling-or-promotion" : "passed-private-direct-handle-docx-html-scaling-control-not-native-picker-or-promotion"; report.directHandleWriterControlVerified = !outlineSmall; }
  if (tableSmall) {
    report.status = "passed-private-docx-table-spans-and-recovery-control-not-scaling-or-promotion";
    report.directHandleWriterControlVerified = false;
    report.smallDirectHandleWriterVerified = true;
  }
  if (scaling) report.completedDocumentScalingControlVerified = true;
  if (outlineControl) report.outlineControlVerified = !outlineSmall;
  if (outlineSmall) report.smallNativeHeadingRecoveryVerified = true;
  if (emphasisControl) report.inheritedEmphasisControlVerified = true;
  if (benchmark) {
    const candidate = report.performanceCandidate, bytes = await readFile(path.join(root, candidate.baseline));
    assert.equal(sha(bytes), candidate.baselineSha256); const baseline = JSON.parse(bytes);
    assert.equal(baseline.status, "passed-private-direct-handle-docx-html-scaling-control-not-native-picker-or-promotion");
    assertInstalledChromePinsEqual(baseline.browserBefore, report.browserBefore);
    for (const file of ["workers/docx-html-conversion.ts", "workers/docx-conversion.ts", "workers/random-access-destination.ts",
      "workers/direct-file-writer.worker.ts", "workers/direct-writer-protocol.ts", "lib/capability-registry.ts", "package-lock.json", "app/converter/ConverterApp.tsx"])
      assert.equal(report.sourcePins[file], baseline.sourcePins[file], "Only private DOCX destination selection/diagnostics may differ: " + file);
    const before = baseline.cases.filter(c => c.runMemory), after = report.cases.filter(c => c.runMemory);
    assert.equal(before.length, 6); assert.equal(after.length, 6);
    for (let n = 0; n < 6; n++) {
      for (const key of ["paragraphs", "repeat", "sourceBytes", "sourceSha256", "outputBytes"]) assert.equal(after[n][key], before[n][key]);
      assert.equal(after[n].validated.sha256, before[n].validated.sha256);
    }
    const medianLarge = rows => rows.filter(c => c.paragraphs === scalingPlan.paragraphs.at(-1)).map(c => c.metrics.elapsedMs).sort((a, b) => a - b)[1];
    candidate.baselineLargeMedianMs = medianLarge(before); candidate.candidateLargeMedianMs = medianLarge(after);
    candidate.observedMedianImprovement = 1 - candidate.candidateLargeMedianMs / candidate.baselineLargeMedianMs;
    assert.ok(candidate.observedMedianImprovement >= candidate.minimumLargeMedianImprovement, "Reject candidate without preregistered10% median gain");
    candidate.identicalInputSettingsAndOutputHashesVerified = true; candidate.accepted = true;
  }
} catch (error) {
  if (memoryDiagnostic && error.code === "DOCX_DIAGNOSTIC_COMPLETE") report.status = "completed-private-cleanup-diagnostic-not-acceptance";
  else { report.status = "failed-not-acceptance"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
  controlEnd ??= Date.now();
}
finally {
  clearInterval(timer); await pending?.catch(() => {});
  if (cleanupDiagnostic) {
    try { await cleanupDiagnostic.close(); }
    catch (error) { report.diagnosticCleanupErrors = boundedErrorDetails(error); report.failures.push("Diagnostic cleanup: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; }
    finally { report.cleanupDiagnostic = cleanupDiagnostic.report(); }
  }
  if (monitor) {
    try { await monitor.close(); }
    catch (error) { report.observerCleanupErrors = boundedErrorDetails(error); report.failures.push("Observer cleanup: " + error); }
    finally { report.nativeObserverOwnership = monitor.ownershipSummary(); }
  }
  await realmPending?.catch(() => {});
  if (realmSampler) { report.realmObserverOwnership = realmSampler.ownershipSummary(); realmSampler.close(); }
  if (scaling) report.realmObservations = realmObservations;
  try {
    if (page && !page.isClosed()) {
      if (payloadControl && report.status === "failed-not-acceptance") report.failedJobState = await page.evaluate(() => {
        const s = window.__WITHIN_TEST__?.getState(); return s ? { jobState: s.jobState, workerStatus: s.workerStatus,
          metrics: s.metrics, error: s.error, warnings: s.warnings } : null;
      });
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
    async () => {
      if (chromeBirth) {
        const observedPids = [...new Set(samples.flatMap(sample => (sample.processes ?? []).map(p => p.pid)))];
        report.browserCleanup = await cleanupOwnedChromium({ identity: chromeBirth, observedPids,
          disconnect: async () => { await browser?.close(); } });
        assert.equal(report.browserCleanup.status, "owned-observed-pids-absent");
      } else await browser?.close();
    },
    async () => { if (server) report.serverCleanup = await server.close(); },
  ]).catch(error => { report.ownedProcessCleanupErrors = boundedErrorDetails(error); report.failures.push("Owned process cleanup: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; });
  try {
    assert.ok(!chrome || report.browserCleanup?.status === "owned-observed-pids-absent", "Never remove profile while observed owned processes may remain");
    if (runtime) { await runtime.close(); report.ownedRuntimeRemoved = true; }
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(await hashFile(path.join(root, file)), digest);
    if (report.browserBefore) { report.browserAfter = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(report.browserBefore, report.browserAfter); }
    report.protectedOriginalAfter = await original(); assert.deepEqual(report.protectedOriginalAfter, report.protectedOriginalBefore);
  } catch (error) { report.failures.push("Runtime/source protection: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; }
  const raw = Buffer.from(JSON.stringify(samples)), packed = gzipSync(raw);
  if (scaling && report.blankBaseline && report.loadedIdle) {
    for (const row of report.cases.filter(c => c.runMemory)) {
      const online = row.runMemory;
      row.onlineSampleCounts = { validSamples: online.validSamples, unavailableSamples: online.unavailableSamples };
      // A sample may finish after an online drain although its start timestamp
      // is within that run. Finalize from the immutable complete raw journal.
      row.runMemory = summarizeDocxHtmlRunMemory(samples, Date.parse(online.windowStart), Date.parse(online.windowEnd),
        report.blankBaseline, report.loadedIdle, online.cleanupStable);
      if (row.runMemory.incrementalPrivateMiB > 250 || row.runMemory.cleanupDeltaFromLoadedMiB > scalingPlan.cleanupRecoveryLimitMiB) {
        report.status = "failed-not-acceptance"; report.failures.push("Finalized native journal fails unchanged primary/cleanup gate"); process.exitCode = 1;
      }
    }
  }
  if (!report.memory && controlStart !== null && report.blankBaseline) {
    const active = samples.filter(row => Date.parse(row.timestamp) >= controlStart && Date.parse(row.timestamp) <= controlEnd);
    const valid = active.filter(row => row.privateBytes !== null && row.processes);
    if (valid.length) {
      const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
      report.memory = { peak, validSamples: valid.length, unavailableSamples: active.length - valid.length,
        incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, limitMiB: 250,
        windowStart: new Date(controlStart).toISOString(), windowEnd: new Date(controlEnd).toISOString(),
        scope: "failed-partial-control-window-not-completion-or-acceptance" };
    }
  }
  // Heading controls have separate cases, but the same late native replies
  // must be reconciled against their original immutable run windows as scaling.
  if (report.blankBaseline && report.loadedIdle) for (const row of [...report.outlineControl?.cases ?? [], ...report.emphasisControl?.cases ?? [], ...(tableSmall ? report.cases : [])]) {
    if (!row.smallRunMemory) continue;
    const online = row.smallRunMemory;
    row.onlineSampleCounts = { validSamples: online.validSamples, unavailableSamples: online.unavailableSamples };
    row.smallRunMemory = summarizeDocxHtmlRunMemory(samples, Date.parse(online.windowStart), Date.parse(online.windowEnd),
      report.blankBaseline, report.loadedIdle, online.cleanupStable);
    if (row.smallRunMemory.incrementalPrivateMiB > 250 || row.smallRunMemory.cleanupDeltaFromLoadedMiB > scalingPlan.cleanupRecoveryLimitMiB) {
      report.status = "failed-not-acceptance"; report.failures.push("Finalized native small-control journal fails unchanged primary/cleanup gate"); process.exitCode = 1;
    }
  }
  const archive = `evidence/${stamp}-docx-html-native-samples.json.gz`;
  await writeFile(path.join(root, archive), packed, { flag: "wx" });
  report.nativeArchive = { file: archive, bytes: packed.length, sha256: sha(packed), decodedBytes: raw.length, decodedSha256: sha(raw) };
  if (scaling) {
    const base = `evidence/${stamp}-docx-html-scaling`;
    report.readableReport = base + ".html"; report.csvReport = base + ".csv";
    const csv = ["paragraphs,repeat,sourceBytes,outputBytes,elapsedMs,incrementalPrivateMiB,cleanupDeltaFromLoadedMiB", ...report.cases.filter(c => c.runMemory).map(c =>
      [c.paragraphs, c.repeat, c.sourceBytes, c.outputBytes, c.metrics.elapsedMs, c.runMemory.incrementalPrivateMiB, c.runMemory.cleanupDeltaFromLoadedMiB].join(","))].join("\n") + "\n";
    await writeFile(path.join(root, report.csvReport), csv, { flag: "wx" });
    await writeFile(path.join(root, report.readableReport), renderDocxHtmlScalingSummary(report), { flag: "wx" });
  }
  report.finishedAt = new Date().toISOString(); const file = path.join(root, "evidence", `${stamp}-docx-html-qualification.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, cases: report.cases.map(c => c.kind), memory: report.memory?.incrementalPrivateMiB, failures: report.failures }));
}
