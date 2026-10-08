// New source-attributed JS profiler; old sparse native sampler stays immutable.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
export function makeUiJsAllocationControl(source, root) {
  assert.equal(createHash("sha256").update(source).digest("hex"),
    "76b50f530ee0d117064be896c1051893db1ef4c875418915e86a353653e72974");
  const url = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  const oldSampling = `  if (sampling) {
    const value = await cdp.send("Memory.getSamplingProfile");
    // Reject oversized/unsupported payloads rather than silently accepting a truncated profile.
    assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 524288, "Native sampling response cap");
    assert.ok(value.profile.samples.length <= 4096 && value.profile.modules.length <= 256);
    for (const sample of value.profile.samples) assert.ok(sample.stack.length <= 128);
    profiles.push({ phase, ...value });
  }`;
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), exec', `const root = ${JSON.stringify(root)}, exec`],
    ['from "@playwright/test";', `from ${JSON.stringify(import.meta.resolve("@playwright/test"))};`],
    ...["chromium-private-memory", "owned-runtime-scratch", "private-browser-request"].map(name =>
      [`from "./lib/${name}.mjs";`, `from ${url(name)};`]),
    ['let runtime, chrome, server, browser, page, cdp, sampling = false, failure = null, browserVersion = null;',
      `import { startBoundedJsAllocation, JS_ALLOCATION_SETTINGS, JS_ALLOCATION_LIMITS } from ${url("bounded-js-allocation")};
import { inspectStressHostMemory } from ${url("host-memory-preflight")};
export let completedReport = null, completedReportPath = null;
let host = null, heapSampler = null, stoppedProfileSummary = null;
let runtime, chrome, server, browser, page, cdp, failure = null, browserVersion = null;`],
    [oldSampling, '  if (heapSampler) profiles.push(await heapSampler.sample(phase));'],
    ['  await verifySource(); const disk', '  host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true, "Both physical AND virtual free RAM >=2GiB");\n  await verifySource(); const disk'],
    ['await createOwnedRuntimeScratch("ui-native-allocation-")', 'await createOwnedRuntimeScratch("ui-js-allocation-")'],
    ['  await cdp.send("Memory.startSampling", { samplingInterval: 524288, suppressRandomness: false }); sampling = true;',
      '  heapSampler = await startBoundedJsAllocation(cdp);'],
    ['  await attempt(async () => { if (sampling) { await cdp.send("Memory.stopSampling"); cleanup.samplingStopped = true; } });',
      '  await attempt(async () => { if (heapSampler) { stoppedProfileSummary = await heapSampler.stop(); cleanup.samplingStopped = true; } });'],
    ['for (const file of ["scripts/diagnose-ui-native-allocation.mjs",',
      'for (const file of ["scripts/diagnose-ui-js-allocation.mjs", "scripts/lib/ui-js-allocation-recipe.mjs", "scripts/lib/bounded-js-allocation.mjs", "scripts/lib/host-memory-preflight.mjs", "scripts/diagnose-ui-native-allocation.mjs",'],
    ['scope: "Actual production UI source inspection and60format-selection changes; native allocation/DOM control only"',
      'scope: "Actual unchanged production UI source inspection and60format-selection changes; JS allocation callsite tooling probe only, not conversion"'],
    ['nativeSamplingPerturbsMemory: true, rows, profiles, forbidden,',
      'jsSamplingPerturbsMemory: true, host, settings: JS_ALLOCATION_SETTINGS, limits: JS_ALLOCATION_LIMITS, stoppedProfileSummary, forcedGcUsed: false, nativeAllocationCauseProven: false, rows, profiles, forbidden,'],
    ['-ui-native-allocation.json', '-ui-js-allocation.json'],
    ['console.log(file);', 'completedReport = report; completedReportPath = file; console.log(file);'],
  ];
  let result = source;
  for (const [before, after] of patches) {
    assert.equal(result.split(before).length, 2, before); result = result.replace(before, after);
  }
  let reversed = result;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only profiler, host guard, bindings and provenance changed; real idle workflow/cleanup intact");
  assert.doesNotMatch(result, /Memory\.(?:startSampling|getSamplingProfile|stopSampling)|collectGarbage|prepareForLeakDetection|simulatePressureNotification|forciblyPurge/);
  return result;
}
