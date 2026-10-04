import { summarizeCpuProfile } from "./cpu-profile-summary.mjs";

const target = (name) => /(?:^|::)VAACalcSadBgd_c(?:\(|$)|(?:^|::)within_vaa_(?:simd|block)(?:\(|$)/.test(name);

// Read ALL sampled nodes, not only the top-40 summary. Inlined helper names
// can move target work between symbols. Inclusive attribution counts a sample
// once even if several target symbols appear in its ancestry.
export function vaaCpuHotspot(profile) {
  const summary = summarizeCpuProfile(profile); // Validates IDs, cycles, caps and real deltas.
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
  const selfByFunction = new Map();
  let selfMicroseconds = 0, inclusiveMicroseconds = 0, selfSamples = 0, inclusiveSamples = 0;
  for (let index = 0; index < profile.samples.length; ++index) {
    const id = profile.samples[index], delta = profile.timeDeltas[index];
    const name = nodes.get(id).callFrame.functionName;
    if (target(name)) { selfMicroseconds += delta; ++selfSamples; }
    selfByFunction.set(name, (selfByFunction.get(name) ?? 0) + delta);
    let current = id;
    while (current !== undefined) {
      if (target(nodes.get(current).callFrame.functionName)) {
        inclusiveMicroseconds += delta; ++inclusiveSamples; break;
      }
      current = parents.get(current);
    }
  }
  const fraction = (weight) => summary.totalSampledMicroseconds ? weight / summary.totalSampledMicroseconds : null;
  const top = (predicate) => [...selfByFunction].filter(([name]) => predicate(name))
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([functionName, sampledMicroseconds]) => ({ functionName: functionName.slice(0, 512),
      sampledMicroseconds, fractionOfSampledWindow: fraction(sampledMicroseconds) }));
  return {
    semantics: "Partial sampled stack wall-time attribution, not function call counts, OS CPU utilization, equal processed-frame work or end-to-end speed",
    samples: summary.samples, nodes: summary.nodes, totalSampledMicroseconds: summary.totalSampledMicroseconds,
    profileWallMicroseconds: summary.profileWallMicroseconds,
    targetSelf: { sampledMicroseconds: selfMicroseconds, samples: selfSamples, fractionOfSampledWindow: fraction(selfMicroseconds) },
    targetInclusiveUnique: { sampledMicroseconds: inclusiveMicroseconds, samples: inclusiveSamples, fractionOfSampledWindow: fraction(inclusiveMicroseconds) },
    targetSymbols: top(target), otherTopSelf: top((name) => !target(name)), categories: summary.categories,
  };
}
