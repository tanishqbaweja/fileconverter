import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";
import { preDocxParagraphAlignment } from "../scripts/lib/reviewed-docx-paragraph-alignment.mjs";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const office = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const rel = (kind, where) => `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${office + kind}" Target="${where}"/></Relationships>`;
const element = (name, body) => `<w:${name} xmlns:w="${WORD}">${body}</w:${name}>`;
const jc = (val) => `<w:jc w:val="${val}"/>`;
const pStyle = (id) => `<w:pStyle w:val="${id}"/>`;
const run = (text) => `<w:r><w:t>${text}</w:t></w:r>`;
const paragraph = (text, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${run(text)}</w:p>`;
const style = (id, props, { base, isDefault, type = "paragraph" } = {}) =>
  `<w:style w:type="${type}" w:styleId="${id}"${isDefault ? ' w:default="1"' : ""}>${base ? `<w:basedOn w:val="${base}"/>` : ""}<w:pPr>${props}</w:pPr></w:style>`;
const defaults = (props) => `<w:docDefaults><w:pPrDefault><w:pPr>${props}</w:pPr></w:pPrDefault></w:docDefaults>`;
const bundle = await build({ entryPoints: ["workers/docx-html-conversion.ts"], bundle: true, write: false, format: "esm", platform: "browser" });
const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));

async function convert(body, styles = "") {
  const parts = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": rel("officeDocument", "word/document.xml"),
    "word/document.xml": element("document", `<w:body>${body}</w:body>`),
  };
  if (styles) {
    parts["word/_rels/document.xml.rels"] = rel("styles", "styles.xml");
    parts["word/styles.xml"] = element("styles", styles);
  }
  const file = new File([zipSync(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, strToU8(v)])))], "alignment.docx");
  let pending = 0, maximumWrite = 0, total = 0;
  const chunks = [], warnings = [];
  await runDocxToHtml({ file, metrics: {}, assertActive() {}, progress() {}, warn: w => warnings.push(w),
    async write(chunk) {
      assert.equal(++pending, 1);
      maximumWrite = Math.max(maximumWrite, chunk.length); total += chunk.length;
      assert.ok(total <= 524288, "Only a small fixture may be captured in this test.");
      chunks.push(Buffer.from(chunk));
      await new Promise(resolve => setImmediate(resolve));
      pending--;
    },
  });
  return { html: Buffer.concat(chunks).toString("utf8").split("<body>\n")[1].split("</body>")[0], warnings, maximumWrite };
}

test("DOCX paragraph alignment cascades from document, default/named and inherited styles to direct properties", async () => {
  const styles = defaults(jc("both")) + style("Default", jc("right"), { isDefault: true }) + style("Base", jc("center")) +
    style("Child", "", { base: "Base" }) + style("NoAlignment", "") + style("WrongType", jc("left"), { type: "character" });
  const body = paragraph("default") + paragraph("named", pStyle("Child")) + paragraph("document", pStyle("NoAlignment")) +
    paragraph("direct", pStyle("Child") + jc("left")) + paragraph("wrong style", pStyle("WrongType")) + paragraph("missing", pStyle("Unknown"));
  assert.equal((await convert(body, styles)).html,
    '<p style="text-align:right">default</p>\n<p style="text-align:center">named</p>\n<p style="text-align:justify">document</p>\n' +
    '<p style="text-align:left">direct</p>\n<p style="text-align:right">wrong style</p>\n<p style="text-align:right">missing</p>\n');
});

test("logical edges and Transitional aliases follow bidi layout without changing inline text order", async () => {
  const styles = style("RTL", "<w:bidi/>") + style("Edges", jc("start"), { base: "RTL" });
  const over = pStyle("Edges") + '<w:bidi w:val="false"/>';
  const body = paragraph("שלום 123 English", pStyle("Edges")) + paragraph("override", over) +
    paragraph("end", jc("end") + "<w:bidi/>") + paragraph("left alias", jc("left") + "<w:bidi/>") +
    paragraph("right alias", jc("right") + "<w:bidi/>") + paragraph("default edge", "<w:bidi/>");
  assert.equal((await convert(body, styles)).html,
    '<p style="text-align:right">שלום 123 English</p>\n<p style="text-align:left">override</p>\n' +
    '<p style="text-align:left">end</p>\n<p style="text-align:right">left alias</p>\n<p style="text-align:left">right alias</p>\n' +
    '<p style="text-align:right">default edge</p>\n');
  assert.equal((await convert(paragraph("inherited bidi"), defaults("<w:bidi/>"))).html, '<p style="text-align:right">inherited bidi</p>\n');
});

test("headings, nested table paragraphs, empty paragraphs and chunked output keep alignment", async () => {
  const word = "α &amp; 😀 ";
  const contents = word.repeat(16_384);
  const body = paragraph(contents, '<w:outlineLvl w:val="2"/>' + jc("center")) +
    paragraph("ARIA heading", '<w:outlineLvl w:val="6"/>' + jc("both")) +
    `<w:tbl><w:tr><w:tc>${paragraph("cell", jc("right"))}</w:tc></w:tr></w:tbl><w:p><w:pPr>${jc("center")}</w:pPr></w:p>`;
  const out = await convert(body);
  assert.equal(out.maximumWrite, 65_536);
  assert.ok(out.html.startsWith(`<h3 style="white-space:pre-wrap;text-align:center">${contents}</h3>\n`));
  assert.ok(out.html.includes('<p role="heading" aria-level="7" style="text-align:justify">ARIA heading</p>'));
  assert.ok(out.html.includes('<td><p style="text-align:right">cell</p>'));
  assert.ok(out.html.endsWith('<p style="text-align:center"></p>\n'));
});

test("special alignment modes retain text without copying values to CSS and warn only if used", async () => {
  const styles = defaults(jc("center")) + style("Unused", jc("mediumKashida"));
  const body = paragraph("distribute", jc("distribute")) + paragraph("list tab", "<w:bidi/>" + jc("numTab")) + paragraph("plain");
  const result = await convert(body, styles);
  assert.equal(result.html, '<p>distribute</p>\n<p style="text-align:right">list tab</p>\n<p style="text-align:center">plain</p>\n');
  assert.equal(result.warnings.filter(w => w.includes("have no equivalent")).length, 1);
  assert.equal((await convert(paragraph("no special mode"), styles)).warnings.filter(w => w.includes("have no equivalent")).length, 0);
});

test("foreign/revision markup cannot set alignment; duplicates and non-enumerated values fail safely", async () => {
  const valid = paragraph("safe", '<x:jc xmlns:x="urn:foreign" w:val="both"/><w:pPrChange><w:pPr><w:bidi/><w:jc w:val="center"/></w:pPr></w:pPrChange>');
  assert.equal((await convert(valid)).html, "<p>safe</p>\n");
  for (const props of [jc("left") + jc("center"), jc("right; background:url(https://example.invalid)"), "<w:jc/>",
    '<w:bidi w:val="maybe"/>', '<w:bidi/><w:bidi w:val="off"/>']) {
    await assert.rejects(convert(paragraph("bad", props)), /DOCX paragraph.*(alignment|direction)/);
  }
  await assert.rejects(convert(paragraph("bad"), defaults(jc("left") + jc("right"))), /repeats its alignment/);
  await assert.rejects(convert(paragraph("bad"), style("A", '<w:bidi/><w:bidi/>')), /repeats its layout direction/);
});

test("historical color parser/style bytes can be verified only for exact reviewed current files", async () => {
  for (const path of ["workers/docx-html-conversion.ts", "workers/docx-outline.ts"]) {
    const current = await readFile(path), previous = preDocxParagraphAlignment(path, current);
    assert.notDeepEqual(previous, current);
    assert.equal(preDocxParagraphAlignment(path, previous), previous);
    const unknown = Buffer.concat([current, Buffer.from("\n// unknown edit\n")]);
    assert.equal(preDocxParagraphAlignment(path, unknown), unknown);
  }
});
