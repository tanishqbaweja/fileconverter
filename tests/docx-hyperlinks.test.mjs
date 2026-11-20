import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { zipSync, strToU8 } from "fflate";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { preDocxHyperlinks } from "../scripts/lib/reviewed-docx-hyperlinks.mjs";
const compiled = await build({ entryPoints: ["workers/docx-html-conversion.ts", "workers/docx-hyperlinks.ts"], outdir: "unused", bundle: true, format: "esm", write: false, platform: "browser" });
const load = name => import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles.find(f => f.path.endsWith(name)).contents).toString("base64"));
const { runDocxToHtml } = await load("docx-html-conversion.js"), { safeDocxHyperlinkTarget: safe, docxBookmarkId } = await load("docx-hyperlinks.js");
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", P = "http://schemas.openxmlformats.org/package/2006/relationships";
const relation = (id, target, more = 'TargetMode="External"', type = R + "/hyperlink") => `<Relationship Id="${id}" Type="${type}" Target="${target}" ${more}/>`;
const run = text => `<w:r><w:t>${text}</w:t></w:r>`;
const link = (text, attrs = 'r:id="link"') => `<w:hyperlink ${attrs}>${run(text)}</w:hyperlink>`;
async function convert(body, relationships = relation("link", "https://example.invalid/a?x=1&amp;y=2#part"), { failWrite = false, cancelAfter = Infinity } = {}) {
  const parts = { "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": `<Relationships xmlns="${P}"><Relationship Id="main" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`,
    "word/_rels/document.xml.rels": `<Relationships xmlns="${P}">${relationships}</Relationships>` };
  const file = new File([zipSync(Object.fromEntries(Object.entries(parts).map(([k,v]) => [k,strToU8(v)])), { level: 0 })], "links.docx");
  assert.ok(file.size < 2 * 1048576, "Finite unit fixture, not scaling evidence");
  const chunks = [], warnings = []; let total = 0, pending = 0, peak = 0, maxWrite = 0;
  await runDocxToHtml({ file, metrics: {}, warn: w => warnings.push(w), progress() {},
    assertActive() { if (total >= cancelAfter) throw new DOMException("Cancelled", "AbortError"); },
    async write(b) { if (failWrite) throw new DOMException("Write failed", "QuotaExceededError"); pending++; peak = Math.max(peak,pending); maxWrite = Math.max(maxWrite,b.length); total += b.length;
      assert.ok(total < 3 * 1048576); chunks.push(Buffer.from(b)); await new Promise(resolve => setImmediate(resolve)); pending--; },
    async patch() { assert.fail("No span patch expected"); } });
  return { html: Buffer.concat(chunks).toString(), warnings, peak, maxWrite };
}
test("safe navigation URLs retain exact spelling; active/file/relative/credential/control/oversize targets stay inactive", () => {
  for (const url of ["https://example.invalid/path?q=a&x=b#part", "HTTP://example.invalid/", "mailto:person@example.invalid?subject=Hello%20there"]) assert.equal(safe(url), url);
  for (const url of [undefined, "", "javascript:alert(1)", "data:text/html,x", "file:///C:/secret", "//example.invalid", "/relative", "https:example.invalid", "https://user:pass@example.invalid", "https://example.invalid/\n", "https://example.invalid/\\x", "mailto:person@example.invalid?body=%0d%0aBcc:other", "https://example.invalid/" + "x".repeat(2048)]) assert.equal(safe(url),null,url);
});
test("relationship links span multiple styled runs with escaped URL/title and no frame, ping or referrer", async () => {
  const r = await convert(`<w:p>${run("Before ")}<w:hyperlink r:id="link" w:anchor="ignored" w:tooltip="&quot;&gt;&lt;script&gt;&amp;" w:tgtFrame="evil">${run("one &amp; ")}<w:r><w:rPr><w:b/></w:rPr><w:t>two</w:t></w:r></w:hyperlink>${run(" after")}</w:p>`);
  assert.ok(r.html.includes('<a href="https://example.invalid/a?x=1&amp;y=2#part" rel="noreferrer noopener" referrerpolicy="no-referrer" title="&quot;&gt;&lt;script&gt;&amp;">one &amp; <strong>two</strong></a> after'));
  assert.doesNotMatch(r.html, /<script|target=|ping=|href="#docx/); assert.equal(r.peak,1);
});
test("unsafe/relative/internal-part targets keep display text inactive with only one content-free warning", async () => {
  const rels = relation("x", "javascript:alert(1)") + relation("y", "../secret", "") + relation("z", "https://example.invalid/", 'TargetMode="Internal"');
  const r = await convert(`<w:p>${link("x",'r:id="x"')}${link("y",'r:id="y"')}${link("z",'r:id="z"')}</w:p>`,rels);
  assert.equal((r.html.match(/data-docx-link-disabled/g)??[]).length,3); assert.doesNotMatch(r.html, /href=|javascript:|secret/);
  assert.equal(r.warnings.filter(w=>w.startsWith("Unsafe or unsupported")).length,1);
});
test("forward/local bookmarks use stable collision-free IDs, preserve empty links and detect missing targets", async () => {
  const name = "音楽 &amp; space", encoded = docxBookmarkId("音楽 & space");
  const r = await convert(`<w:p>${link("forward",`w:anchor="${name}"`)}<w:hyperlink/>${link("missing",'w:anchor="missing"')}</w:p><w:p><w:bookmarkStart w:id="0" w:name="${name}"/>${run("destination")}<w:bookmarkEnd w:id="0"/></w:p>`);
  assert.ok(r.html.includes(`href="#${encoded}"`)); assert.ok(r.html.includes(`<span id="${encoded}"></span>destination`));
  assert.ok(r.html.includes('href="#"')); assert.ok(r.warnings.some(w=>w.includes("absent or excluded bookmarks")));
  assert.notEqual(docxBookmarkId("a b"),docxBookmarkId("a%20b"));
});
test("namespace aliases are resolved but foreign wrappers and deleted text cannot inject links/bookmarks", async () => {
  const r = await convert(`<w:p><w:hyperlink xmlns:x="${R}" x:id="link">${run("alias")}</w:hyperlink><w:del>${link("deleted")}<w:bookmarkStart w:name="removed"/></w:del><evil:hyperlink xmlns:evil="urn:fake">${run("foreign")}</evil:hyperlink></w:p>`);
  assert.equal((r.html.match(/<a /g)??[]).length,1); assert.doesNotMatch(r.html,/deleted|foreign|id="docx/);
});
test("bookmarks in runs, empty cells and paragraphs produce valid inline HTML positions", async () => {
  const r = await convert('<w:tbl><w:tr><w:tc><w:bookmarkStart w:id="1" w:name="cell"/><w:p><w:r><w:rPr><w:b/></w:rPr><w:bookmarkStart w:id="2" w:name="run"/><w:t>text</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
  assert.ok(r.html.includes(`<td><span id="${docxBookmarkId("cell")}"></span><p><strong><span id="${docxBookmarkId("run")}"></span>text</strong></p>`));
});
test("missing/wrong-type/duplicate relationship IDs and nested links cannot silently change navigation", async () => {
  await assert.rejects(convert(`<w:p>${link("missing",'r:id="missing"')}</w:p>`), /missing, wrong-type/);
  await assert.rejects(convert(`<w:p>${link("wrong")}</w:p>`,relation("link","image.png","",R+"/image")), /missing, wrong-type/);
  await assert.rejects(convert("<w:p/>",relation("link","https://a.invalid")+relation("link","https://b.invalid")), /repeated/);
  await assert.rejects(convert(`<w:p><w:hyperlink r:id="link">${link("nested")}</w:hyperlink></w:p>`), /nested/);
  await assert.rejects(convert(`<w:hyperlink r:id="link">${run("outside")}</w:hyperlink>`), /non-paragraph/);
  await assert.rejects(convert(`<w:p><w:hyperlink r:id="link"><w:p/></w:hyperlink></w:p>`), /block structure/);
});
test("bounded relationship/bookmark metadata and malformed XML fail explicitly", async () => {
  const count = n => Array.from({length:n},(_,i)=>relation("r"+i,"https://example.invalid/")).join("");
  await assert.rejects(convert("<w:p/>",count(1025)), /1024hyperlink/);
  await assert.rejects(convert("<w:p/>"," ".repeat(1048577)), /1MiB/);
  await assert.rejects(convert('<w:p><w:bookmarkStart w:name="a"/><w:bookmarkStart w:name="a"/></w:p>'), /duplicated/);
  await assert.rejects(convert('<w:p><w:bookmarkStart/></w:p>'), /no name/);
  assert.throws(()=>docxBookmarkId("x".repeat(256)),/255/);
  await assert.rejects(convert('<w:p>'+link("title",'r:id="link" w:tooltip="'+"x".repeat(1025)+'"')+'</w:p>'),/1024characters/);
});
test("repeated links stream in64KiB chunks with strict backpressure and clean state after error/cancel", async () => {
  const body = "<w:p>"+link("x".repeat(4096)).repeat(100)+"</w:p>";
  const r = await convert(body); assert.equal((r.html.match(/<a /g)??[]).length,100); assert.equal(r.maxWrite,65536); assert.equal(r.peak,1);
  await assert.rejects(convert(body,undefined,{cancelAfter:65536}),{name:"AbortError"});
  await assert.rejects(convert(body,undefined,{failWrite:true}),{name:"QuotaExceededError"});
  assert.ok((await convert(`<w:p>${link("recovery")}</w:p>`)).html.includes(">recovery</a>"));
});
test("historical adapters bind exact full pre/post sources without certifying changed hyperlinks or accepting unknown edits", async () => {
  const sha = b => createHash("sha256").update(b).digest("hex");
  for (const [file, pin] of [["lib/capability-registry.ts","3be48c5f6b0fcbd49233d1b84eb9bceca38620468005f90e27cda963141b0340"],
    ["workers/docx-html-conversion.ts","1178dbe546b7ec55a099652c15f19269d7ab058a42eee5e8b8be6e57b1d50413"]]) {
    const current = await readFile(file), before = preDocxHyperlinks(file,current);
    assert.notDeepEqual(before,current); assert.equal(sha(before),pin); assert.equal(preDocxHyperlinks(file,before),before);
    const unknown = Buffer.concat([current,Buffer.from("\n// unrelated\n")]); assert.equal(preDocxHyperlinks(file,unknown),unknown);
  }
});
test("total relationship, distinct bookmark names and unresolved-reference counts have fixed caps independent of document length", async () => {
  const others = Array.from({length:4097},(_,i)=>relation("r"+i,"picture.png","",R+"/image")).join("");
  await assert.rejects(convert("<w:p/>",others),/4096document relationships/);
  const names = Array.from({length:4097},(_,i)=>`<w:bookmarkStart w:id="${i}" w:name="b${i}"/>`).join("");
  await assert.rejects(convert("<w:p>"+names+"</w:p>"),/exceed4096entries/);
  const references = Array.from({length:4097},(_,i)=>`<w:hyperlink w:anchor="b${i}"/>`).join("");
  await assert.rejects(convert("<w:p>"+references+"</w:p>"),/4096distinct bookmark link references/);
});
