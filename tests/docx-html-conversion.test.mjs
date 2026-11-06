import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { zipSync, strToU8 } from "fflate";
import { privateQualificationProfiles, publicProfilesFor } from "../lib/capability-registry.ts";
const bundled = await build({ entryPoints: ["workers/docx-html-conversion.ts"], bundle: true, format: "esm", write: false, platform: "browser" });
const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64"));
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const xml = body => `<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>`;
function fixture(document, extra = {}) {
  assert.ok(document.length < 2 * 1024 * 1024, "Unit fixture only, not large-file buffering evidence");
  return new File([zipSync({
    "[Content_Types].xml": strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(document), ...extra,
  }, { level: 0 })], "fixture.docx");
}
async function convert(document, { extra, failWrite, cancel } = {}) {
  const chunks = [], warnings = [], metrics = { inputBytes: 0 }, file = fixture(document, extra);
  let writes = 0, active = 0, peak = 0, maximumChunkBytes = 0, total = 0;
  await runDocxToHtml({ file, metrics, warn: value => warnings.push(value), progress() {},
    assertActive() { if (cancel) throw new DOMException("Synthetic cancellation", "AbortError"); },
    async write(chunk) {
      writes++; if (failWrite) throw new DOMException("Synthetic write failure", "QuotaExceededError");
      active++; peak = Math.max(peak, active); maximumChunkBytes = Math.max(maximumChunkBytes, chunk.length);
      total += chunk.length; assert.ok(total <= 4 * 1024 * 1024, "Small bounded unit output capture only");
      chunks.push(Buffer.from(chunk)); await new Promise(resolve => setImmediate(resolve)); active--;
    } });
  return { html: Buffer.concat(chunks).toString("utf8"), warnings, metrics, inputBytes: file.size, writes, peak, maximumChunkBytes };
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
