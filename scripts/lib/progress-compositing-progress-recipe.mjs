// Full original input and identical JS-copy/native settings; ONLY private progress App/CSS differs.
import assert from "node:assert/strict";
import { makeSplitCopyProgressDriver, makeSplitCopyProgressTraceHelper } from "./split-copy-progress-recipe.mjs";
import { baselineBinding, sha } from "./stable-ui-headless-baseline-recipe.mjs";
export { makeSplitCopyProgressTraceHelper as makeProgressCompositingTraceHelper };
export const progressCompositingFiles = Object.freeze([
  "scripts/diagnose-progress-compositing-original.mjs", "scripts/lib/progress-compositing-progress-recipe.mjs", "tests/progress-compositing-progress.test.mjs",
  "scripts/build-progress-compositing-candidate.mjs", "scripts/lib/progress-compositing-recipe.mjs", "tests/progress-compositing.test.mjs",
  "scripts/lib/retained-split-copy-progress.mjs", "scripts/lib/archived-js-copy-control.mjs", "AGENTS.md",
]);
function patch(source, patches) {
  let value = source;
  for (const [before, after] of patches) { assert.equal(value.split(before).length, 2, before); value = value.replace(before, after); }
  let recovered = value; for (const [before, after] of patches.toReversed()) recovered = recovered.replace(after, before);
  assert.equal(recovered, source, "Original full file/codec/fidelity/native250/settled blank/cleanup gates preserved");
  return value;
}
export function makeProgressCompositingProgressDriver(source, root, helperUri, binding, stylesheet) {
  assert.match(binding.url, /^\/assets\/ConverterApp-[\w-]+\.js$/); assert.notDeepEqual(binding, baselineBinding);
  assert.ok(binding.bytes > 0 && binding.bytes < 1048576); assert.match(binding.sha256, /^[a-f0-9]{64}$/);
  assert.match(stylesheet.url, /^\/assets\/[\w-]+\.css$/); assert.ok(stylesheet.bytes > 0 && stylesheet.bytes < 1048576);
  for (const field of ["sha256", "afterSha256", "matrixCssSha256"]) assert.match(stylesheet[field], /^[a-f0-9]{64}$/);
  assert.equal(stylesheet.afterBytes - stylesheet.bytes, stylesheet.matrixCssBytes);
  const previous = makeSplitCopyProgressDriver(source, root, helperUri, baselineBinding, "baseline");
  const probeLine = previous.generated.match(/^const progressProbe = (.*);$/m); assert.ok(probeLine);
  const probe = { ...JSON.parse(probeLine[1]), mode: "progress-compositing-candidate", expectedAsset: binding,
    expectedStylesheet: stylesheet, originalJsCopyTransport: true, privatelyChangedUiOnly: true };
  const cssLine = previous.generated.match(/^const cssCandidate = \{ css: (.*), staticAssets: \[\], interceptionError: null,$/m); assert.ok(cssLine);
  const historicalCss = JSON.parse(cssLine[1]); assert.equal(sha(historicalCss), stylesheet.matrixCssSha256);
  assert.equal(Buffer.byteLength(historicalCss), stylesheet.matrixCssBytes);
  const scope = previous.generated.match(/^    scope: (".*"),$/m); assert.ok(scope);
  const patches = [
    [probeLine[0], `const progressProbe = ${JSON.stringify(probe)};`],
    ["-private-mpeg2-split-copy-baseline-native-100ms", "-private-mpeg2-progress-compositing-native-100ms"],
    ['"mpeg2-split-copy-baseline-runtime-"', '"mpeg2-progress-compositing-runtime-"'],
    ["const sourceFiles = [", "const sourceFiles = [" + progressCompositingFiles.map(file => JSON.stringify(file) + ",").join("")],
    ['      const body = css + cssCandidate.css;',
      '      const binding = progressProbe.expectedStylesheet;\n' +
      '      assert.equal(new URL(route.request().url()).pathname, binding.url);\n' +
      '      assert.equal(Buffer.byteLength(css), binding.bytes);\n' +
      '      assert.equal(createHash("sha256").update(css).digest("hex"), binding.sha256);\n' +
      '      const body = css + cssCandidate.css;\n' +
      '      assert.equal(Buffer.byteLength(body), binding.afterBytes);\n' +
      '      assert.equal(createHash("sha256").update(body).digest("hex"), binding.afterSha256);'],
    ['import { observeOwnedProcessExit } from ', 'import { queryProcessIdentity, observeOwnedProcessExit } from '],
    ['async function stopOwned(child) {\n  if (child?.pid && child.exitCode == null && child.signalCode == null) {\n    await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { timeout: 15000 });\n  }\n}',
      'const ownedLaunches = [];\nasync function recordLaunch(child, role) {\n' +
      '  const identity = await queryProcessIdentity(child.pid); assert.ok(identity && identity.parentPid === process.pid);\n' +
      '  child.ownedIdentity = identity; ownedLaunches.push({ role, identity });\n}\n' +
      'async function stopOwned(child) {\n  if (child?.pid && child.exitCode == null && child.signalCode == null) {\n' +
      '    const current = await queryProcessIdentity(child.pid);\n    if (!current) return;\n' +
      '    assert.ok(child.ownedIdentity && current.parentPid === child.ownedIdentity.parentPid &&\n' +
      '      Math.abs(Date.parse(current.createdAt) - Date.parse(child.ownedIdentity.createdAt)) <= 1, "Never kill an unrelated or reused PID");\n' +
      '    await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { timeout: 15000 });\n  }\n}'],
    ['  await waitFor(async () => (await fetch(origin)).ok, "production server");',
      '  await recordLaunch(server, "production-server");\n  await waitFor(async () => (await fetch(origin)).ok, "production server");'],
    ['  observer = await startNativeBudgetFailureObserver(chrome.pid, runtime.directory, {',
      '  await recordLaunch(chrome, "headless-chrome-root");\n  observer = await startNativeBudgetFailureObserver(chrome.pid, runtime.directory, {'],
    ['    ownedPids: { chrome: chrome?.pid ?? null,', '    ownedLaunches,\n    ownedPids: { chrome: chrome?.pid ?? null,'],
    [scope[0], '    scope: "Private progress-compositing UI diagnostic, original JS copy transport. FULL unchanged original/codec/defaults/fixed32+16MiB/ALL-process250MiB/same lower five-minute blank;64MiB output or300s diagnostic stop, normal cancellation still FAILS full completion/repeat/fidelity acceptance. Actual new App/CSS bound, identical historic private matrix CSS/native/realm monitoring. No native copy-kernel stacking, allocation profiler or forced GC. Equal-output brackets are partial observations, not causal/full-conversion speed acceptance. Post-cancel dump is NOT peak-time allocation attribution.",'],
  ];
  const generated = patch(previous.generated, patches);
  assert.ok(generated.includes('"--headless=new"') && generated.includes('assert.equal(run.state.jobState, "complete"'));
  assert.ok(!generated.includes('["scripts/stage-split-copy-layout.mjs", "stage"]'));
  assert.ok(generated.includes('["scripts/stage-mpeg2-late-allocator-abort.mjs", "stage"]'));
  return { generated, previous, patches, generatedSha256: sha(generated), expectedAsset: binding, stylesheet };
}
