// Independently repeat the exact existing source/output/pin/native/cleanup
// checks on the ACTUAL new receipts. Only evidence bindings change; reports are
// never rewritten to an older decoder identity. Verified raw duplicate only.
import assert from "node:assert/strict";
import { access,readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const witnessPath="evidence/2026-10-14T18-11-48-138Z-ebml-reuse-browser-control-executed-sources.json";
process.env.WITHIN_EBML_REUSE_CONTROL_RECEIPT=witnessPath;
const sourcePath="scripts/verify-installed-chrome-realloc-qualification.mjs",source=(await read(sourcePath)).toString();
const nativeUrl=pathToFileURL(path.join(root,"scripts/lib/ebml-reuse-browser-components.mjs")).href;
const extraChecks=`const supplementalPath="evidence/2026-10-14T18-18-41-941Z-ebml-reuse-media-supplement.json";
const supplementalBytes=await read(supplementalPath), supplemental=JSON.parse(supplementalBytes);
assert.equal(supplemental.failure,null);assert.equal(supplemental.prepareOnly,false);assert.equal(supplemental.ownedCallerAbsent,true);
assert.deepEqual(supplemental.sourcePins,supplemental.postSourcePins);assert.equal(Object.keys(supplemental.sourcePins).length,18);
assert.equal(supplemental.distinctTotalFiles,273);assert.equal(supplemental.supplemental.maximumFiles,128);
assert.equal(supplemental.supplemental.maximumRestoredBytes,2097152);assert.equal(supplemental.legacy.maximumFiles,256);
assert.equal(supplemental.legacy.maximumRestoredBytes,8388608);
const supplementalArchive=JSON.parse(await restore(supplemental.archive,2097152));assert.deepEqual(supplementalArchive.sourcePins,supplemental.sourcePins);
for(const [file,hash]of Object.entries(supplemental.sourcePins)){assert.equal(sha(Buffer.from(supplementalArchive.preimages[file],"base64")),hash);assert.equal(sha(await read(file)),hash);}
assert.equal(new Set([...Object.keys(media.sourcePins),...Object.keys(supplemental.sourcePins)]).size,273);
`;
const edits=[
  ['const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),stamp="2026-10-14T15-36-28-196Z";',
    `const root=${JSON.stringify(root)},read=file=>readFile(path.join(root,file)),stamp="2026-10-14T18-18-41-950Z";`],
  ['import { inspectReallocMediaReport } from "./lib/realloc-media-report-inspector.mjs";',
    `import { inspectEbmlMediaReport as inspectReallocMediaReport } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/ebml-reuse-media-recipe.mjs")).href)};`],
  ['import { verifyReallocNativeEnvelope } from "./lib/realloc-native-envelope.mjs";',
    `import { verifyEbmlNative } from ${JSON.stringify(nativeUrl)};\nconst verifyReallocNativeEnvelope=async(root,build,buildBytes,branch)=>{const actual=await verifyEbmlNative(root);assert.deepEqual(build,actual.build);assert.equal(sha(buildBytes),sha(actual.buildBytes));assert.deepEqual(branch,actual.branch);return actual.envelope;};`],
  ['"evidence/2026-10-14T15-33-36-401Z-installed-chrome-realloc-control-executed-sources.json"',JSON.stringify(witnessPath)],
  ['[[witness,controlArchive,125],[media,mediaArchive,255]]','[[witness,controlArchive,35],[media,mediaArchive,255]]'],
  ['const proofBytes=await read(witness.proof.path)',extraChecks+'const proofBytes=await read(witness.proof.path)'],
  ['"eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c"','"7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25"'],
  ['evidence/mpeg2-realloc-attempt-build-38526781934.json','evidence/mpeg2-ebml-reuse-build-38608791023.json'],
  ['evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json','evidence/mpeg2-ebml-reuse-build-branch-2026-10-14.json'],
  ['const analysis=inspectReallocMediaReport(','const analysis=await inspectReallocMediaReport('],
  ['mediaArchive.generated.actualControlWitness','mediaArchive.generated.actualEbmlControlWitness'],
  ['packet-cache-media-MbROAx-direct-artwork','packet-cache-media-ymKke6-direct-artwork'],
  ['own="scripts/verify-installed-chrome-realloc-qualification.mjs"','own="scripts/verify-ebml-reuse-media.mjs"'],
  ['sourceCounts:{control:125,media:255}','sourceCounts:{control:35,native:93,totalControl:126,mediaLegacy:255,mediaSupplemental:18,totalMedia:273}'],
  ['sourceArchives:{control:witness.archive,media:media.generatedArchive}','sourceArchives:{control:witness.archive,media:media.generatedArchive,supplemental:supplemental.archive}'],
  ['sourceCapsChanged:false','sourceCapsChanged:false,sourceCapsScope:"per-independent-seal-not-single-total256",supplementalSourcePins:supplemental.sourcePins'],
];
const recipe=exactPatch(source,edits);
let generated=recipe.generated.replaceAll("${stamp}-installed-chrome-realloc-media","${stamp}-ebml-reuse-media")
  .replaceAll("${stamp}-installed-chrome-realloc-independent-qualification","${stamp}-ebml-reuse-independent-qualification");
generated=generated.replace(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm,(match,file)=>
  match.replace(`from "${file}"`,`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`));
const runtime=await createOwnedRuntimeScratch("ebml-reuse-independent-seal-");
try {const file=path.join(runtime.directory,"verify.mjs");await writeFile(file,generated,{flag:"wx"});await import(pathToFileURL(file).href);}
finally {await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
const output="evidence/2026-10-14T18-18-41-950Z-ebml-reuse-independent-executed-source.json";
await writeFile(path.join(root,output),JSON.stringify({recordedAt:new Date().toISOString(),sourcePath,sourceSha256:sha(source),sourcePreimage:Buffer.from(source).toString("base64"),
  generatedSource:generated,generatedSha256:sha(generated),recipe,ownedRuntimeRemoved:true,originalAcceptance:false,publicAcceptance:false},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output}));
