import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {createQualifiedSourceTimeline} from "./qualified-source-timeline.mjs";
import {verifyThreadValidatorQualification} from "./threaded-validator-qualification.mjs";
import {sha} from "./stable-ui-headless-baseline-recipe.mjs";
export const TIMELINE_DIAGNOSTIC="evidence/2026-10-16T21-01-48-525Z-source-timestamp-csv-diagnostic.json";
export const TIMELINE_REFERENCE="evidence/2026-10-16T21-01-48-525Z-qualified-source-timeline-reference.json";
export const TIMELINE_RUNTIME_FILES=["scripts/run-recorded-timeline-full.mjs","scripts/lib/recorded-timeline-full-recipe.mjs",
  "scripts/lib/recorded-timeline-full-sources.mjs","scripts/lib/source-timeline-qualification.mjs","scripts/lib/recorded-frame-validator.mjs",
  "scripts/lib/qualified-source-timeline.mjs","tests/recorded-timeline-full.test.mjs","tests/recorded-frame-validator.test.mjs",
  "tests/qualified-source-timeline.test.mjs","tests/timestamp-csv-diagnostic.test.mjs"];
export async function loadSourceTimelineQualification(root) {
  const read=file=>readFile(path.join(root,file)),diagnosticBytes=await read(TIMELINE_DIAGNOSTIC),referenceBytes=await read(TIMELINE_REFERENCE);
  const diagnostic=JSON.parse(diagnosticBytes),reference=JSON.parse(referenceBytes);
  assert.equal(reference.status,"all-native-source-timestamps-exactly-reconstructible-reference-only");
  assert.equal(reference.diagnostic.path,TIMELINE_DIAGNOSTIC);assert.equal(reference.diagnostic.sha256,sha(diagnosticBytes));
  assert.equal(reference.analysis.all296160ActualNativeTimestampFieldsEqual,true);assert.equal(reference.analysis.frames,296160);
  assert.equal(reference.fullOriginalAcceptance,false);assert.equal(reference.publicAcceptance,false);
  assert.equal(Object.keys(diagnostic.sourcePins).length,9);assert.deepEqual(diagnostic.sourcePins,diagnostic.postSourcePins);
  for(const [file,hash]of Object.entries(diagnostic.sourcePins)){
    assert.equal(sha(Buffer.from(diagnostic.preimages[file],"base64")),hash,file);assert.equal(sha(await read(file)),hash,file);
  }
  for(const [file,row]of Object.entries(reference.ownSources)){
    assert.equal(sha(Buffer.from(row.preimage,"base64")),row.sha256,file);assert.equal(sha(await read(file)),row.sha256,file);
  }
  const native=await verifyThreadValidatorQualification(root);assert.deepEqual(native.reference,diagnostic.qualification);assert.deepEqual(native.reference,reference.nativeQualification);
  const timeline=createQualifiedSourceTimeline(diagnostic);assert.equal(timeline.byteLength,2369280);
  return {diagnostic,reference,native,referenceBinding:{path:TIMELINE_REFERENCE,sha256:sha(referenceBytes),
    diagnostic:{path:TIMELINE_DIAGNOSTIC,sha256:sha(diagnosticBytes)},frames:timeline.length,
    orderedTimestampSha256:reference.analysis.orderedTimestampSha256,sourceSha256:reference.source.sha256,
    everyActualSourceTimestampVerified:true,sourceReuseRequiresFullShaCheck:true,outputValidationRelaxed:false,fullOriginalAcceptance:false},
    files:[TIMELINE_DIAGNOSTIC,TIMELINE_REFERENCE,...Object.keys(diagnostic.sourcePins),...Object.keys(reference.ownSources),...TIMELINE_RUNTIME_FILES]};
}
