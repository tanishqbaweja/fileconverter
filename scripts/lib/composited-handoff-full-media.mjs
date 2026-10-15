// Read-only prerequisite replay. No conversion, mutation, raw cleanup or retries.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { loadQualifiedDurationMedia } from "./duration-drain-full-media.mjs";
import { inspectEbmlMediaReport } from "./reliable-composited-media.mjs";
import { verifyHandoffBuildAndEvents } from "./composited-handoff-evidence.mjs";
import { assertInstalledChromePinsEqual } from "./installed-chrome-pin.mjs";
import { verifyDurationEquivalenceReports } from "./duration-drain-equivalence.mjs";
export async function loadQualifiedCompositedMedia(root) {
  const previous=await loadQualifiedDurationMedia(root),read=file=>readFile(path.join(root,file));
  const mediaPath=process.env.WITHIN_COMPOSITED_HANDOFF_MEDIA;
  assert.match(mediaPath??"",/^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-composited-handoff-media\.json$/);
  const sealPath=mediaPath.replace("-media.json","-independent-qualification.json");
  const mediaBytes=await read(mediaPath),proof=JSON.parse(mediaBytes),sealBytes=await read(sealPath),seal=JSON.parse(sealBytes);
  assert.equal(sha(mediaBytes),seal.media.sha256);assert.equal(seal.media.path,mediaPath);
  assert.equal(proof.failure,null);assert.equal(proof.analysis.genuineValidatedConversions,4);
  assert.equal(seal.smallFixtureFidelityQualified,true);assert.equal(seal.primaryMemoryAcceptance,false);assert.equal(seal.fullOriginalAcceptance,false);
  const restore=async(record,maximum,json=true)=>{
    const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
    const raw=gunzipSync(zip,{maxOutputLength:maximum});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);
    return json?JSON.parse(raw):raw;
  };
  const archive=await restore(proof.generatedArchive,8388608),report=await restore(proof.report.archive,2097152);
  const supplementBytes=await read(seal.supplemental.path),supplement=JSON.parse(supplementBytes),extra=await restore(supplement.archive,2097152);
  assert.equal(sha(supplementBytes),seal.supplemental.sha256);assert.equal(supplement.failure,null);assert.equal(supplement.prepareOnly,false);
  assert.deepEqual(report.manifest,archive.generated.composition.manifest);assert.deepEqual(report.manifest,previous.report.manifest);
  assert.equal(archive.generated.stage.replaceAll(archive.generated.candidateName,"CANDIDATE"),
    previous.archive.generated.stage.replaceAll(previous.archive.generated.candidateName,"CANDIDATE"),"Native adapter and I/O are exactly the qualified prior route");
  const buildBytes=await read(seal.build.path),build=JSON.parse(buildBytes),buildArchive=await restore(build.sourceArchive,2097152);
  assert.equal(sha(buildBytes),seal.build.sha256);assert.equal(archive.generated.handoffLifecycle.buildProofPath,seal.build.path);
  const sources={};
  for(const [receipt,preimages,count,encoding]of [[proof,archive.sources,255,"text"],[supplement,extra.preimages,106,"base64"],[build,buildArchive.preimages,20,"base64"]]) {
    assert.equal(Object.keys(receipt.sourcePins).length,count);assert.deepEqual(receipt.sourcePins,receipt.postSourcePins);
    for(const [file,hash]of Object.entries(receipt.sourcePins)) {
      assert.equal(sha(encoding==="text"?preimages[file]:Buffer.from(preimages[file],"base64")),hash,file);
      assert.equal(sha(await read(file)),hash,file);if(sources[file])assert.equal(sources[file],hash,file);sources[file]=hash;
    }
  }
  assert.equal(Object.keys(sources).length,367);
  for(const [file,source]of Object.entries(seal.ownSources)) {
    assert.equal(sha(Buffer.from(source.preimage,"base64")),source.sha256);assert.equal(sha(await read(file)),source.sha256,file);
  }
  for(const asset of [...build.assets,build.stylesheet]) {
    const bytes=await restore(asset.archive,2097152,false);assert.equal(bytes.length,asset.bytes);assert.equal(sha(bytes),asset.sha256);
  }
  assert.deepEqual(verifyHandoffBuildAndEvents(build,archive.generated,report),seal.handoff);
  assert.deepEqual(await inspectEbmlMediaReport(report,JSON.parse(await read(proof.baseline.path)).reports[0].report,JSON.parse(await read(proof.build.path))),proof.analysis);
  const historical=JSON.parse(await read("evidence/2026-10-15T03-26-36-040Z-packet-order-baseline-media.json"));
  assert.deepEqual(verifyDurationEquivalenceReports(await restore(historical.report.archive,2097152),report),seal.equivalence);
  assert.equal(sha(Buffer.from(seal.executedAuditorSource.preimage,"base64")),seal.executedAuditorSource.sha256);
  assert.equal(seal.equivalence.exactPacketPayloadAndTimingPreservation,true);assert.equal(seal.equivalence.qualityOrTimingThresholdRelaxed,false);
  assertInstalledChromePinsEqual(previous.pin,proof.browserPinBefore);assertInstalledChromePinsEqual(proof.browserPinBefore,proof.browserPinAfter);
  return {...previous,proof,archive,report,pin:proof.browserPinBefore,allSourcePins:sources,build,
    supplementPath:seal.supplemental.path,supplement,
    additionalEvidence:[...previous.additionalEvidence,...Object.keys(seal.ownSources),seal.build.path,build.sourceArchive.path,
      ...build.assets.map(row=>row.archive.path),build.stylesheet.archive.path],
    reference:{path:mediaPath,sha256:sha(mediaBytes),sourceCount:367,
      independentSeal:{path:sealPath,sha256:sha(sealBytes)},supplemental:{path:seal.supplemental.path,sha256:sha(supplementBytes)},
      runtimeVersion:proof.browserPinBefore.version,exactPacketPayloadTimingAndMetadataEquivalent:true,
      encodingIoQualityAndMemoryGatesUnchanged:true,progressCompositingPreserved:true,workerLifecycleChanged:true,
      fullOriginalAcceptance:false,primaryMemoryAcceptance:false}};
}
