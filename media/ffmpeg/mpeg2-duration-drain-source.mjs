import assert from "node:assert/strict";
import { makePacketDrainKernel } from "./mpeg2-packet-drain-source.mjs";
export { makePacketCacheBridge } from "./mpeg2-packet-drain-source.mjs";
export function makeDurationDrainKernel(source) {
  const drain = makePacketDrainKernel(source), parent = drain.generated;
  const before = "    av_packet_rescale_ts(p->encoded, p->encoder->time_base,\n                         p->destination->time_base);";
  const after = `    int64_t duration;
    result = within_packet_cfr_duration(p->encoded, p->encoder->time_base,
                                       p->destination->time_base, &duration);
    if (result < 0) return result;
${before}
    p->encoded->duration = duration;`;
  assert.equal(parent.split(before).length, 2);
  const include = '#include "mpeg2-duration-boundary.h"\n';
  const generated = include + parent.replace(before, after);
  assert.equal(generated.slice(include.length).replace(after, before), parent);
  assert.equal(generated.split("within_packet_cfr_duration(").length, 2);
  return { generated, parent, originalKernel: drain.parent,
    durationBoundaryCorrection: true, ptsDtsRewritten: false, encoderPacketWireChanged: false,
    codecSettingsChanged: false, liveReferencesChanged: false, heapLimitsChanged: false, publicAcceptance: false };
}
export { makeDurationDrainKernel as makePacketDrainKernel };
export const makePacketCacheKernel = source => makeDurationDrainKernel(source).generated;
