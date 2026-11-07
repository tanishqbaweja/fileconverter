import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";
import { preparePptxTokenDeliverySources, tokenDeliveryPlugin } from "../scripts/lib/pptx-token-delivery-overlay.mjs";

const [docx, candidate] = await Promise.all(["workers/docx-conversion.ts", "workers/pptx-namespace-candidate.ts"].map(file => readFile(file)));
const implementations = await Promise.all(["original", "iterator", "callback"].map(async mode => {
  const sources = mode === "original" ? null : preparePptxTokenDeliverySources(docx, candidate, mode);
  const bundled = await build({
    entryPoints: [sources ? "workers/pptx-conversion.ts" : "workers/pptx-namespace-candidate.ts"], bundle: true,
    format: "esm", write: false, platform: "browser",
    plugins: sources ? [tokenDeliveryPlugin({ root: process.cwd(), sources })] : [],
  });
  return (await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64"))).runPptxToText;
}));

test("the unqualified PPTX candidate is not imported by the public worker", async () => {
  const worker = await readFile("workers/conversion.worker.ts", "utf8");
  assert.match(worker, /from "\.\/pptx-conversion"/);
  assert.doesNotMatch(worker, /pptx-namespace-candidate/);
});
const schema = "http://schemas.openxmlformats.org";
const p = `${schema}/presentationml/2006/main`;
const a = `${schema}/drawingml/2006/main`;
const r = `${schema}/officeDocument/2006/relationships`;
const opc = `${schema}/package/2006/relationships`;
const types = `${schema}/package/2006/content-types`;
const override = '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>';
const relation = (id, type, target) => `<Relationship Id="${id}" Type="${r}/${type}" Target="${target}"/>`;
const relations = body => `<Relationships xmlns="${opc}">${body}</Relationships>`;
const presentation = body => `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst>${body}</p:sldIdLst></p:presentation>`;
const slide = (body, attrs = "") => `<p:sld xmlns:p="${p}" xmlns:a="${a}" ${attrs}><p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
const paragraph = text => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;

async function convertWith(runPptxToText, overrides = {}) {
  const parts = {
    "[Content_Types].xml": `<Types xmlns="${types}">${override}</Types>`,
    "_rels/.rels": relations(relation("office", "officeDocument", "ppt/presentation.xml")),
    "ppt/presentation.xml": presentation('<p:sldId id="256" r:id="one"/>'),
    "ppt/_rels/presentation.xml.rels": relations(relation("one", "slide", "slides/one.xml") + relation("two", "slide", "slides/two.xml")),
    "ppt/slides/one.xml": slide(paragraph("first")),
    "ppt/slides/two.xml": slide(paragraph("second")),
    ...overrides,
  };
  assert.ok(Object.values(parts).reduce((sum, value) => sum + value.length, 0) < 2 * 1024 * 1024);
  const file = new File([zipSync(Object.fromEntries(
    Object.entries(parts).map(([name, value]) => [name, strToU8(value)]),
  ), { level: 0 })], "unit.pptx");
  const output = [], warnings = [];
  let pending = 0;
  await runPptxToText({
    file, metrics: {}, warn: value => warnings.push(value), progress() {}, assertActive() {},
    async write(bytes) {
      assert.equal(++pending, 1);
      assert.ok(bytes.length <= 256 * 1024);
      await new Promise(resolve => setImmediate(resolve));
      output.push(Buffer.from(bytes));
      pending--;
    },
  });
  return { text: Buffer.concat(output).toString("utf8"), warnings: warnings.join(" ") };
}
async function convert(overrides = {}) {
  const expected = await convertWith(implementations[0], overrides);
  for (const run of implementations.slice(1)) assert.deepEqual(await convertWith(run, overrides), expected);
  return expected;
}

test("reads scoped DrawingML names and excludes rebound, foreign and extension text", async () => {
  const { text } = await convert({
    "ppt/slides/one.xml": slide(
      `<a:p><a:r><a:t>start</a:t></a:r><a:r xmlns:a="urn:foreign"><a:t>fake</a:t></a:r>` +
      `<d:fld xmlns:d="${a}"><d:t> field</d:t></d:fld><a:br/>` +
      `<r xmlns="${a}"><t>default &amp; 😀</t></r><a:tab/><a:r><a:t>end</a:t></a:r></a:p>` +
      `<a:p xmlns:a="urn:foreign"><a:r><a:t>fake paragraph</a:t></a:r></a:p>` +
      `<a:extLst><a:ext uri="example">${paragraph("extension")}</a:ext></a:extLst>` +
      `<x:private xmlns:x="urn:foreign">${paragraph("foreign wrapper")}</x:private>` +
      "<a:r><a:t>stray run</a:t></a:r><a:p/>",
    ),
  });
  assert.equal(text, "start field\ndefault & 😀\tend\n\n");
});

test("uses declared slide order, scoped relationship aliases and the slide's own visibility", async () => {
  const { text, warnings } = await convert({
    "ppt/presentation.xml": `<presentation xmlns="${p}"><sldIdLst xmlns:ref="${r}"><sldId id="257" ref:id="two"/><sldId id="256" ref:id="one"/></sldIdLst></presentation>`,
    "ppt/slides/one.xml": slide(paragraph("first"), 'xmlns:x="urn:foreign" x:show="0"'),
    "ppt/slides/two.xml": slide(paragraph("second"), 'show="false"')
      .replace(` xmlns:a="${a}"`, "").replace("<a:p>", `<a:p xmlns:a="${a}">`),
  });
  assert.equal(text, "second\n\nfirst\n");
  assert.match(warnings, /1 hidden PPTX slide is included/);
});

test("a foreign show attribute does not mark a slide hidden; legacy declaration is retained", async () => {
  const foreign = await convert({ "ppt/slides/one.xml": slide(paragraph("visible"), 'xmlns:x="urn:foreign" x:show="0"') });
  assert.doesNotMatch(foreign.warnings, /hidden PPTX slide is included/);
  const legacy = await convert({ "ppt/presentation.xml": presentation('<p:sldId id="256" r:id="one" show="0"/>') });
  assert.match(legacy.warnings, /1 hidden PPTX slide is included/);
});

test("streams UTF-8 across writer boundaries with one pending write", async () => {
  const prefix = "x".repeat(256 * 1024 - 1);
  const { text } = await convert({
    "ppt/slides/one.xml": slide(paragraph(prefix + "😀&amp;₹")),
  });
  assert.equal(text, prefix + "😀&₹\n");
});

test("clearing a default namespace cannot leak text or alter later scope", async () => {
  const { text } = await convert({
    "ppt/slides/one.xml": slide(
      `<p xmlns="${a}"><r><t>left</t><t xmlns="">ignored</t><t>right</t></r></p>`,
    ),
  });
  assert.equal(text, "leftright\n");
});

for (const [name, parts, error] of [
  ["foreign content type", { "[Content_Types].xml": `<Types xmlns="${types}">${override.replace("<Override", '<Override xmlns="urn:fake"')}</Types>` }, /do not identify/],
  ["nested content type", { "[Content_Types].xml": `<Types xmlns="${types}"><Wrapper>${override}</Wrapper></Types>` }, /do not identify/],
  ["foreign root relationship", { "_rels/.rels": relations(relation("office", "officeDocument", "ppt/presentation.xml").replace("<Relationship ", '<Relationship xmlns="urn:fake" ')) }, /do not target/],
  ["foreign target attribute", { "ppt/_rels/presentation.xml.rels": relations(relation("one", "slide", "slides/one.xml").replace(" Target=", ' xmlns:x="urn:fake" x:Target=')) }, /incomplete/],
  ["rebound relationship id", { "ppt/presentation.xml": presentation('<p:sldId id="256" xmlns:r="urn:fake" r:id="one"/>') }, /lacks a relationship id/],
  ["foreign slide list", { "ppt/presentation.xml": presentation('<p:sldId id="256" r:id="one"/>').replace("<p:sldIdLst>", '<p:sldIdLst xmlns:p="urn:fake">') }, /declares no slides/],
  ["undeclared attribute prefix", { "ppt/slides/one.xml": slide('<a:p x:attribute="1"/>') }, /undeclared/],
  ["duplicate expanded attributes", { "ppt/slides/one.xml": slide(`<a:p xmlns:d="${a}" d:attr="1" a:attr="2"/>`) }, /repeated expanded/],
  ["illegal reserved prefix binding", { "ppt/slides/one.xml": slide('<a:p xmlns:xml="urn:fake"/>') }, /reserved/],
  ["illegal XMLNS URI", { "ppt/slides/one.xml": slide('<a:p xmlns:q="http://www.w3.org/2000/xmlns/"/>') }, /reserved/],
  ["empty prefixed binding", { "ppt/slides/one.xml": slide('<a:p xmlns:a=""/>') }, /empty namespace/],
  ["invalid QName", { "ppt/slides/one.xml": slide("<a::p/>") }, /qualified name/],
  ["namespace declaration budget", { "ppt/slides/one.xml": slide(`<a:p ${Array.from({ length: 513 }, (_, i) => `xmlns:n${i}="urn:n${i}"`).join(" ")}/>`) }, /namespace declaration.*limit/],
  ["namespace character budget", { "ppt/slides/one.xml": slide(`<a:p xmlns:q="urn:${"x".repeat(65536)}"/>`) }, /namespace declaration.*limit/],
  ["overlong element name", { "ppt/slides/one.xml": slide(`<a:${"x".repeat(1024)}/>`) }, /oversized qualified name/],
  ["invalid visibility", { "ppt/slides/one.xml": slide("", 'show="no"') }, /invalid visibility/],
  ["mismatched closing tags", { "ppt/slides/one.xml": slide("<a:p></a:r>") }, /does not match/],
]) test(`rejects ${name}`, async () => {
  for (const run of implementations) await assert.rejects(convertWith(run, parts), error);
});
