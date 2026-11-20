import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { deriveDocxHyperlinkScalingSeries,renderDocxHyperlinkScalingSeries } from "./lib/docx-hyperlink-scaling-series.mjs";
assert.equal(process.argv.length,4);
const sha=b=>createHash("sha256").update(b).digest("hex"),reports=[],journals=[],references=[];
for(const file of process.argv.slice(2)){
  assert.match(file,/^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-docx-html-qualification\.json$/);
  const bytes=await readFile(file),r=JSON.parse(bytes);assert.match(r.nativeArchive.file,/^evidence\/[a-zA-Z0-9.-]+\.json\.gz$/);
  const packed=await readFile(r.nativeArchive.file);assert.equal(sha(packed),r.nativeArchive.sha256);
  const raw=gunzipSync(packed,{maxOutputLength:128*1048576});assert.equal(sha(raw),r.nativeArchive.decodedSha256);
  reports.push(r);journals.push(JSON.parse(raw));references.push({file,sha256:sha(bytes),nativeArchive:r.nativeArchive});
}
const series=deriveDocxHyperlinkScalingSeries(reports,journals),rendered=renderDocxHyperlinkScalingSeries(series);
series.references=references;series.generatedAt=new Date().toISOString();
const base=`evidence/${new Date().toISOString().replaceAll(/[:.]/g,"-")}-docx-hyperlink-scaling-series`;
for(const [suffix,data]of Object.entries({json:JSON.stringify(series,null,2)+"\n",...rendered}))await writeFile(base+"."+suffix,data,{flag:"wx"});
console.log(JSON.stringify({file:base+".json",runs:series.rows.length,peak:series.peakCompleteControlIncrementalPrivateMiB}));
