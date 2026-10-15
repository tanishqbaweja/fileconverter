// Private single-thread queue policy, derived from the exact qualified kernel.
import assert from "node:assert/strict";
import { makePacketCacheKernel as parentKernel } from "./mpeg2-packet-largest-idle-source.mjs";
export { makePacketCacheBridge } from "./mpeg2-packet-largest-idle-source.mjs";
export const DRAIN_INSERTION = `    // Flush only the existing interleaver. Never drop a live mux reference,
    // mix write APIs, rewrite timing, or change codec settings to release memory.
    result = av_interleaved_write_frame(p->output, NULL);
    if (result < 0) return result;
    if (p->output->pb->error < 0) return p->output->pb->error;
`;
export function makePacketDrainKernel(source) {
  const parent = parentKernel(source);
  const start = parent.indexOf("static int mpeg2_packets("), end = parent.indexOf("static int mpeg2_frames(");
  assert.ok(start >= 0 && end > start);
  const packets = parent.slice(start, end);
  const before = "    if (p->output->pb->error < 0) return p->output->pb->error;\n";
  assert.equal(packets.split(before).length, 2);
  const changed = packets.replace(before, before + DRAIN_INSERTION);
  const generated = parent.replace(packets, changed);
  assert.equal(generated.replace(changed, packets), parent);
  assert.equal(changed.replace(DRAIN_INSERTION, ""), packets);
  assert.ok(changed.indexOf(DRAIN_INSERTION) > changed.indexOf("if (release < 0) return release;"));
  return { generated, parent, originalPackets: packets, changedPackets: changed,
    liveReferencesChanged: false, codecSettingsChanged: false, heapLimitsChanged: false,
    containerPacketOrderMayChange: true, publicAcceptance: false };
}
export const makePacketCacheKernel = source => makePacketDrainKernel(source).generated;
