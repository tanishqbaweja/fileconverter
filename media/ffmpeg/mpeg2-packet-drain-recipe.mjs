import assert from "node:assert/strict";
import { makePacketInterleaveRecipe } from "./mpeg2-packet-interleave-recipe.mjs";
export function makePacketDrainRecipe(source) {
  const parent = makePacketInterleaveRecipe(source).generated;
  const before = "make-mpeg2-packet-largest-idle-pipeline.mjs", after = "make-mpeg2-packet-drain-pipeline.mjs";
  assert.equal(parent.split(before).length, 2);
  const generated = parent.replace(before, after); assert.equal(generated.replace(after, before), parent);
  return { generated, parent, codecSettingsChanged: false, heapLimitsChanged: false, publicAcceptance: false };
}
export const makePacketDrainShellRecipe = source => makePacketDrainRecipe(source).generated;
