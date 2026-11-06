// Private explicit original-width/clock composition, not public route acceptance.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {makeVp9OriginalWidthSource} from "./vp9-original-width-recipe.mjs";
export function makeWebCodecsOriginalSource(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"),"ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
  const candidate=makeVp9OriginalWidthSource(source);
  assert.equal(candidate.edits.length,3);
  return {...candidate,scope:"Private platform VP9 explicit1920 width and established CFR clock; original AVIO/decode/mux otherwise unchanged",
    platformEncoderChanged:false,decoderHeapBytes:33554432,decoderThreads:1,codecSettingsChanged:false,
    maximumPacketBytes:1048576,maximumFramesInFlight:1,maximumPacketsInFlight:1,
    memoryLimitsRaised:false,browserValidated:false,speedGainProven:false,publicAcceptance:false};
}
