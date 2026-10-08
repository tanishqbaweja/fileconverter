// Independent actual proof verification and exact single-file report compaction.
import assert from "node:assert/strict";
import { access,lstat,readFile,realpath,unlink,writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { verifySplitRenderUiGoldens } from "./lib/split-render-ui-golden-evidence.mjs";
const root=path.resolve(import.meta.dirname,".."),proofPath=process.argv[2];assert.equal(process.argv.length,3);
assert.match(proofPath,/^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-split-render-ui-goldens\.json$/);
const result=await verifySplitRenderUiGoldens(root,proofPath),record=result.rawReport;
assert.match(record.rawPath,/^output\/playwright\/[0-9TZ.:-]+-mpeg2-split-pipeline-37739125738-direct-artwork\.json$/);
const rawPath=path.join(root,record.rawPath),identity=await lstat(rawPath,{bigint:true});
assert.ok(identity.isFile()&&!identity.isSymbolicLink());assert.equal(await realpath(rawPath),rawPath);
const raw=await readFile(rawPath);assert.equal(raw.length,record.rawBytes);assert.equal(sha(raw),record.rawSha256);
const compressed=await readFile(path.join(root,record.archive.path));assert.deepEqual(gunzipSync(compressed,{maxOutputLength:2097152}),raw);
const current=await lstat(rawPath,{bigint:true});assert.equal(current.dev,identity.dev);assert.equal(current.ino,identity.ino);assert.equal(current.size,identity.size);
assert.equal(sha(await readFile(rawPath)),record.rawSha256);await unlink(rawPath);await assert.rejects(access(rawPath),{code:"ENOENT"});
const sourcePins={};for(const file of ["scripts/analyze-split-render-ui-goldens.mjs","scripts/lib/split-render-ui-golden-evidence.mjs"])
  sourcePins[file]=sha(await readFile(path.join(root,file)));
const analysis={recordedAt:new Date().toISOString(),status:"independently-verified-and-losslessly-compacted",...result,sourcePins,
  rawRemovedAfterIdentityShaAndLosslessVerification:true,bytesSaved:raw.length-compressed.length,visualReviewPending:true};
const output=proofPath.replace(/-goldens\.json$/,"-golden-validation.json");await writeFile(path.join(root,output),JSON.stringify(analysis,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,status:analysis.status,conversions:analysis.conversions,maximumGeometryDeltaCssPixels:analysis.maximumGeometryDeltaCssPixels,
  bytesSaved:analysis.bytesSaved,nativeBirthsUnavailable:analysis.nativeBirthsUnavailable,publicAcceptance:false}));
