import assert from "node:assert/strict";

// Sampling deltas are wall-time estimates attributed to stack locations, not
// OS CPU utilization. An idle sample must never become encoder compute time.
export function summarizeCpuProfile(profile) {
  assert.ok(profile.nodes.length <= 16384 && profile.samples.length <= 100000, "CPU diagnostic node/sample cap");
  assert.equal(profile.samples.length, profile.timeDeltas.length);
  assert.ok(profile.endTime >= profile.startTime);
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  assert.equal(nodes.size, profile.nodes.length, "Unique profile node IDs");
  const parents = new Map();
  for (const node of profile.nodes) for (const id of node.children ?? []) {
    assert.ok(nodes.has(id)); assert.ok(!parents.has(id), "Single profile parent"); parents.set(id, node.id);
  }
  const stacks = new Map(), self = new Map(), inclusive = new Map(), categories = new Map();
  let totalMicroseconds = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i], delta = profile.timeDeltas[i];
    assert.ok(nodes.has(id), "No unknown CPU sample IDs");
    assert.ok(Number.isFinite(delta) && delta >= 0, "Unavailable or negative CPU intervals cannot be invented");
    let stack = stacks.get(id);
    if (!stack) {
      stack = []; const seen = new Set(); let current = id;
      while (current !== undefined) {
        assert.ok(!seen.has(current), "CPU stack cycle"); seen.add(current); stack.push(current);
        assert.ok(stack.length <= 512, "CPU stack-depth cap"); current = parents.get(current);
      }
      stacks.set(id, stack);
    }
    self.set(id, (self.get(id) ?? 0) + delta);
    for (const ancestor of stack) inclusive.set(ancestor, (inclusive.get(ancestor) ?? 0) + delta);
    const names = stack.map((nodeId) => nodes.get(nodeId).callFrame.functionName), leaf = names[0];
    let category = "unclassified";
    if (leaf === "(idle)") category = "idle";
    else if (leaf === "(garbage collector)") category = "garbage-collection";
    else if (names.some((name) => /within_(input|output)|input_read|output_write|avio_|readSync|writeSync/.test(name))) category = "io-bridge-or-avio";
    else if (names.some((name) => /Wels|svc_encode|h264_packets/.test(name))) category = "openh264-encoder-stack";
    else if (names.some((name) => /mpeg4_decode|ff_mpeg4|ff_mpv|ff_mpeg|avcodec_send_packet|avcodec_receive_frame/.test(name))) category = "ffmpeg-decoder-stack";
    else if (names.some((name) => /sws_scale|sws_getCachedContext/.test(name))) category = "scaling-stack";
    else if (names.some((name) => /matroska|mov_write|av_interleaved_write_frame/.test(name))) category = "muxing-stack";
    categories.set(category, (categories.get(category) ?? 0) + delta); totalMicroseconds += delta;
  }
  const top = (weights) => [...weights].map(([id, sampledMicroseconds]) => ({ id,
    functionName: nodes.get(id).callFrame.functionName.slice(0, 512),
    url: nodes.get(id).callFrame.url.slice(0, 1024), sampledMicroseconds,
    fractionOfSampledWindow: totalMicroseconds ? sampledMicroseconds / totalMicroseconds : null }))
    .sort((a, b) => b.sampledMicroseconds - a.sampledMicroseconds).slice(0, 40);
  return { semantics: "Sampled stack wall-time estimates, not OS CPU utilization or end-to-end speed; inclusive stacks overlap",
    samples: profile.samples.length, nodes: profile.nodes.length, totalSampledMicroseconds: totalMicroseconds,
    profileWallMicroseconds: profile.endTime - profile.startTime,
    categories: [...categories].map(([category, sampledMicroseconds]) => ({ category, sampledMicroseconds,
      fractionOfSampledWindow: totalMicroseconds ? sampledMicroseconds / totalMicroseconds : null })),
    topSelf: top(self), topInclusive: top(inclusive) };
}
