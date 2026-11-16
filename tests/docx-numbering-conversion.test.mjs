import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { zipSync, strToU8 } from "fflate";
const built = await build({ entryPoints: ["workers/docx-html-conversion.ts"], bundle: true, write: false, format: "esm", platform: "browser" });
const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].contents).toString("base64"));
const W="http://schemas.openxmlformats.org/wordprocessingml/2006/main",R="http://schemas.openxmlformats.org/package/2006/relationships";
const level=(index,format="decimal",text=`%${index+1}.`,more="")=>`<w:lvl w:ilvl="${index}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/>${more}</w:lvl>`;
const definitions=level(0)+level(1,"lowerLetter","%1.%2)")+level(2,"bullet","•");
const numbering=(levels=definitions)=>`<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="1">${levels}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="7"/></w:lvlOverride></w:num></w:numbering>`;
const paragraph=(text,id=1,index=0,style="")=>`<w:p><w:pPr>${style?`<w:pStyle w:val="${style}"/>`:""}${id===undefined?"":`<w:numPr><w:numId w:val="${id}"/>${index===undefined?"":`<w:ilvl w:val="${index}"/>`}</w:numPr>`}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
async function convert(body,{styles,numberingXml=numbering(),failWrite=false,cancelAfter=Infinity}={}){
  const rels=`<Relationships xmlns="${R}"><Relationship Id="num" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${styles?'<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>':""}</Relationships>`;
  const parts={"[Content_Types].xml":strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),"_rels/.rels":strToU8(`<Relationships xmlns="${R}"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),"word/document.xml":strToU8(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`),"word/_rels/document.xml.rels":strToU8(rels),"word/numbering.xml":strToU8(numberingXml)};
  if(styles)parts["word/styles.xml"]=strToU8(styles);
  const file=new File([zipSync(parts,{level:0})],"numbering.docx");assert.ok(file.size<3*1024*1024,"Finite unit fixture only");
  const metrics={inputBytes:0,maxReadChunkBytes:0},chunks=[],warnings=[];let total=0,active=0,peak=0,maxWrite=0;
  await runDocxToHtml({file,metrics,warn:w=>warnings.push(w),progress(){},assertActive(){if(total>=cancelAfter)throw new DOMException("Cancelled","AbortError");},
    async write(bytes){if(failWrite)throw new DOMException("Injected write failure","QuotaExceededError");active++;peak=Math.max(peak,active);maxWrite=Math.max(maxWrite,bytes.length);total+=bytes.length;assert.ok(total<4*1024*1024);chunks.push(Buffer.from(bytes));await new Promise(r=>setImmediate(r));active--;},async patch(){assert.fail("No row span patch in this fixture");}});
  return {html:Buffer.concat(chunks).toString(),metrics,warnings,peak,maxWrite};
}
const markers=html=>[...html.matchAll(/<span class="docx-list-marker" style="white-space:pre-wrap">(.*?)<\/span>/gs)].map(m=>m[1]);
function assertStructure(html){const stack=[];for(const m of html.matchAll(/<(\/?)(ol|ul|li|p|h[1-6]|table|tr|td)\b[^>]*>/g)){const [,close,tag]=m;if(close)assert.equal(stack.pop(),tag);else{if(tag==="li")assert.ok(["ol","ul"].includes(stack.at(-1)));if(["ol","ul"].includes(tag))assert.ok(!stack.length||["li","td"].includes(stack.at(-1)));stack.push(tag);}}assert.deepEqual(stack,[]);}
test("genuine DOCX numbered/bullet lists retain nested HTML structure, continuation and per-instance restart",async()=>{
  const r=await convert(paragraph("one")+paragraph("a",1,1)+paragraph("bullet",1,2)+paragraph("b",1,1)+paragraph("two")+paragraph("plain",0)+paragraph("three")+paragraph("new instance",2));
  assert.deepEqual(markers(r.html),["1.\t","1.a)\t","•\t","1.b)\t","2.\t","3.\t","7.\t"]);assertStructure(r.html);
  assert.ok(r.html.includes('<li value="7"><p>'));assert.ok(r.html.includes('<p>plain</p>'));
  assert.equal(r.peak,1);assert.ok(r.warnings.some(w=>w.includes("Marker fonts")));
});
test("paragraph numbering inherits through real styles, ignores style ilvl, honors abstract association and direct removal",async()=>{
  const styles=`<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="List"><w:pPr><w:numPr><w:numId w:val="1"/><w:ilvl w:val="8"/></w:numPr></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Child"><w:basedOn w:val="List"/></w:style></w:styles>`;
  const document=paragraph("inherited",undefined,undefined,"Child").replace(/<w:numPr>[\s\S]*?<\/w:numPr>/,"")+paragraph("removed",0,0,"Child")+paragraph("direct",1,0,"Child");
  const r=await convert(document,{styles,numberingXml:numbering(level(0)+level(1,"decimal","%1.%2",'<w:pStyle w:val="List"/>'))});
  assert.deepEqual(markers(r.html),["1.1\t","1.\t"]);assert.ok(r.html.includes("<p>removed</p>"));assertStructure(r.html);
});
test("headings keep their semantic level inside list items; labels never execute source markup",async()=>{
  const p=paragraph("text").replace("<w:pPr>",'<w:pPr><w:outlineLvl w:val="1"/>');
  const r=await convert(p,{numberingXml:numbering(level(0,"decimal","&lt;img src=secret&gt; %1"))});
  assert.ok(r.html.includes('<li value="1"><h2'));assert.ok(r.html.includes("&lt;img src=secret&gt; 1\t"));assert.ok(!r.html.includes("<img"));assertStructure(r.html);
});
test("tables close surrounding lists; cell-local list markup cannot leak across nested cells or append tail",async()=>{
  const r=await convert(paragraph("before")+`<w:tbl><w:tr><w:tc>${paragraph("cell")}<w:tbl><w:tr><w:tc>${paragraph("nested")}</w:tc></w:tr></w:tbl>${paragraph("after nested")}</w:tc><w:tc>${paragraph("other cell")}</w:tc></w:tr></w:tbl>`+paragraph("tail"));
  assert.deepEqual(markers(r.html),["1.\t","2.\t","3.\t","4.\t","5.\t","6.\t"]);assertStructure(r.html);
});
test("a list may begin at a deeper level or skip depths without fake paragraph/list items",async()=>{
  const r=await convert(paragraph("first at level2",1,2)+paragraph("at level0")+paragraph("skip to2",1,2));
  assert.equal((r.html.match(/<li\b/g)??[]).length,3);assert.ok(r.html.includes('data-docx-list-level="2"'));assertStructure(r.html);
});
test("streamed list output remains64KiB and backpressured; cancellation/write failure do not retain numbering state",async()=>{
  const body=Array.from({length:1500},(_,i)=>paragraph("item"+i)).join("");const r=await convert(body);
  assert.equal(markers(r.html).length,1500);assert.equal(markers(r.html).at(-1),"1500.\t");assert.equal(r.maxWrite,65536);assert.equal(r.peak,1);assertStructure(r.html);
  await assert.rejects(convert(body,{cancelAfter:65536}),{name:"AbortError"});await assert.rejects(convert(paragraph("fail"),{failWrite:true}),{name:"QuotaExceededError"});
  assert.deepEqual(markers((await convert(paragraph("new job"))).html),["1.\t"]);
});
test("invalid or ambiguous paragraph references and visible continuation-cell markers are not silently dropped",async()=>{
  for(const body of [paragraph("missing",99),paragraph("bad",1,9),paragraph("duplicate").replace('</w:numPr>','<w:numId w:val="1"/></w:numPr>'),paragraph("twice").replace('</w:pPr>','<w:numPr/></w:pPr>'),`<w:tbl><w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p/></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr>${paragraph("")}</w:tc></w:tr></w:tbl>`])await assert.rejects(convert(body));
});
