import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import {inspectEbmlMediaReport} from "./staged-handoff-media-recipe.mjs";
import {verifyHandoffBuildAndEvents} from "./composited-handoff-evidence.mjs";
import {assertInstalledChromePinsEqual,inspectInstalledChromePin} from "./installed-chrome-pin.mjs";
import {sha} from "./stable-ui-headless-baseline-recipe.mjs";
export const UPDATED_MEDIA="evidence/2026-10-16T16-41-46-137Z-updated-chrome-media.json";
export async function loadUpdatedChromeQualification(root) {
  const read=file=>readFile(path.join(root,file));
  const bytes=await read(UPDATED_MEDIA),proof=JSON.parse(bytes);
  assert.equal(proof.status,"four-updated-chrome-conversions-and-recovery-passed-not-full-acceptance");
  assert.equal(proof.failure,null);assert.deepEqual(proof.cleanupErrors,[]);assert.equal(proof.executions,1);
  assert.deepEqual(proof.sourcePins,proof.postSourcePins);assert.equal(Object.keys(proof.sourcePins).length,370);
  for(const [file,hash]of Object.entries(proof.sourcePins))assert.equal(sha(await read(file)),hash,file);
  const unpack=async record=>{
    const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
    const raw=gunzipSync(zip,{maxOutputLength:8388608});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);return JSON.parse(raw);
  };
  const archive=await unpack(proof.sourceArchive);assert.deepEqual(archive.sourcePins,proof.sourcePins);
  for(const [file,base64]of Object.entries(archive.preimages))assert.equal(sha(Buffer.from(base64,"base64")),proof.sourcePins[file]);
  assert.equal(archive.recipe.onlyBrowserIdentityAndOwnedPathsChanged,true);assert.equal(archive.recipe.conversionAndValidationGatesChanged,false);
  const parentBytes=await read(proof.parent.path);assert.equal(sha(parentBytes),proof.parent.sha256);
  const parent=JSON.parse(parentBytes),historical=await unpack(parent.generatedArchive),report=await unpack(proof.report),previous=await unpack(parent.report.archive);
  const baselineBytes=await read(parent.baseline.path),nativeBuildBytes=await read(parent.build.path);
  assert.equal(sha(baselineBytes),parent.baseline.sha256);assert.equal(sha(nativeBuildBytes),parent.build.sha256);
  assert.deepEqual(await inspectEbmlMediaReport(report,JSON.parse(baselineBytes).reports[0].report,JSON.parse(nativeBuildBytes)),proof.analysis);
  assert.equal(proof.analysis.genuineValidatedConversions,4);
  const packets=value=>value.rows.filter(row=>row.kind==="independent-packet-order-proof");
  assert.equal(packets(report).length,4);assert.deepEqual(packets(report),packets(previous));
  const buildBytes=await read(proof.build.path);assert.equal(sha(buildBytes),proof.build.sha256);const build=JSON.parse(buildBytes);
  const compiledSources=await unpack(build.sourceArchive);assert.deepEqual(compiledSources.sourcePins,build.sourcePins);
  assert.deepEqual(build.sourcePins,build.postSourcePins);
  for(const [file,hash]of Object.entries(build.sourcePins)) {
    assert.equal(sha(Buffer.from(compiledSources.preimages[file],"base64")),hash,file);assert.equal(sha(await read(file)),hash,file);
  }
  for(const asset of [...build.assets,build.stylesheet]) {
    const record=asset.archive,zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
    const raw=gunzipSync(zip,{maxOutputLength:2097152});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);
    assert.equal(raw.length,asset.bytes);assert.equal(sha(raw),asset.sha256);
  }
  assert.deepEqual(verifyHandoffBuildAndEvents(build,archive.recipe.generated,report),proof.lifecycle);
  for(const row of report.rows.filter(row=>row.kind==="actual-runtime-browser-version"))assert.equal(row.version,proof.browserPinBefore.version);
  assertInstalledChromePinsEqual(proof.browserPinBefore,proof.browserPinAfter);
  assertInstalledChromePinsEqual(proof.browserPinBefore,await inspectInstalledChromePin());
  assert.equal(proof.runtimeRemoved,true);assert.equal(proof.productionRestored,true);
  return {proof,archive,historical,build,pin:proof.browserPinBefore,
    reference:{path:UPDATED_MEDIA,sha256:sha(bytes),runtimeVersion:proof.browserPinBefore.version,sourceCount:370,
      actualFourBrowserConversionsAndRecovery:true,fullOriginalAcceptance:false,publicAcceptance:false},
    files:[UPDATED_MEDIA,proof.sourceArchive.path,proof.report.path,proof.build.path,...Object.keys(proof.sourcePins),
      ...build.assets.map(row=>row.archive.path),build.stylesheet.archive.path,build.sourceArchive.path]};
}
export async function copyUpdatedChromeCandidate(root,directory,qualified) {
  assert.equal(path.dirname(directory),path.join(root,"work"));
  assert.match(path.basename(directory),/^allocation-attempt-media-[A-Za-z0-9]+$/);
  const composition=qualified.historical.generated.composition;
  assert.equal(composition.manifest.aggregateWasmMemoryBytes,50331648);assert.equal(composition.manifest.allowMemoryGrowth,false);
  for(const [file,row]of Object.entries(composition.files)) {
    assert.equal(path.basename(file),file);
    const bytes=row.path==="derived-at-runtime"?Buffer.from(qualified.historical.generated.ebmlGlueRecipe.generated):await readFile(path.join(root,row.path));
    assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);assert.equal(composition.manifest.artifacts[file],row.sha256);
    await writeFile(path.join(directory,file),bytes,{flag:"wx"});
  }
  await writeFile(path.join(directory,"build-manifest.json"),JSON.stringify(composition.manifest,null,2)+"\n",{flag:"wx"});
  return composition;
}
