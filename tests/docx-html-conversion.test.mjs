import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { zipSync, strToU8 } from "fflate";
import { privateQualificationProfiles, publicProfilesFor } from "../lib/capability-registry.ts";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { reviewDocxHtmlIntegration } from "../scripts/lib/reviewed-docx-html-integration.mjs";
import { reconcileChromiumBirths } from "../scripts/lib/reconcile-chromium-births.mjs";
const bundled = await build({ entryPoints: ["workers/docx-html-conversion.ts"], bundle: true, format: "esm", write: false, platform: "browser" });
const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64"));
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const xml = body => `<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>`;
test("historical comparisons reverse only the exact reviewed private integration and reject unrelated changes", async () => {
  for (const file of ["lib/capability-registry.ts", "workers/conversion.worker.ts"]) {
    const bytes = await readFile(file), reviewed = reviewDocxHtmlIntegration(file, bytes);
    assert.equal(reviewed.reviewedDocxHtmlChange, true);
    assert.equal(reviewDocxHtmlIntegration(file, reviewed.historicalBytes).reviewedDocxHtmlChange, false);
    assert.throws(() => reviewDocxHtmlIntegration(file, Buffer.concat([bytes, Buffer.from("\n")])));
  }
});
function fixture(document, extra = {}) {
  assert.ok(document.length < 2 * 1024 * 1024, "Unit fixture only, not large-file buffering evidence");
  return new File([zipSync({
    "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(document), ...extra,
  }, { level: 0 })], "fixture.docx");
}
async function convert(document, { extra, failWrite, failPatch, cancel } = {}) {
  const chunks = [], warnings = [], metrics = { inputBytes: 0 }, file = fixture(document, extra);
  const patches = [];
  let writes = 0, active = 0, peak = 0, maximumChunkBytes = 0, total = 0;
  await runDocxToHtml({ file, metrics, warn: value => warnings.push(value), progress() {},
    assertActive() { if (cancel) throw new DOMException("Synthetic cancellation", "AbortError"); },
    async write(chunk) {
      writes++; if (failWrite) throw new DOMException("Synthetic write failure", "QuotaExceededError");
      active++; peak = Math.max(peak, active); maximumChunkBytes = Math.max(maximumChunkBytes, chunk.length);
      total += chunk.length; assert.ok(total <= 4 * 1024 * 1024, "Small bounded unit output capture only");
      chunks.push(Buffer.from(chunk)); await new Promise(resolve => setImmediate(resolve)); active--;
    },
    async patch(position, bytes) {
      if (failPatch) throw new DOMException("Synthetic row-span patch failure", "QuotaExceededError");
      assert.equal(active, 0); assert.equal(bytes.length, 5);
      let offset = position;
      const target = chunks.find(chunk => {
        if (offset < chunk.length) return true;
        offset -= chunk.length; return false;
      });
      assert.ok(target && offset + bytes.length <= target.length);
      patches.push({ position, value: Buffer.from(bytes).toString() });
      target.set(bytes, offset);
    } });
  return { html: Buffer.concat(chunks).toString("utf8"), warnings, metrics, inputBytes: file.size, writes, peak, maximumChunkBytes, patches };
}
test("DOCX HTML is a genuine private worker route, absent from normal public selection", () => {
  const profile = privateQualificationProfiles.find(row => row.id === "docx-to-html"); assert.ok(profile);
  assert.equal(profile.public, false); assert.equal(profile.maxTestedBytes, null); assert.equal(profile.automatedTestStatus, "pending");
  assert.ok(!publicProfilesFor("docx").some(row => row.id === profile.id));
  assert.ok(publicProfilesFor("docx", true).some(row => row.id === profile.id));
});
test("real ZIP package preserves paragraphs, Unicode, direct run emphasis, tabs and breaks without copying source markup", async () => {
  const r = await convert(xml('<w:p><w:r><w:rPr><w:b/><w:i/><w:u w:val="single"/><w:strike/></w:rPr><w:t>β &amp; &lt;script&gt; 😀</w:t><w:tab/><w:br/><w:t>next</w:t></w:r></w:p><w:p/>'));
  assert.ok(r.html.includes('<p><strong><em><u><s>β &amp; &lt;script&gt; 😀\t<br>next</s></u></em></strong></p>\n<p></p>'));
  assert.ok(r.html.startsWith("<!doctype html>")); assert.ok(r.html.includes("default-src 'none'"));
  assert.ok(!r.html.includes("<script>")); assert.equal(r.metrics.inputBytes, r.inputBytes); assert.equal(r.peak, 1);
  assert.ok(r.warnings.some(value => value.includes("Named styles")));
});
test("table rows/cells and nested tables remain structured rather than flattened", async () => {
  const p = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const r = await convert(xml(`<w:tbl><w:tr><w:tc>${p("one")}<w:tbl><w:tr><w:tc>${p("nested")}</w:tc></w:tr></w:tbl></w:tc><w:tc>${p("two")}</w:tc></w:tr></w:tbl>`));
  assert.equal((r.html.match(/<table>/g) ?? []).length, 2); assert.equal((r.html.match(/<td>/g) ?? []).length, 3);
  assert.ok(r.html.includes("<td><p>two</p>")); assert.ok(r.html.endsWith("</body></html>\n"));
});
test("horizontal grid spans survive on their own cell without carrying state into nested or following cells", async () => {
  const p = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const span = value => `<w:tcPr><w:gridSpan w:val="${value}"/></w:tcPr>`;
  const r = await convert(xml(`<w:tbl><w:tr><w:tc><w:tcPr><z:gridSpan xmlns:z="${word}" z:val="+0003"/><w:tcPrChange><w:tcPr><w:gridSpan w:val="6"/></w:tcPr></w:tcPrChange></w:tcPr><w:tbl><w:tr><w:tc>${span(2)}${p("nested")}</w:tc><w:tc>${p("ordinary")}</w:tc></w:tr></w:tbl>${p("outer")}</w:tc><w:tc>${span(1000)}</w:tc><w:tc>${span(0)}${p("next")}</w:tc></w:tr></w:tbl>`));
  assert.deepEqual([...r.html.matchAll(/<td(?: colspan="([0-9]+)")?>/g)].map(m => m[1] ?? null), ["3", "2", null, "1000", null]);
  assert.ok(r.html.includes('<td colspan="3"><table><tr><td colspan="2"><p>nested</p>'));
  assert.ok(r.html.includes('<td colspan="1000"></td>\n<td><p>next</p>'));
  assert.ok(r.warnings.some(value => value.includes("Legacy horizontal merges")));
});
test("foreign or historical span properties cannot change the current horizontal grid", async () => {
  const r = await convert(xml('<w:tbl><w:tr><w:tc><w:tcPr><x:gridSpan xmlns:x="urn:fake" w:val="8"/><w:tcPrChange><w:tcPr><w:gridSpan w:val="9"/><w:vMerge w:val="restart"/></w:tcPr></w:tcPrChange><x:vMerge xmlns:x="urn:fake" w:val="restart"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>'));
  assert.ok(r.html.includes("<td><p></p>")); assert.doesNotMatch(r.html, /colspan|rowspan/);
});
const wordParagraph = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const rowCell = (text, merge, width = 1) => `<w:tc>${merge || width !== 1 ? `<w:tcPr>${width === 1 ? "" : `<w:gridSpan w:val="${width}"/>`}${merge === "default" ? "<w:vMerge/>" : merge ? `<w:vMerge w:val="${merge}"/>` : ""}</w:tcPr>` : ""}${text ? wordParagraph(text) : "<w:p/>"}</w:tc>`;
const row = (cells, props = "") => `<w:tr>${props}${cells.join("")}</w:tr>`;
const table = rows => xml(`<w:tbl>${rows.join("")}</w:tbl>`);

test("bounded vertical spans preserve exact grid columns, omit empty continuations and preserve edge positions", async () => {
  const gap = '<w:trPr><w:gridBefore w:val="2"/><w:gridAfter w:val="1"/></w:trPr>';
  const r = await convert(table([row([rowCell("joined", "restart", 2), rowCell("A")], gap),
    row([rowCell("", "default", 2), rowCell("B")], gap),
    row([rowCell("", "continue", 2), rowCell("C")], gap), row([rowCell("new", undefined, 2)], gap)]));
  assert.equal(r.patches.length, 0, "Small spans stay in the existing buffer");
  assert.match(r.html, /<td colspan="2" aria-hidden="true"><\/td><td colspan="2" rowspan="00003"><p>joined<\/p>/);
  assert.equal((r.html.match(/rowspan=/g) ?? []).length, 1);
  assert.equal((r.html.match(/aria-hidden="true"/g) ?? []).length, 8);
  for (const letter of ["A", "B", "C", "new"]) assert.ok(r.html.includes(`<p>${letter}</p>`));
  assert.ok(!r.html.includes("<p></p>"));
});

test("a flushed merge header gets one five-byte patch and later rows keep their byte order", async () => {
  const input = table([row([rowCell("é😀".repeat(30000), "restart"), rowCell("row one")]),
    row([rowCell("", "continue"), rowCell("row two")]), row([rowCell("tail")])]);
  const r = await convert(input);
  assert.equal(r.peak, 1); assert.equal(r.maximumChunkBytes, 65536);
  assert.equal(r.patches.length, 1); assert.equal(r.patches[0].value, "00002");
  assert.equal(Buffer.from(r.html).subarray(r.patches[0].position, r.patches[0].position + 5).toString(), "00002");
  assert.match(r.html, /<td rowspan="00002"><p>é😀/); assert.ok(r.html.includes("<td><p>tail</p>"));
  await assert.rejects(convert(input, { failPatch: true }), error => error.name === "QuotaExceededError");
});

test("a row-span field near the chunk edge is reserved intact before a later patch", async () => {
  const rows = [row([rowCell("anchor", "restart")]), row([rowCell("", "continue"), rowCell("x".repeat(70000))])];
  const contents = prefix => xml(wordParagraph(prefix) + `<w:tbl>${rows.join("")}</w:tbl>`);
  const base = await convert(contents(""));
  const prefix = "p".repeat(65534 - base.patches[0].position);
  const r = await convert(contents(prefix));
  assert.deepEqual(r.patches, [{ position: 65534, value: "00002" }]);
  assert.match(r.html, /rowspan="00002"><p>anchor/);
  assert.ok(r.html.includes("x".repeat(70000)));
});

test("active merge records and edge grid offsets have explicit finite limits", async () => {
  await assert.rejects(convert(table([row(Array.from({ length: 1025 }, () => rowCell("", "restart")))])), /active vertical merge limit/);
  await assert.rejects(convert(table([row([rowCell("value")], '<w:trPr><w:gridBefore w:val="1001"/></w:trPr>')])), /HTML limit/);
  await assert.rejects(convert(table([row([rowCell("value")], '<w:trPr><w:gridBefore w:val="0"/><w:gridBefore w:val="1"/></w:trPr>')])), /late or repeated/);
});

for (const [rows, pattern] of [
  [[row([rowCell("", "default")])], /does not match/],
  [[row([rowCell("first", "restart", 2)]), row([rowCell("", "default")])], /does not match/],
  [[row([rowCell("first", "restart")]), row([rowCell("ordinary")]), row([rowCell("", "default")])], /does not match/],
  [[row([rowCell("first", "restart")]), row([rowCell("must not disappear", "default")])], /contains text/],
  [[row([rowCell("first", "bogus")])], /invalid vertical merge/],
]) test(`unsafe vertical merge geometry or content is rejected: ${rows.join("")}`, async () => {
  await assert.rejects(convert(table(rows)), pattern);
});
for (const [properties, message] of [
  ['<w:tcPr><w:gridSpan w:val="1001"/></w:tcPr>', /HTML limit/],
  ['<w:tcPr><w:gridSpan w:val="-1"/></w:tcPr>', /invalid grid span/],
  ['<w:tcPr><w:gridSpan w:val="2e1"/></w:tcPr>', /invalid grid span/],
  ['<w:tcPr><w:gridSpan val="2"/></w:tcPr>', /invalid grid span/],
  ['<w:tcPr><w:gridSpan w:val="2"/><w:gridSpan w:val="3"/></w:tcPr>', /repeats its grid span/],
  ['<w:tcPr/><w:tcPr/>', /once before content/],
  ['<w:p/><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>', /once before content/],
]) test(`invalid or late table geometry is rejected: ${properties}`, async () => {
  await assert.rejects(convert(xml(`<w:tbl><w:tr><w:tc>${properties}</w:tc></w:tr></w:tbl>`)), message);
});
test("accepted insertions and field display text remain, deletions/graphics/foreign contents are omitted with disclosure", async () => {
  const r = await convert(xml('<w:p><w:del><w:r><w:t>deleted</w:t></w:r></w:del><w:moveFrom><w:r><w:t>moved</w:t></w:r></w:moveFrom><w:ins><w:r><w:t>inserted</w:t></w:r></w:ins><w:r><w:drawing><w:t>graphic</w:t></w:drawing><w:instrText>INSTRUCTION</w:instrText><w:t>display</w:t></w:r><x:data xmlns:x="urn:foreign"><w:r><w:t>foreign</w:t></w:r></x:data></w:p>'));
  assert.ok(r.html.includes("inserteddisplay")); for (const word of ["deleted", "moved", "graphic", "INSTRUCTION", "foreign"]) assert.ok(!r.html.includes(word));
  assert.ok(r.warnings.some(value => value.includes("Foreign-namespace")));
});
test("namespace aliases and scoped rebinding cannot spoof Word text or emphasis", async () => {
  const r = await convert(`<a:document xmlns:a="${word}"><a:body><a:p><a:r><a:rPr><z:b xmlns:z="${word}" z:val="false"/></a:rPr><a:t>plain</a:t></a:r><a:r xmlns:a="urn:fake"><a:t>hidden</a:t></a:r><a:r><a:t>restored</a:t></a:r></a:p></a:body></a:document>`);
  assert.ok(r.html.includes("plainrestored")); assert.ok(!r.html.includes("<strong>")); assert.ok(!r.html.includes("hidden"));
});
test("output is backpressured in64KiB chunks and does not split surrogate pairs at escaping boundaries", async () => {
  const text = ("x".repeat(4095) + "😀<&").repeat(20), r = await convert(xml(`<w:p><w:r><w:t><![CDATA[${text}]]></w:t></w:r></w:p>`));
  assert.ok(r.writes > 1); assert.equal(r.maximumChunkBytes, 65536); assert.equal(r.peak, 1);
  assert.ok(!r.html.includes("�")); assert.equal((r.html.match(/😀/gu) ?? []).length, 20);
});
for (const [name, document, message] of [
  ["mismatched tags", xml("<w:p><w:r><w:t>x</w:r></w:t></w:p>"), /mismatched/],
  ["text without run", xml("<w:p><w:t>bad</w:t></w:p>"), /supported run/],
  ["nested paragraph", xml("<w:p><w:p/></w:p>"), /overlapping/],
  ["row outside table", xml("<w:tr/>"), /overlapping/],
  ["missing body", `<w:document xmlns:w="${word}"/>`, /incomplete/],
  ["duplicate body", xml("<w:body/>"), /exactly one/],
  ["foreign root", '<x:document xmlns:x="urn:fake"><x:body/></x:document>', /WordprocessingML/],
  ["DTD", `<!DOCTYPE x [<!ENTITY bad "text">]>${xml("<w:p/>")}`, /DTD/],
  ["custom entity", xml("<w:p><w:r><w:t>&bad;</w:t></w:r></w:p>"), /unsupported entity/],
  ["unknown attribute prefix", xml('<w:p bad:attr="x"/>'), /undeclared/],
  ["duplicate expanded attribute", xml(`<w:p xmlns:x="${word}" w:val="1" x:val="2"/>`), /repeated expanded/],
  ["late run properties", xml("<w:p><w:r><w:t>x</w:t><w:rPr><w:b/></w:rPr></w:r></w:p>"), /must precede/],
  ["invalid on-off", xml('<w:p><w:r><w:rPr><w:b w:val="bogus"/></w:rPr><w:t>x</w:t></w:r></w:p>'), /invalid on\/off/],
  ["deep XML", xml("<w:sdt>".repeat(257) + "</w:sdt>".repeat(257)), /nesting/],
]) test(`unsafe or unsupported DOCX HTML structure fails explicitly: ${name}`, async () => {
  await assert.rejects(convert(document), message);
});
test("macro packages, cancellation and write failure are not successful conversions", async () => {
  await assert.rejects(convert(xml("<w:p/>"), { extra: { "word/vbaProject.bin": new Uint8Array([1]) } }), /Macro-enabled/);
  await assert.rejects(convert(xml("<w:p/>"), { cancel: true }), error => error.name === "AbortError");
  await assert.rejects(convert(xml("<w:p/>"), { failWrite: true }), error => error.name === "QuotaExceededError");
});

test("native horizontal-span browser outputs were genuine; PID reuse explains the retained failed teardown without claiming scratch removal", async () => {
  const read = file => readFile(new URL("../" + file, import.meta.url));
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const followup = JSON.parse(await read("evidence/2026-11-07-docx-column-span-reconciliation.json"));
  const reportBytes = await read(followup.browserReceipt);
  assert.equal(sha(reportBytes), followup.browserReceiptSha256);
  const report = JSON.parse(reportBytes);
  assert.equal(report.status, "failed-not-acceptance"); assert.equal(report.executedHead, followup.executedHead);
  assert.deepEqual(report.tableFixture.wordGridSpans, [2, 2]);
  assert.deepEqual(report.validatorControls.map(row => row.exitCode), [0, 1, 1, 1, 1]);
  const complete = report.cases.filter(c => c.kind === "complete");
  assert.equal(complete.length, 4);
  for (const row of complete) {
    assert.equal(row.outputBytes, 837); assert.equal(row.validated.sha256, followup.independentlyValidatedOutput.sha256);
    assert.deepEqual(row.validated.columnSpans, [2, 2]); assert.equal(row.validated.tableCells, 7);
    assert.equal(row.validated.nestedStructureVerified, true); assert.equal(row.validated.exactParagraphContentVerified, true);
    assert.equal(row.destinationObservation.actualFileHandle, true); assert.equal(row.destinationObservation.mode, "handle");
    assert.ok(row.metrics.maxReadChunkBytes <= 262144 && row.metrics.maxWriteChunkBytes <= 65536);
    assert.ok(row.metrics.peakPendingOperations <= 1 && row.smallRunMemory.cleanupDeltaFromLoadedMiB <= 96);
  }
  for (const kind of ["payload-cancel", "write-error"]) assert.deepEqual(report.cases.find(row => row.kind === kind).leftovers, []);
  assert.deepEqual(report.forbiddenRequests, []); assert.equal(report.headed, false); assert.equal(report.publicPromotion, false);
  const packed = await read(report.nativeArchive.file), decoded = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(sha(packed), report.nativeArchive.sha256); assert.equal(sha(decoded), report.nativeArchive.decodedSha256);
  const samples = JSON.parse(decoded), time = Date.parse;
  const valid = samples.filter(row => row.privateBytes !== null && time(row.timestamp) >= time(report.memory.windowStart) && time(row.timestamp) <= time(report.memory.windowEnd));
  assert.equal(valid.length, 430);
  assert.ok(valid.every(row => row.processes.reduce((sum, p) => sum + p.privateBytes, 0) === row.privateBytes));
  assert.equal((Math.max(...valid.map(row => row.privateBytes)) - report.blankBaseline.privateBytes) / 1048576, 71.68359375);
  const result = reconcileChromiumBirths({ identity: report.browserLaunchIdentity, observedPids: report.browserCleanup.observedPids,
    samples, current: report.browserCleanup.observations.at(-1).current });
  assert.equal(result.allObservedBirthsAbsent, true); assert.equal(result.observedPidCount, 47);
  assert.deepEqual(result.reused.map(row => row.pid), [38340]); assert.equal(result.noProcessesKilled, true);
  assert.equal(followup.teardown.ownedScratchRemoved, false); assert.equal(report.ownedRuntimeRemoved, undefined);
  assert.deepEqual(followup.protectedOriginalFollowup, { ...report.protectedOriginalBefore, matchesBefore: true });
});

test("native vertical merge receipt authenticates the flushed header patch, later output, full-tree memory and this run's cleanup", async () => {
  const read = file => readFile(new URL("../" + file, import.meta.url));
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const proof = JSON.parse(await read("evidence/2026-11-07-docx-vertical-span-verification.json"));
  const receipt = await read(proof.browserReceipt);
  assert.equal(sha(receipt), proof.browserReceiptSha256);
  const report = JSON.parse(receipt);
  assert.equal(report.executedHead, proof.executedHead);
  assert.equal(report.status, "passed-private-docx-vertical-span-patch-and-recovery-not-scaling-or-promotion");
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.tableFixture.verticalMergeRoles, ["restart", "continue"]);
  assert.ok(report.tableFixture.anchorContentBytes > 2 * 65536);
  assert.deepEqual(report.validatorControls.map(c => c.exitCode), [0, 1, 1, 1, 1, 1, 1]);
  const done = report.cases.filter(c => c.kind === "complete");
  assert.equal(done.length, 4);
  for (const row of done) {
    assert.equal(row.outputBytes, 216842); assert.equal(row.validated.sha256, proof.output.sha256);
    assert.deepEqual(row.validated.rowSpans, [2]); assert.deepEqual(row.validated.columnSpans, [2]);
    assert.equal(row.validated.rowSpanDigitsByteOffset, 564);
    assert.equal(row.validated.allTextAndPostPatchTailVerified, true); assert.equal(row.validated.nestedStructureVerified, true);
    assert.equal(row.destinationObservation.actualFileHandle, true);
    assert.equal(row.metrics.maxWriteChunkBytes, 65536); assert.equal(row.metrics.peakPendingOperations, 1);
    assert.equal(row.metrics.pendingOperations, 0); assert.ok(row.smallRunMemory.cleanupDeltaFromLoadedMiB <= 96);
  }
  assert.equal(report.cases.find(row => row.kind === "payload-cancel").armedMetrics.outputBytes, 1835008);
  for (const kind of ["payload-cancel", "write-error"]) assert.deepEqual(report.cases.find(row => row.kind === kind).leftovers, []);
  const packed = await read(report.nativeArchive.file), raw = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(sha(packed), report.nativeArchive.sha256); assert.equal(sha(raw), report.nativeArchive.decodedSha256);
  const native = JSON.parse(raw), window = native.filter(r => Date.parse(r.timestamp) >= Date.parse(report.memory.windowStart)
    && Date.parse(r.timestamp) <= Date.parse(report.memory.windowEnd));
  assert.equal(window.length, 443); assert.equal(window.filter(r => r.privateBytes === null).length, 0);
  assert.ok(window.every(r => r.processes.reduce((sum, p) => sum + p.privateBytes, 0) === r.privateBytes));
  assert.equal((Math.max(...window.map(r => r.privateBytes)) - report.blankBaseline.privateBytes) / 1048576, 77.80078125);
  assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(report.browserCleanup.observedPids.length, 41);
  assert.equal(report.serverCleanup.ownedRootAbsent, true); assert.equal(report.ownedRuntimeRemoved, true);
  assert.deepEqual(report.protectedOriginalBefore, report.protectedOriginalAfter);
  assert.equal(report.protectedOriginalAfter.sha256, proof.cleanup.protectedOriginalSha256Unchanged);
  assert.equal(report.headed, false); assert.equal(report.nativePickerVerified, false); assert.equal(report.publicPromotion, false);
  assert.equal(proof.priorHorizontalFailureSuperseded, false);
});
