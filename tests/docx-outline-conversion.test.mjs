import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const packageRels = "http://schemas.openxmlformats.org/package/2006/relationships";
const styleType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const built = await build({ entryPoints: ["workers/docx-html-conversion.ts"], bundle: true, write: false, format: "esm", platform: "browser" });
const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].contents).toString("base64"));
const paragraph = (properties, text) => `<w:p><w:pPr>${properties}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
async function convert(body, styles = "", { target = "styles.xml", extra = {}, relations } = {}) {
  const parts = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": `<Relationships xmlns="${packageRels}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>`,
  };
  if (styles) {
    parts["word/_rels/document.xml.rels"] = relations ?? `<Relationships xmlns="${packageRels}"><Relationship Id="styles" Type="${styleType}" Target="${target}"/></Relationships>`;
    parts["word/styles.xml"] = styles;
  }
  const entries = Object.fromEntries(Object.entries({ ...parts, ...extra }).map(([name, text]) => [name, strToU8(text)]));
  const file = new File([zipSync(entries, { level: 0 })], "outline.docx");
  assert.ok(file.size < 2 * 1024 * 1024, "Bounded unit fixture only");
  const chunks = [], warnings = []; let total = 0, pending = 0, peakPending = 0;
  await runDocxToHtml({ file, metrics: { inputBytes: 0 }, warn: text => warnings.push(text), progress() {}, assertActive() {},
    async write(chunk) { pending++; peakPending = Math.max(pending, peakPending); total += chunk.length;
      assert.ok(total <= 2 * 1024 * 1024); chunks.push(Buffer.from(chunk)); await new Promise(resolve => setImmediate(resolve)); pending--; },
  });
  return { html: Buffer.concat(chunks).toString(), warnings, peakPending };
}
const definitions = body => `<w:styles xmlns:w="${word}">${body}</w:styles>`;
test("paragraph outline inherits through real referenced styles; body-level direct formatting resets it", async () => {
  const r = await convert(paragraph('<w:pStyle w:val="Derived"/>', "Inherited heading") +
    paragraph('<w:pStyle w:val="Derived"/><w:outlineLvl w:val="9"/>', "Body override"),
  definitions('<w:style w:type="paragraph" w:styleId="Base"><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Derived"><w:basedOn w:val="Base"/></w:style>'));
  assert.match(r.html, /<h1[^>]*>Inherited heading<\/h1>/); assert.match(r.html, /<p>Body override<\/p>/);
  assert.ok(r.warnings.includes("DOCX outline metadata read 2 style definitions from a referenced internal package part."));
  assert.equal(r.peakPending, 1);
});
test("direct outlines preserve levels without guessing from names or copying source attributes", async () => {
  const r = await convert(paragraph('<w:outlineLvl w:val="2"/>', "Third level") + paragraph('<w:outlineLvl w:val="8"/>', "Ninth level"));
  assert.match(r.html, /<h3[^>]*>Third level<\/h3>/);
  assert.match(r.html, /<p role="heading" aria-level="9"[^>]*>Ninth level<\/p>/);
});
test("default paragraph outline applies but an orphan styles part never invents source formatting", async () => {
  const styles = definitions('<w:style w:type="paragraph" w:styleId="Default" w:default="1"><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>');
  assert.match((await convert(paragraph("", "Default heading"), styles)).html, /<h2[^>]*>Default heading<\/h2>/);
  const orphan = await convert(paragraph("", "Plain orphan"), "", { extra: { "word/styles.xml": styles } });
  assert.match(orphan.html, /<p>Plain orphan<\/p>/); assert.doesNotMatch(orphan.html, /<h2/);
});
test("style namespace aliases, internal relative parts, defaults and wrong-type base references are resolved without name heuristics", async () => {
  const custom = `<x:styles xmlns:x="${word}"><x:docDefaults><x:pPrDefault><x:pPr><x:outlineLvl x:val="2"/></x:pPr></x:pPrDefault></x:docDefaults>` +
    '<x:style x:type="character" x:styleId="Character"><x:pPr><x:outlineLvl x:val="0"/></x:pPr></x:style>' +
    '<x:style x:type="paragraph" x:styleId="Heading1"><x:basedOn x:val="Character"/></x:style></x:styles>';
  const r = await convert(paragraph('<w:pStyle w:val="Heading1"/>', "Not guessed"), custom,
    { target: "../custom-styles.xml", extra: { "custom-styles.xml": custom } });
  assert.match(r.html, /<h3[^>]*>Not guessed<\/h3>/); assert.doesNotMatch(r.html, /<h1/);
});
test("style inheritance64-level bound applies regardless of parent-first definition/cache order", async () => {
  const chain = count => definitions(Array.from({ length: count }, (_, n) => `<w:style w:type="paragraph" w:styleId="S${n}">` +
    (n ? `<w:basedOn w:val="S${n - 1}"/>` : '<w:pPr><w:outlineLvl w:val="1"/></w:pPr>') + '</w:style>').join(""));
  assert.match((await convert(paragraph('<w:pStyle w:val="S63"/>', "Sixty four"), chain(64))).html, /<h2[^>]*>Sixty four<\/h2>/);
  await assert.rejects(convert(paragraph('<w:pStyle w:val="S64"/>', "Too deep"), chain(65)), /64 levels/);
});
for (const [name, styles, options, message] of [
  ["cyclic inheritance", definitions('<w:style w:type="paragraph" w:styleId="A"><w:basedOn w:val="B"/></w:style><w:style w:type="paragraph" w:styleId="B"><w:basedOn w:val="A"/></w:style>'), {}, /cyclic/],
  ["duplicate IDs", definitions('<w:style w:styleId="A"/><w:style w:styleId="A"/>'), {}, /duplicate style/],
  ["multiple defaults", definitions('<w:style w:type="paragraph" w:styleId="A" w:default="1"/><w:style w:type="paragraph" w:styleId="B" w:default="1"/>'), {}, /ambiguous default/],
  ["metadata bound", definitions(" ".repeat(1048576)), {}, /1MiB/],
  ["definition bound", definitions(Array.from({ length: 1025 }, (_, n) => `<w:style w:styleId="S${n}"/>`).join("")), {}, /1024-definition/],
  ["overlong ID", definitions(`<w:style w:styleId="${"x".repeat(257)}"/>`), {}, /256 characters/],
  ["wrong namespace", '<w:styles xmlns:w="urn:spoof"/>', {}, /wrong root namespace/],
  ["DTD", '<!DOCTYPE w:styles [<!ENTITY leak "bad">]>' + definitions(""), {}, /DTD/],
  ["external style URI", definitions(""), { target: "https://example.invalid/styles.xml" }, /internal package/],
  ["protocol-relative style URI", definitions(""), { target: "//example.invalid/styles.xml" }, /internal package/],
  ["encoded traversal", definitions(""), { target: "..%2fstyles.xml" }, /unsafe part path/],
  ["query in style URI", definitions(""), { target: "styles.xml?secret" }, /internal package/],
  ["missing target", definitions(""), { target: "missing.xml" }, /styles part is missing/],
  ["duplicate style relationships", definitions(""), { relations: `<Relationships xmlns="${packageRels}"><Relationship Id="s1" Type="${styleType}" Target="styles.xml"/><Relationship Id="s2" Type="${styleType}" Target="styles.xml"/></Relationships>` }, /multiple styles/],
]) test(`unsafe or ambiguous outline metadata fails explicitly: ${name}`, async () => {
  await assert.rejects(convert(paragraph("", "Safe text"), styles, options), message);
});
test("paragraph properties are bounded, ordered and never executable attributes", async () => {
  for (const [body, message] of [
    [paragraph('<w:outlineLvl w:val="10"/>', "bad"), /0 through9/],
    [paragraph('<w:outlineLvl w:val="1"/><w:outlineLvl w:val="2"/>', "bad"), /repeats/],
    ['<w:p><w:r><w:t>text</w:t></w:r><w:pPr/></w:p>', /before content/],
    ['<w:p><w:pPr/><w:pPr/></w:p>', /once before content/],
  ]) await assert.rejects(convert(body), message);
  const id = 'x&quot; onmouseover=&quot;evil';
  const r = await convert(paragraph(`<w:pStyle w:val="${id}"/>`, "Escaped &lt;script&gt;"),
    definitions(`<w:style w:styleId="${id}"><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>`));
  assert.match(r.html, /<h2 style="white-space:pre-wrap">Escaped &lt;script&gt;<\/h2>/);
  assert.doesNotMatch(r.html, /onmouseover|evil|<script>/);
});
