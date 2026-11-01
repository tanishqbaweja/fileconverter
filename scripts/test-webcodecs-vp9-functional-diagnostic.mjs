// Exact reversible diagnostic: collect previously unreached real conversion
// facts before applying the SAME baseline/memory verdict. No acceptance bypass.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const rebuiltCpuFallback = process.argv[2] === "--rebuilt-cpu-fallback";
const rebuiltNative = process.argv[2] === "--rebuilt-native" || rebuiltCpuFallback;
const preferenceFallbackFixture = process.argv[2] === "--encoder-preference-fallback" || rebuiltNative;
const frameColorFixture = process.argv[2] === "--frame-color-fixture" || (preferenceFallbackFixture && !rebuiltCpuFallback);
const explicitColorFixture = process.argv[2] === "--explicit-color-fixture" || frameColorFixture;
const nativeColorDiagnostic = process.argv[2] === "--native-color-diagnostic" || explicitColorFixture || rebuiltCpuFallback;
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && nativeColorDiagnostic));
const root = path.resolve(import.meta.dirname, ".."), sha = x => createHash("sha256").update(x).digest("hex");
const outputLabel = rebuiltCpuFallback ? "rebuilt-cpu-fallback" : rebuiltNative ? "rebuilt-native" :
  preferenceFallbackFixture ? "encoder-preference-fallback" : frameColorFixture ? "frame-color-fixture" :
  explicitColorFixture ? "explicit-color-fixture" : "native-color-diagnostic";
const source = await readFile(path.join(root, "scripts/test-webcodecs-vp9-smoke.mjs"), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-first-smoke.json")));
assert.equal(sha(source), prior.sourcePins["scripts/test-webcodecs-vp9-smoke.mjs"]);
assert.equal(prior.status, "failed-private-vp9-browser-smoke"); assert.equal(prior.browserResult, undefined);
assert.equal(prior.blankBaseline, null); assert.equal(prior.ownedRuntimeRemoved, true);
const edits = [[ 'import "./lib/hidden-unit-subprocesses.mjs";',
  'import ' + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href) + ';' ],
  ...[...source.matchAll(/from "(\.\/lib\/[a-z0-9-]+\.mjs)"/g)].map(match =>
  [match[0], "from " + JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)])];
edits.push(
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
  ['evidence/2026-11-01-webcodecs-vp9-first-smoke.json', 'evidence/2026-11-01-webcodecs-vp9-functional-diagnostic.json'],
  ['2026-11-01-webcodecs-vp9-first-smoke-failure.zip', '2026-11-01-webcodecs-vp9-functional-diagnostic-failure.zip'],
  ['  assert.equal(report.blankBaseline?.stable, true); report.baselineAdjusted = false;',
    '  report.baselineAdjusted = false; report.baselineAvailable = report.blankBaseline?.stable === true;\n' +
    '  if (!report.baselineAvailable) report.failures.push("Earliest stable blank baseline unavailable; collect functional facts, retain overall failure and null incremental memory");'],
  ['incrementalPrivateMiB: peaks.peak ? (peaks.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 : null',
    'incrementalPrivateMiB: peaks.peak && report.blankBaseline ? (peaks.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 : null'],
  ['  assert.ok(peaks.validSamples > 0 && peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250);',
    '  assert.equal(report.blankBaseline?.stable, true, "Stable blank baseline remains required; no smaller metric substitutes");\n' +
    '  assert.ok(peaks.validSamples > 0 && peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250);'],
);
if (nativeColorDiagnostic) {
  edits[edits.findIndex(([before]) => before === 'evidence/2026-11-01-webcodecs-vp9-first-smoke.json')][1] =
    'evidence/2026-11-01-webcodecs-vp9-' + outputLabel + '.json';
  edits[edits.findIndex(([before]) => before === '2026-11-01-webcodecs-vp9-first-smoke-failure.zip')][1] =
    '2026-11-01-webcodecs-vp9-' + outputLabel + '-failure.zip';
  edits.push(['  report.fixture = { generatedBeforeBrowser: true,',
    '  report.sourceProbe = JSON.parse((await execute(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", fixture],\n' +
    '    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout);\n' +
    '  report.fixture = { generatedBeforeBrowser: true,']);
}
if (explicitColorFixture) {
  edits.push(['"-color_range", "tv", fixture];',
    frameColorFixture ? '"-color_range", "tv", "-vf", "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv", fixture];' :
      '"-color_range", "tv", "-bsf:v", "h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1", fixture];']);
  const probeEnd = '    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout);\n';
  edits.push([probeEnd, probeEnd +
    '  assert.equal(report.sourceProbe.streams.length, 1);\n' +
    '  const sourceColor = report.sourceProbe.streams[0];\n' +
    '  assert.deepEqual([sourceColor.color_primaries, sourceColor.color_transfer, sourceColor.color_space, sourceColor.color_range], ["bt709", "bt709", "bt709", "tv"], "Verify actual source metadata before launching Chromium");\n']);
}
if (rebuiltNative) {
  edits.push(
    ['evidence/2026-11-01-webcodecs-vp9-native-41305653513.json', 'evidence/2026-11-01-webcodecs-vp9-native-41309113218.json'],
    ['work/webcodecs-vp9-input-41305653513', 'work/webcodecs-vp9-input-41309113218'],
    ['  assert.equal(native.publicAcceptance, false); const input = path.resolve(root, native.retainedDirectory);',
      '  report.nativeTool = { runId: native.runId, head: native.head, wasm: native.nativeContract.artifacts["within-webcodecs-vp9.wasm"] };\n' +
      '  assert.equal(native.publicAcceptance, false); const input = path.resolve(root, native.retainedDirectory);'],
  );
}
if (rebuiltCpuFallback) {
  edits.push(
    ['implementation: "candidate",', 'implementation: "automatic",'],
    ['  assert.equal(report.browserResult.encoder.frames, 48); assert.equal(report.browserResult.encoder.packets, 48);',
      '  assert.equal(report.browserResult.selection.backend, "wasm");\n' +
      '  assert.match(report.browserResult.selection.fallbackReason, /native CICP primaries\\/transfer\\/matrix\\/range=2\\/2\\/1\\/1/);\n' +
      '  assert.equal(report.browserResult.encoder.frames, 0); assert.equal(report.browserResult.encoder.packets, 0);'],
  );
}
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
assert.equal(reversed, source);
assert.doesNotMatch(generated, /(?:from\s+|import\s+)["']\.\//, "No unresolved relative import may remain in the owned generated location");
const recipe = { scope: "Collect previously unreached real conversion facts; all original verdicts retained, not acceptance relaxation",
  parentSha256: sha(source), generatedSha256: sha(generated), edits, reversible: true, publicAcceptance: false,
  baselineFormulaChanged: false, baselineWindowOrThresholdChanged: false, nativeOrCodecSettingsChanged: preferenceFallbackFixture,
  changedEncoderSetting: rebuiltNative ? "Rebuilt native error mapping; same video controls and checked platform preference fallback" :
    preferenceFallbackFixture ? "hardwareAcceleration preference only; no video dimensions/bitrate/timing/quality change" : null,
  nativeErrorMappingRebuilt: rebuiltNative, controlledCpuFallbackExercised: rebuiltCpuFallback,
  usesConfigurationCheckedPlatformPreferenceFallback: preferenceFallbackFixture,
  fixtureBitstreamColorMetadataCorrected: explicitColorFixture,
  fixtureFrameColorMetadataAssigned: frameColorFixture,
  generatedSourceGzipBase64: gzipSync(generated, { level: 9 }).toString("base64") };
const recipeName = rebuiltNative ? "2026-11-01-webcodecs-vp9-" + outputLabel + "-recipe.json" :
  preferenceFallbackFixture ? "2026-11-01-webcodecs-vp9-encoder-preference-fallback-recipe.json" :
  frameColorFixture ? "2026-11-01-webcodecs-vp9-frame-color-fixture-recipe.json" :
  explicitColorFixture ? "2026-11-01-webcodecs-vp9-explicit-color-fixture-recipe.json" :
  nativeColorDiagnostic ? "2026-11-01-webcodecs-vp9-native-color-diagnostic-recipe.json" :
  "2026-11-01-webcodecs-vp9-functional-diagnostic-recipe-repaired.json";
await writeFile(path.join(root, "evidence", recipeName), JSON.stringify(recipe, null, 2) + "\n", { flag: "wx" });
const runtime = await createOwnedRuntimeScratch("webcodecs-vp9-diagnostic-");
try {
  const file = path.join(runtime.directory, "diagnostic.mjs"); await writeFile(file, generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => {
    if (signal) reject(new Error("Owned diagnostic interrupted: " + signal)); else resolve(code ?? 1);
  }); });
} finally { await runtime.close(); }
