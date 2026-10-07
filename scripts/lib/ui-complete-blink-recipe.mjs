// Reuse the actual source-inspection/60-selection workflow without the old
// sparse unresolved native-address sampler. No fake conversion or forced GC.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function makeUiCompleteBlinkControl(source, root, helperUrl) {
  assert.equal(sha(source), "76b50f530ee0d117064be896c1051893db1ef4c875418915e86a353653e72974");
  assert.ok(helperUrl.startsWith("file:"));
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
    ...["chromium-private-memory", "owned-runtime-scratch", "private-browser-request"].map(name =>
      [`from "./lib/${name}.mjs";`, `from ${url(name)};`]),
    ['let runtime, chrome, server, browser, page, cdp, sampling = false, failure = null, browserVersion = null;',
      `import { connectRealmSampler } from ${url("cdp-realm-memory")};
import { startBoundedRendererAttribution } from ${JSON.stringify(helperUrl)};
export let completedReport = null, completedReportPath = null;
let realms, attribution, traceReport = null;
let runtime, chrome, server, browser, page, cdp, failure = null, browserVersion = null;`],
    ['const rows = [], forbidden = [], cleanupErrors = [], profiles = [];', 'const rows = [], forbidden = [], cleanupErrors = [];'],
    [oldSampling, '  if (attribution) await attribution.dump(phase, tree.processes);'],
    ['await createOwnedRuntimeScratch("ui-native-allocation-")', 'await createOwnedRuntimeScratch("ui-complete-blink-")'],
    ['  await snapshot("blank-ui-control-only");', `  const debugVersion = await (await fetch(\`http://127.0.0.1:\${debugPort}/json/version\`)).json();
  realms = await connectRealmSampler(debugVersion.webSocketDebuggerUrl, origin);
  attribution = await startBoundedRendererAttribution(cdp, realms);
  await snapshot("blank-ui-control-only");`],
    ['  await cdp.send("Memory.startSampling", { samplingInterval: 524288, suppressRandomness: false }); sampling = true;', '  // Already tracing; preserve the seven original snapshot phases.'],
    ['  await attempt(async () => { if (sampling) { await cdp.send("Memory.stopSampling"); cleanup.samplingStopped = true; } });',
      `  await attempt(async () => { if (attribution) { traceReport = await attribution.stop();
    assert.equal(traceReport.status, "completed-diagnostic"); cleanup.samplingStopped = true; } });
  await attempt(async () => { realms?.close(); });`],
    ['for (const file of ["scripts/diagnose-ui-native-allocation.mjs",',
      'for (const file of ["scripts/diagnose-ui-complete-blink.mjs", "scripts/lib/ui-complete-blink-recipe.mjs", "scripts/lib/complete-blink-attribution-recipe.mjs", "scripts/lib/complete-blink-heap-summary.mjs", "scripts/lib/bounded-renderer-attribution.mjs", "scripts/lib/cdp-realm-memory.mjs", "scripts/diagnose-ui-native-allocation.mjs",'],
    ['scope: "Actual production UI source inspection and60format-selection changes; native allocation/DOM control only"',
      'scope: "Actual production UI source inspection and60format-selection changes; complete brief Blink heap/DOM control only"'],
    ['nativeSamplingPerturbsMemory: true, rows, profiles, forbidden,', 'nativeSamplingPerturbsMemory: true, noForcedGc: true, rows, traceReport, forbidden,'],
    ['-ui-native-allocation.json', '-ui-complete-blink.json'],
    ['console.log(file);', 'completedReport = report; completedReportPath = file; console.log(file);'],
  ];
  let generated = source;
  for (const [before, after] of patches) {
    assert.equal(generated.split(before).length, 2, before);
    generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only explicit measurement/binding/provenance changes; real workflow unchanged");
  return generated;
}
