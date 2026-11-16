import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { zipSync, strToU8 } from "fflate";
const built = await build({ stdin: { contents: 'export * from "./workers/docx-numbering.ts";export {readZipDirectory} from "./workers/archive-conversion.ts";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "browser" });
const { readDocxNumberingModel, readZipDirectory, formatDocxListNumber, DOCX_NUMBERING_LIMITS } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].contents).toString("base64"));
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", R = "http://schemas.openxmlformats.org/package/2006/relationships";
const level = (n, body = `<w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${n + 1}."/>`) => `<w:lvl w:ilvl="${n}">${body}</w:lvl>`;
const abstract = (id, body) => `<w:abstractNum w:abstractNumId="${id}">${body}</w:abstractNum>`;
const instance = (id = 1, abstractId = 1, body = "") => `<w:num w:numId="${id}"><w:abstractNumId w:val="${abstractId}"/>${body}</w:num>`;
async function model(body, { target = "numbering.xml", mode, related = true, missing = false, cancel = false } = {}) {
  const part = `<w:numbering xmlns:w="${W}">${body}</w:numbering>`;
  assert.ok(part.length < 2 * 1024 * 1024, "Finite unit metadata, not large-file buffering");
  const parts = { "word/numbering.xml": strToU8(part) };
  if (related) parts["word/_rels/document.xml.rels"] = strToU8(`<Relationships xmlns="${R}"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="${target}"${mode ? ` TargetMode="${mode}"` : ""}/></Relationships>`);
  if (missing) delete parts["word/numbering.xml"];
  const file = new File([zipSync(parts, { level: 0 })], "unit.docx"), metrics = { inputBytes: 0, maxReadChunkBytes: 0 };
  const runtime = { file, metrics, assertActive() { if (cancel) throw new DOMException("Cancelled", "AbortError"); }, progress() {}, warn() {}, async write() { assert.fail("Metadata model must not write converted bytes"); } };
  const result = await readDocxNumberingModel(runtime, new Map((await readZipDirectory(runtime)).map(entry => [entry.name, entry])));
  return { result, metrics };
}
test("real ZIP internal numbering metadata generates sequential labels with bounded reads", async () => {
  const { result, metrics } = await model(abstract(1, level(0)) + instance());
  assert.equal(result.definitionCount, 1); assert.equal(result.instanceCount, 1);
  assert.deepEqual([1,2,3].map(() => result.next({numId:1}).text), ["1.","2.","3."]);
  assert.equal(result.next({numId:0}), undefined); assert.ok(metrics.maxReadChunkBytes <= 262144);
});
test("standard defaults are start zero, decimal, empty label and tab; zero means remove numbering", async () => {
  const {result} = await model(abstract(1, level(0, "")) + instance());
  assert.deepEqual(result.next({numId:1}), {numId:1,level:0,value:0,text:"",suffix:"\t",ordered:true});
  assert.equal(result.next({}), undefined);
});
test("nine-level labels, legal decimal substitution, default restart and never-restart are independent", async () => {
  const defs = level(0,'<w:start w:val="1"/><w:numFmt w:val="upperLetter"/><w:lvlText w:val="%1"/>') +
    level(1,'<w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%1.%2"/>') +
    level(2,'<w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%1.%2.%3"/><w:lvlRestart w:val="0"/><w:isLgl/>');
  const {result} = await model(abstract(1,defs) + instance());
  assert.deepEqual([0,1,2,2,0,1,2].map(level => result.next({numId:1,level}).text), ["A","A.i","1.1.1","1.1.2","B","B.i","2.1.3"]);
});
test("startOverride applies initially and after restart without sharing counters across numId instances", async () => {
  const {result} = await model(abstract(1,level(0)+level(1)) + instance(1,1,'<w:lvlOverride w:ilvl="1"><w:startOverride w:val="7"/></w:lvlOverride>') + instance(2));
  assert.deepEqual([0,1,1,0,1].map(level => result.next({numId:1,level}).text), ["1.","7.","8.","2.","7."]);
  assert.equal(result.next({numId:2}).text,"1.");
});
test("complete level override replaces abstract level, with startOverride taking precedence", async () => {
  const {result} = await model(abstract(1,level(0)) + instance(1,1,`<w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/>${level(0,'<w:start w:val="2"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="(%1)"/><w:suff w:val="space"/>')}</w:lvlOverride>`));
  assert.deepEqual(result.next({numId:1}),{numId:1,level:0,value:3,text:"(III)",suffix:" ",ordered:true});
});
test("paragraph style associations pick the nearest inherited style but direct ilvl takes precedence", async () => {
  const {result} = await model(abstract(1,level(0)+level(1,'<w:start w:val="2"/><w:lvlText w:val="%2)"/><w:pStyle w:val="ListChild"/>'))+instance());
  assert.equal(result.next({numId:1},["Derived","ListChild"]).text,"2)");
  assert.equal(result.next({numId:1,level:0},["ListChild"]).text,"1.");
});
test("Unicode/literal labels are data, future-level placeholders are ignored, and suffix nothing is exact", async () => {
  const {result} = await model(abstract(1,level(0,'<w:start w:val="1"/><w:lvlText w:val="&lt;script&gt;音楽 %1 %2"/><w:suff w:val="nothing"/>')) + instance());
  const next=result.next({numId:1});assert.equal(next.text,"<script>音楽 1 ");assert.equal(next.suffix,"");
});
test("Unicode bullets are not substituted or mistaken for numeric markers", async () => {
  const {result} = await model(abstract(1,level(0,'<w:numFmt w:val="bullet"/><w:lvlText w:val="•"/>'))+instance());
  assert.equal(result.next({numId:1}).ordered,false);assert.equal(result.next({numId:1}).text,"•");
});
test("namespace aliases work while foreign definitions/properties cannot spoof Word numbering", async () => {
  const valid = abstract(1,level(0)).replaceAll("w:","x:").replace('<x:abstractNum ',`<x:abstractNum xmlns:x="${W}" `);
  const {result}=await model(valid+`<f:abstractNum xmlns:f="urn:foreign" w:abstractNumId="2"/>`+instance());
  assert.equal(result.definitionCount,1);assert.equal(result.next({numId:1}).text,"1.");
});
test("all optional metadata remains unreferenced without its relationship; no guessed filename binding",async()=>{
  const {result}=await model(abstract(1,level(0))+instance(),{related:false});
  assert.equal(result.definitionCount,0);assert.throws(()=>result.next({numId:1}),/unavailable/);
});
for(const [name,body] of [
  ["duplicate abstract",abstract(1,level(0))+abstract(1,level(0))],
  ["duplicate instance",abstract(1,level(0))+instance()+instance()],
  ["duplicate level",abstract(1,level(0)+level(0))],
  ["level outside range",abstract(1,level(9))],
  ["duplicate scalar",abstract(1,level(0,'<w:start w:val="1"/><w:start w:val="2"/>'))],
  ["invalid bool",abstract(1,level(0,'<w:isLgl w:val="yes"/>'))],
  ["oversized label",abstract(1,level(0,`<w:lvlText w:val="${"x".repeat(257)}"/>`))],
  ["mismatched override",instance(1,1,`<w:lvlOverride w:ilvl="0">${level(1)}</w:lvlOverride>`)],
  ["instance limit",Array.from({length:1025},(_,i)=>instance(i+1)).join("")],
  ["definition limit",Array.from({length:1025},(_,i)=>abstract(i,"")).join("")],
  ["metadata bytes",`<!--${"x".repeat(1048576)}-->`],
])test(`numbering metadata rejects ${name}`,async()=>{await assert.rejects(model(body));});
for(const target of ["https://example.invalid/numbering.xml","//example.invalid/numbering.xml","numbering.xml?secret","numbering.xml#fragment","%5cnumbering.xml","%00numbering.xml"])
  test(`numbering relationship rejects unsafe internal binding ${target}`,async()=>{await assert.rejects(model("",{target}));});
test("external and missing parts, cancellation and unknown referenced formats fail explicitly",async()=>{
  await assert.rejects(model("",{mode:"External"}));await assert.rejects(model("",{missing:true}));await assert.rejects(model("",{cancel:true}),{name:"AbortError"});
  const {result}=await model(abstract(1,level(0,'<w:numFmt w:val="chineseLegalSimplified"/><w:lvlText w:val="%1"/>'))+instance());
  assert.throws(()=>result.next({numId:1}),/not supported/);
  for(const unsupported of [abstract(1,'<w:numStyleLink w:val="Linked"/>'+level(0)),
    abstract(1,level(0,'<w:lvlPicBulletId w:val="2"/>')),
    abstract(1,level(0,'<w:legacy w:legacy="1"/>'))]){
    const {result:blocked}=await model(unsupported+instance());assert.throws(()=>blocked.next({numId:1}),/cannot preserve/);
  }
  const {result:bounded}=await model(abstract(1,level(0,'<w:start w:val="2147483647"/><w:lvlText w:val="%1"/>'))+instance());
  assert.equal(bounded.next({numId:1}).text,"2147483647");assert.throws(()=>bounded.next({numId:1}),/bounded integer range/);
  const {result:nine}=await model(abstract(1,Array.from({length:9},(_,i)=>level(i)).join(""))+instance());
  assert.deepEqual(Array.from({length:9},(_,level)=>nine.next({numId:1,level}).text),Array(9).fill("1."));
});
test("formatting follows Word repeated-letter sequence, never unbounded Excel-like or Roman growth",()=>{
  assert.deepEqual([1,26,27,28,52,53].map(n=>formatDocxListNumber(n,"upperLetter")),["A","Z","AA","BB","ZZ","AAA"]);
  assert.equal(formatDocxListNumber(9,"decimalZero"),"09");assert.equal(formatDocxListNumber(1999,"lowerRoman"),"mcmxcix");
  for(const [value,format] of [[0,"upperLetter"],[6657,"lowerLetter"],[4000,"upperRoman"],[2147483648,"decimal"],[-1,"decimal"],[NaN,"decimal"]])assert.throws(()=>formatDocxListNumber(value,format));
  assert.equal(DOCX_NUMBERING_LIMITS.instances,1024);
});
