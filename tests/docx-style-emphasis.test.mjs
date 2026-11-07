import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";
const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const built = await build({ entryPoints: ["workers/docx-html-conversion.ts"], bundle: true, write: false, format: "esm", platform: "browser" });
const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].contents).toString("base64"));
const style = (id, type, properties, base = "", extra = "") => `<w:style w:type="${type}" w:styleId="${id}" ${extra}>${base ? `<w:basedOn w:val="${base}"/>` : ""}<w:rPr>${properties}</w:rPr></w:style>`;
const run = (text, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t>${text}</w:t></w:r>`;
const paragraph = (runs, id = "") => `<w:p>${id ? `<w:pPr><w:pStyle w:val="${id}"/></w:pPr>` : ""}${runs}</w:p>`;
async function convert(body, styles = "") {
  const rels = "http://schemas.openxmlformats.org/package/2006/relationships";
  const parts = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": `<Relationships xmlns="${rels}"><Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<Relationships xmlns="${rels}"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "word/styles.xml": `<w:styles xmlns:w="${WORD}">${styles}</w:styles>`,
    "word/document.xml": `<w:document xmlns:w="${WORD}"><w:body>${body}</w:body></w:document>`,
  };
  const file = new File([zipSync(Object.fromEntries(Object.entries(parts).map(([n, t]) => [n, strToU8(t)])), { level: 0 })], "styles.docx");
  assert.ok(file.size <= 131072); const chunks = [], warnings = []; let total = 0, pending = 0, peakPending = 0;
  await runDocxToHtml({ file, metrics: { inputBytes: 0 }, warn: w => warnings.push(w), assertActive() {}, progress() {},
    async write(chunk) { pending++; peakPending = Math.max(peakPending, pending); total += chunk.length; assert.ok(total <= 131072);
      chunks.push(Buffer.from(chunk)); await new Promise(resolve => setImmediate(resolve)); pending--; } });
  return { html: Buffer.concat(chunks).toString(), warnings, peakPending };
}
test("paragraph/character style chains preserve bold/italic/underline/strike with direct overrides and strict backpressure", async () => {
  const styles = style("P", "paragraph", "<w:b/>") + style("P2", "paragraph", "<w:i/>", "P") +
    style("C", "character", '<w:u w:val="single"/><w:strike/>') + style("C2", "character", "<w:i/>", "C");
  const r = await convert(paragraph(run("Inherited", '<w:rStyle w:val="C"/>') +
    run("Direct", '<w:rStyle w:val="C"/><w:b w:val="false"/><w:i w:val="false"/><w:u w:val="none"/><w:strike w:val="false"/>'), "P2"), styles);
  assert.match(r.html, /<p><strong><em><u><s>Inherited<\/s><\/u><\/em><\/strong>Direct<\/p>/); assert.equal(r.peakPending, 1);
});
test("true style toggles compose across both chains; false style toggles leave inherited state, direct true sets rather than toggles", async () => {
  const styles = style("P", "paragraph", "<w:b/><w:strike/>") + style("P2", "paragraph", '<w:b w:val="false"/><w:strike/>', "P") +
    style("C", "character", "<w:b/><w:i/>") + style("C2", "character", "<w:i/>", "C");
  const r = await convert(paragraph(run("Toggled", '<w:rStyle w:val="C2"/>') + run("Direct", '<w:rStyle w:val="C2"/><w:b/>'), "P2"), styles);
  assert.match(r.html, /<p>Toggled<strong>Direct<\/strong><\/p>/);
  assert.match((await convert(paragraph(run("Parent"), "P"), styles)).html, /<strong><s>Parent<\/s><\/strong>/);
});
test("underline is absolute at each style level, direct none overrides it; patterns normalize without copying attributes", async () => {
  const styles = style("P", "paragraph", '<w:u w:val="double" w:color="FF0000"/>') + style("C", "character", '<w:u w:val="none"/>');
  const r = await convert(paragraph(run("Paragraph") + run("Character", '<w:rStyle w:val="C"/>') + run("Direct", '<w:u w:val="none"/>'), "P"), styles);
  assert.match(r.html, /<p><u>Paragraph<\/u>CharacterDirect<\/p>/); assert.doesNotMatch(r.html, /FF0000/);
  assert.ok(r.warnings.some(w => w.includes("normalized to a single underline")));
  await assert.rejects(convert(paragraph(run("x", '<w:u w:val="not-a-pattern"/>'))), /underline/);
});
test("character chains do not inherit a paragraph base, and each job gets independent bounded style state", async () => {
  const styles = style("P", "paragraph", "<w:b/>") + style("C", "character", "<w:i/>", "P");
  assert.match((await convert(paragraph(run("One", '<w:rStyle w:val="C"/>')), styles)).html, /<p><em>One<\/em><\/p>/);
  assert.match((await convert(paragraph(run("Two")))).html, /<p>Two<\/p>/);
  for (const value of ["", "x".repeat(257)]) await assert.rejects(convert(paragraph(run("bad", `<w:rStyle w:val="${value}"/>`))), /reference/);
});
test("document run defaults and default paragraph style apply; character default alone is not implicitly applied", async () => {
  const styles = '<w:docDefaults><w:rPrDefault><w:rPr><w:i/><w:u w:val="single"/></w:rPr></w:rPrDefault></w:docDefaults>' +
    style("P", "paragraph", "<w:b/>", "", 'w:default="1"') + style("C", "character", "<w:strike/>", "", 'w:default="1"');
  const r = await convert(paragraph(run("Default")), styles);
  assert.match(r.html, /<p><strong><em><u>Default<\/u><\/em><\/strong><\/p>/); assert.doesNotMatch(r.html, /<s>/);
});
test("missing or wrong-type character style is ignored, paragraph style fallback is shared with outlines; warnings stay bounded", async () => {
  const styles = style("P", "paragraph", "<w:b/>", "", 'w:default="1"') + style("C", "character", "<w:i/>");
  const r = await convert(paragraph(run("A", '<w:rStyle w:val="P"/>') + run("B", '<w:rStyle w:val="missing"/>'), "C"), styles);
  assert.match(r.html, /<p><strong>A<\/strong><strong>B<\/strong><\/p>/);
  assert.ok(r.warnings.filter(w => /referenced.*style.*missing|another type/.test(w)).length <= 2);
});
test("style emphasis cannot be injected from paragraph marks, change history or foreign namespaces", async () => {
  const styles = style("P", "paragraph", '<w:rPrChange><w:rPr><w:b/></w:rPr></w:rPrChange><x:b xmlns:x="urn:foreign"/>');
  const r = await convert('<w:p><w:pPr><w:pStyle w:val="P"/><w:rPr><w:b/></w:rPr></w:pPr>' + run("Plain") + '</w:p>', styles);
  assert.match(r.html, /<p>Plain<\/p>/);
});
test("character inheritance cycles and cached parent-first chains beyond64 levels fail closed", async () => {
  await assert.rejects(convert(paragraph(run("x", '<w:rStyle w:val="A"/>')), style("A", "character", "", "B") + style("B", "character", "", "A")), /cyclic|64 levels/);
  const chain = count => Array.from({ length: count }, (_, n) => style("C" + n, "character", n ? "" : "<w:b/>", n ? "C" + (n - 1) : "")).join("");
  assert.match((await convert(paragraph(run("Allowed", '<w:rStyle w:val="C63"/>')), chain(64))).html, /<strong>Allowed<\/strong>/);
  await assert.rejects(convert(paragraph(run("x", '<w:rStyle w:val="C64"/>')), chain(65)), /64 levels/);
});
test("style/direct emphasis and character references reject ambiguous duplicates, invalid values and late properties", async () => {
  for (const [body, styles, message] of [
    [paragraph(run("x")), style("P", "paragraph", "<w:b/><w:b/>"), /repeats/],
    [paragraph(run("x")), style("P", "paragraph", '<w:b w:val="bogus"/>'), /on\/off/],
    [paragraph(run("x", '<w:rStyle w:val="A"/><w:rStyle w:val="B"/>')), "", /reference.*repeated/],
    [paragraph(run("x", "<w:b/><w:b/>")), "", /repeats/],
    ['<w:p><w:r><w:rPr/><w:rPr/><w:t>x</w:t></w:r></w:p>', "", /once/],
    ['<w:p><w:r><w:t/><w:rPr><w:b/></w:rPr></w:r></w:p>', "", /precede/],
  ]) await assert.rejects(convert(body, styles), message);
});
