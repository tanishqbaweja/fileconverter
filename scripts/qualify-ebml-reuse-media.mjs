// The immutable 255-source parent remains sealed under256/8MiB. This bounded
// additive seal covers every new runtime/native/control file, including binaries
// as base64, without dropping old sources or relaxing conversion acceptance.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeJournaledReallocMediaCaller } from "./lib/journaled-realloc-media-recipe.mjs";
import { makeInstalledChromeMediaCallerFromJournaled } from "./lib/installed-chrome-realloc-recipe.mjs";
import { ebmlMediaParts } from "./lib/ebml-reuse-media-recipe.mjs";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
const args=process.argv.slice(2);assert.ok(args.length===1||(args.length===2&&args[1]==="--prepare"));
assert.match(args[0]??"",/^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-ebml-reuse-browser-control-executed-sources\.json$/);
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
process.env.WITHIN_EBML_REUSE_CONTROL_RECEIPT=args[0];
process.env.WITHIN_INSTALLED_CHROME_CONTROL_RECEIPT="evidence/2026-10-14T15-33-36-401Z-installed-chrome-realloc-control-executed-sources.json";
const parts=await ebmlMediaParts(root),parent=makeInstalledChromeMediaCallerFromJournaled(
  makeJournaledReallocMediaCaller((await read("scripts/validate-mpeg2-encoder-plane-goldens.mjs")).toString(),root),root);
const newUrl=pathToFileURL(path.join(root,"scripts/lib/ebml-reuse-media-recipe.mjs")).href;
const recipe=exactPatch(parent.generated,[
  [`import { makeInstalledChromeMediaBrowserRecipe as makeSingleIdleBrowserRecipe } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/installed-chrome-realloc-recipe.mjs")).href)};`,
    `import { makeEbmlMediaBrowserRecipe as makeSingleIdleBrowserRecipe } from ${JSON.stringify(newUrl)};`],
  [`import { inspectReallocMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/realloc-media-report-inspector.mjs")).href)};`,
    `import { inspectEbmlMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(newUrl)};`],
  ["analysis = verifySingleIdleGoldenReport(report, baseline, build);","analysis = await verifySingleIdleGoldenReport(report, baseline, build);"],
]);
recipe.generated=recipe.generated.replaceAll("${stamp}-installed-chrome-realloc-media","${stamp}-ebml-reuse-media");recipe.generatedSha256=sha(recipe.generated);
const legacyFiles=Object.keys(parts.baseline.sourcePins);assert.equal(legacyFiles.length,255);assert.ok(legacyFiles.length<=256);
const all=new Set([...legacyFiles,...Object.keys(parts.native.envelope.currentSourcePins),...Object.keys(parts.control.sourcePins),
  "scripts/qualify-ebml-reuse-media.mjs","scripts/lib/ebml-reuse-media-recipe.mjs","scripts/lib/ebml-reuse-browser-components.mjs",
  parts.native.proofPath,parts.native.buildPath,parts.native.branchPath,parts.native.envelope.archive.path,
  parts.controlPath,parts.control.proof.path,parts.control.archive.path]);
for(const file of all) {
  if(!file.endsWith(".mjs"))continue;
  for(const match of (await read(file)).toString().matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    const relative=path.relative(root,path.resolve(root,path.dirname(file),match[1])).replaceAll("\\","/");
    assert.ok(relative&&!relative.startsWith("../")&&!path.isAbsolute(relative));all.add(relative);
  }
}
const supplemental=[...all].filter(file=>!legacyFiles.includes(file));assert.ok(supplemental.length<=128);
const sourcePins={},preimages={};
for(const file of supplemental){const bytes=await read(file);assert.ok(bytes.length<=2097152);sourcePins[file]=sha(bytes);preimages[file]=bytes.toString("base64");}
const raw=Buffer.from(JSON.stringify({recipe,sourcePins,preimages}));assert.ok(raw.length<=2097152);
const zipped=gzipSync(raw,{level:9});assert.deepEqual(gunzipSync(zipped),raw);
const stamp=new Date().toISOString().replaceAll(/[:.]/g,"-"),archivePath=`outputs/reports/${stamp}-ebml-reuse-media-supplement.json.gz`;
await writeFile(path.join(root,archivePath),zipped,{flag:"wx"});
const runtime=await createOwnedRuntimeScratch("ebml-reuse-media-caller-");let failure=null;
try {
  process.argv.splice(2);if(args[1]==="--prepare")process.argv.push("--prepare");
  const file=path.join(runtime.directory,"caller.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);
}catch(error){failure=String(error.stack??error).slice(0,8192);process.exitCode=1;}
finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
const postSourcePins={};for(const [file,hash]of Object.entries(sourcePins)){postSourcePins[file]=sha(await read(file));assert.equal(postSourcePins[file],hash);}
const nativeEnvelopePost=(await ebmlMediaParts(root)).native.envelope;assert.deepEqual(nativeEnvelopePost,parts.native.envelope);
const output=`evidence/${stamp}-ebml-reuse-media-supplement.json`;
await writeFile(path.join(root,output),JSON.stringify({recordedAt:new Date().toISOString(),failure,prepareOnly:args[1]==="--prepare",
  legacy:{sourceCount:255,maximumFiles:256,maximumRestoredBytes:8388608},supplemental:{sourceCount:supplemental.length,maximumFiles:128,maximumRestoredBytes:2097152},
  distinctTotalFiles:all.size,sourcePins,postSourcePins,nativeEnvelopeBefore:parts.native.envelope,nativeEnvelopePost,
  archive:{path:archivePath,bytes:zipped.length,sha256:sha(zipped),restoredBytes:raw.length,restoredSha256:sha(raw)},
  ownedCallerAbsent:true,publicAcceptance:false,fullOriginalCompleted:false},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,failure,prepareOnly:args[1]==="--prepare",legacySources:255,supplementalSources:supplemental.length}));
assert.equal(failure,null);
