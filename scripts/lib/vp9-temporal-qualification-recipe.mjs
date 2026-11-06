// Derive from the authenticated prior recovery control; never edit its evidence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
export const VP9_TEMPORAL_EXPECTED_OUTPUT_SHA256 = "82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b";
export function makeVp9TemporalQualificationSource(source, nativeRunId, { allocationDiagnostics = false,lazyUtility=false,tokenContext=false,baselinePreflight=false } = {}) {
  assert.equal(typeof allocationDiagnostics, "boolean");
  assert.equal(typeof lazyUtility,"boolean");assert.ok(!lazyUtility||allocationDiagnostics);
  assert.equal(typeof tokenContext,"boolean");assert.ok(!tokenContext||lazyUtility);
  assert.equal(typeof baselinePreflight,"boolean");assert.ok(!baselinePreflight||tokenContext);
  assert.match(nativeRunId, /^\d{8,14}$/);
  assert.ok(!["42020605269", "42122918540"].includes(nativeRunId), "Guard requires a distinct source-built tool");
  if (allocationDiagnostics) assert.notEqual(nativeRunId, "42129383089", "Diagnostic control requires its own compiled tool");
  if(lazyUtility)assert.notEqual(nativeRunId,"42135708757","Lazy utility control requires its own compiled tool");
  if(tokenContext)assert.notEqual(nativeRunId,"42218018139","Token context control requires its own compiled tool");
  assert.equal(sha(source), "2bfe61340010c01418df2e6c8bf85612b854d135ffc2f814efbebd10e79ec812");
  const edits = [], parentSha256 = sha(source);
  const add = (before, after) => { assert.equal(source.split(before).length, 2, before); edits.push([before, after]); source = source.replace(before, after); };
  for (const ending of [".json", "-failure.zip"]) add("2026-11-05-webcodecs-vp9-recovery-qualification-42020605269" + ending,
    "2026-11-06-vp9-" + (tokenContext?"token":lazyUtility?"lazy":allocationDiagnostics ? "allocation" : "temporal") + "-qualification-" + nativeRunId + (baselinePreflight?"-attempt2":"") + ending);
  if(baselinePreflight)add('  report.baselineAdjusted = false; report.baselineAvailable = report.blankBaseline?.stable === true;\n' +
    '  if (!report.baselineAvailable) report.failures.push("Earliest stable blank baseline unavailable; collect functional facts, retain overall failure and null incremental memory");',
    '  assert.equal(report.blankBaseline?.stable, true, "Stable blank required before loading the app or converting on the one baseline retry; same window/threshold, no extension");\n'+
    '  report.baselineAdjusted = false; report.baselineAvailable = true;');
  add("evidence/2026-11-05-vp9-duration-native-42020605269.json", "evidence/2026-11-06-vp9-original-width-native-" + nativeRunId + ".json");
  for (const extension of ["mjs", "wasm"]) add("work/vp9-duration-input-42020605269/within-remux." + extension,
    "work/vp9-duration-input-" + nativeRunId + "/within-remux." + extension);
  add('loadVp9DurationCpuAssets(root, "42020605269")', 'loadVp9DurationCpuAssets(root, ' + JSON.stringify(nativeRunId) + ', "original-width")');
  add('  report.outputSha256 = await hashFile(converted);', '  report.outputSha256 = await hashFile(converted);\n' +
    '  report.temporalAllocationGuard = { nativeRunId: ' + JSON.stringify(nativeRunId) + ', lazyUtilityStorage: '+lazyUtility+(tokenContext?', tokenContextStorage: true':'')+', failureOnlyAllocationDiagnostics: ' + allocationDiagnostics + ', bitExactComparedWithUnmodifiedLibvpx: false, speedGainProven: false };\n' +
    '  assert.equal(report.fixture.sha256, "4fad7ea6c1dd0d374b1b69201b6af4b68e8518bf2672884d23b1f136f5f2cc46");\n' +
    '  assert.equal(report.outputSha256, ' + JSON.stringify(VP9_TEMPORAL_EXPECTED_OUTPUT_SHA256) + ', "Same pinned input/settings must remain byte-exact with unmodified libvpx");\n' +
    '  report.temporalAllocationGuard.bitExactComparedWithUnmodifiedLibvpx = true;');
  let reversed = source;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(sha(reversed), parentSha256);
  return { generated: source, parentSha256, generatedSha256: sha(source), edits, reversible: true, nativeRunId,
    expectedOutputSha256: VP9_TEMPORAL_EXPECTED_OUTPUT_SHA256, allocationDiagnostics,lazyUtility,tokenContext,baselinePreflight, preservesStrictFidelityAndRecoveryGates: true,
    changesBaselineFormulaOrLimit: false, speedGainProven: false, originalOrLargeFileAcceptance: false, publicAcceptance: false };
}
