// Replace properties on the reusable scaler frame, not its live pixel storage.
import { exactPatch } from "../../scripts/lib/ebml-reuse-browser-components.mjs";
import { makeDurationDrainKernel } from "./mpeg2-duration-drain-source.mjs";
export { makePacketCacheBridge } from "./mpeg2-duration-drain-source.mjs";
export function makeScaledPropertiesKernel(source) {
  const parent = makeDurationDrainKernel(source);
  const include = '#include "mpeg2-scaled-frame-properties.h"\n';
  const changed = exactPatch(parent.generated, [["av_frame_copy_props(p->converted, frame)",
    "within_mpeg2_replace_scaled_properties(p->converted, frame)"]]);
  return { ...parent, generated: include + changed.generated, scaledPropertiesParent: parent.generated,
    scaledPropertiesEdits: changed.edits, scaledPropertiesInclude: include,
    scaledPropertyReplacement: true, bFramePolicyChanged: false, publicAcceptance: false };
}
// Parent build/collector checks still derive their kernel from the same source.
export { makeScaledPropertiesKernel as makePacketDrainKernel };
export const makePacketCacheKernel = source => makeScaledPropertiesKernel(source).generated;
