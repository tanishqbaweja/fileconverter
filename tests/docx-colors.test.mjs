import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const types = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const rel = (type, target, extra = "", id = type) => `<Relationship Id="${id}" Type="${types + type}" Target="${target}" ${extra}/>`;
const wrap = (tag, body) => `<w:${tag} xmlns:w="${WORD}">${body}</w:${tag}>`;
const run = (text, props = "") => `<w:r><w:rPr>${props}</w:rPr><w:t>${text}</w:t></w:r>`;
const color = (attrs) => `<w:color ${attrs}/>`;
const paragraph = (body, id = "") => `<w:p>${id ? `<w:pPr><w:pStyle w:val="${id}"/></w:pPr>` : ""}${body}</w:p>`;
const style = (name, type, props, parent = "", extra = "") => `<w:style w:styleId="${name}" w:type="${type}" ${extra}>${parent ? `<w:basedOn w:val="${parent}"/>` : ""}<w:rPr>${props}</w:rPr></w:style>`;
const palette = body => `<a:theme xmlns:a="${DRAWING}"><a:themeElements><a:clrScheme name="Example">${body}</a:clrScheme></a:themeElements></a:theme>`;
const defaultPalette = palette('<a:dk1><a:sysClr val="windowText" lastClr="121212"/></a:dk1><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2>');
const bundle = await build({ entryPoints: ["workers/docx-html-conversion.ts"], bundle: true, write: false, format: "esm", platform: "browser" });
const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));

async function convert(body, { styles = "", theme, settings, extra = "", themeTarget = "../palette.xml" } = {}) {
  const files = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": `<Relationships xmlns="${RELS}">${rel("officeDocument", "word/document.xml")}</Relationships>`,
    "word/_rels/document.xml.rels": `<Relationships xmlns="${RELS}">${rel("styles", "styles.xml")}${theme !== undefined ? rel("theme", themeTarget) : ""}${settings !== undefined ? rel("settings", "settings.xml") : ""}${extra}</Relationships>`,
    "word/document.xml": wrap("document", `<w:body>${body}</w:body>`),
    "word/styles.xml": wrap("styles", styles),
  };
  if (theme !== undefined) files["palette.xml"] = theme;
  if (settings !== undefined) files["word/settings.xml"] = wrap("settings", settings);
  const file = new File([zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 0 })], "colors.docx");
  const chunks = [], warnings = [];
  let queued = 0, output = 0, pending = 0;
  await runDocxToHtml({ file, metrics: { inputBytes: 0 }, warn: w => warnings.push(w), assertActive() {}, progress() {},
    async write(chunk) {
      assert.equal(++pending, 1); queued = Math.max(queued, chunk.length); output += chunk.length;
      assert.ok(output <= 262144); chunks.push(Buffer.from(chunk));
      await new Promise(resolve => setImmediate(resolve)); pending--;
    } });
  return { body: Buffer.concat(chunks).toString().split("<body>\n")[1].split("</body>")[0], warnings, queued };
}

test("run RGB follows defaults, paragraph and character inheritance, direct overrides and automatic reset", async () => {
  const styles = '<w:docDefaults><w:rPrDefault><w:rPr><w:color w:val="abcDEF"/></w:rPr></w:rPrDefault></w:docDefaults>' +
    style("P", "paragraph", color('w:val="010203"'), "", 'w:default="true"') +
    style("P2", "paragraph", "", "P") + style("C", "character", color('w:val="405060"') + "<w:b/>") +
    style("C2", "character", "", "C") + style("Plain", "paragraph", "");
  const cs = '<w:rStyle w:val="C2"/>';
  const r = await convert(paragraph(run("default paragraph")) + paragraph(run("default run"), "Plain") +
    paragraph(run("base") + run("character", cs) + run("direct", cs + color('w:val="FFFFFF"')) +
      run("automatic", color('w:val="auto"')), "P2") + paragraph(run("fallback", '<w:rStyle w:val="P"/>'), "missing"), { styles });
  assert.equal(r.body, '<p><span style="color:#010203">default paragraph</span></p>\n' +
    '<p><span style="color:#abcdef">default run</span></p>\n' +
    '<p><span style="color:#010203">base</span><span style="color:#405060"><strong>character</strong></span>' +
    '<span style="color:#ffffff"><strong>direct</strong></span><span style="color:CanvasText">automatic</span></p>\n' +
    '<p><span style="color:#010203">fallback</span></p>\n');
});

test("package mappings resolve RGB, system lastClr and full-precision HSL shade/tint with final byte rounding", async () => {
  const r = await convert(paragraph(run("mapped", color('w:val="FFFFFF" w:themeColor="text1"')) +
    run("system", color('w:themeColor="dark1"')) + run("shade", color('w:themeColor="accent2" w:themeShade="BF"')) +
    run("tint", color('w:themeColor="accent1" w:themeShade="00" w:themeTint="99"'))),
  { theme: defaultPalette, settings: '<w:clrSchemeMapping w:t1="accent2"/>' });
  assert.equal(r.body, '<p><span style="color:#c0504d">mapped</span><span style="color:#121212">system</span>' +
    '<span style="color:#953735">shade</span><span style="color:#95b3d7">tint</span></p>\n');
});

test("theme inheritance and direct override are atomic; unresolved theme falls back and warns once without leakage", async () => {
  const styles = style("P", "paragraph", color('w:themeColor="accent1" w:themeShade="BF"')) +
    style("C", "character", color('w:val="AB0042" w:themeColor="accent6"'));
  const r = await convert(paragraph(run("base") + run("override", color('w:themeColor="accent1"')) +
    run("saved", '<w:rStyle w:val="C"/>') + run("unresolved", color('w:themeColor="unknown-user-value"')), "P"), { styles, theme: defaultPalette });
  assert.match(r.body, /color:#376092">base/); assert.match(r.body, /color:#4f81bd">override/);
  assert.match(r.body, /color:#ab0042">saved/); assert.match(r.body, /color:CanvasText">unresolved/);
  assert.equal(r.warnings.filter(w => w.includes("could not be resolved")).length, 1);
  assert.ok(r.warnings.every(w => !w.includes("unknown-user-value")));
  assert.equal((await convert(paragraph(run("Plain")))).body, "<p>Plain</p>\n");
});

test("ignored markup cannot inject color; malformed values and ambiguous definitions fail closed", async () => {
  const r = await convert(paragraph(run("safe", '<x:color xmlns:x="urn:other" w:val="FF0000"/><w:rPrChange><w:rPr><w:color w:val="FF0000"/></w:rPr></w:rPrChange>')));
  assert.equal(r.body, "<p>safe</p>\n");
  for (const props of [color('w:val="red;background:url(example)"'), color('w:val="123456" w:themeShade="xyz"'), color('w:val="123456"') + color('w:val="654321"')])
    await assert.rejects(convert(paragraph(run("bad", props))), /color|tint\/shade/);
  await assert.rejects(convert(paragraph(run("x")), { styles: style("P", "paragraph", color('w:val="123456"') + color('w:val="654321"')) }), /repeats a run color/);
});

test("bounded metadata rejects external, absent, repeated or excessive theme parts; unsupported slot transforms use saved RGB", async () => {
  const body = paragraph(run("x", color('w:themeColor="accent1" w:val="123456"')));
  for (const extra of [rel("theme", "https://example.invalid/color.xml", 'TargetMode="External"'), rel("theme", "missing.xml")])
    await assert.rejects(convert(body, { extra }), /internal package|missing/);
  await assert.rejects(convert(body, { theme: defaultPalette, extra: rel("theme", "other.xml", "", "other") }), /ambiguous multiple theme/);
  await assert.rejects(convert(body, { theme: palette(" ".repeat(1048576)) }), /metadata exceeds/);
  const transformed = palette('<a:accent1><a:srgbClr val="000000"><a:lumMod val="20000"/></a:srgbClr></a:accent1>');
  assert.match((await convert(body, { theme: transformed })).body, /color:#123456">x/);
  await assert.rejects(convert(body, { theme: palette('<a:accent1/><a:accent1/>') }), /repeats a color slot/);
});

test("colored runs retain one awaited write and 64 KiB cap across multiple output chunks", async () => {
  const body = paragraph(run("Color 🌈", color('w:val="bBeE99"'))).repeat(3000);
  const r = await convert(body);
  assert.equal(r.queued, 65536);
  assert.equal(r.body, '<p><span style="color:#bbee99">Color 🌈</span></p>\n'.repeat(3000));
});
