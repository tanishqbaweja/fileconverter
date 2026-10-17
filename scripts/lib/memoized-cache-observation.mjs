import assert from "node:assert/strict";
import { inspectWarmCacheFailure } from "./warm-cache-observation.mjs";

export function inspectMemoizedCacheFailure(terminal, report, previousReport, build, previousBuild) {
  assert.equal(build.displayTreeMemoization, true);
  assert.equal(build.originalJsxAndControlsPreserved, true);
  assert.equal(build.compiledModuleReuse, true);
  assert.equal(build.maximumCompiledCodecModules, 2);
  for (const key of ["codecParametersChanged", "nativeWasmChanged", "progressSamplingChanged", "normalSourcesEdited"])
    assert.equal(build[key], false);
  const app = build.assets.find(row => row.role === "application");
  assert.equal(build.assets.filter(row => row.role === "application").length, 1);
  assert.equal(app.bytes, 322929);
  assert.equal(app.sha256, "b25a87194b6c7a73846daf04581cf038b34564f24847176afe70980718ae82ae");
  const binding = ({ url, bytes, sha256 }) => ({ url, bytes, sha256 });
  assert.deepEqual(report.progressProbe.actualServedAsset, binding(app));
  assert.deepEqual(report.progressProbe.expectedAsset, binding(app));
  assert.notEqual(app.sha256, previousBuild.assets.find(row => row.role === "application").sha256);
  assert.deepEqual(build.assets.filter(row => row.role !== "application").map(binding),
    previousBuild.assets.filter(row => row.role !== "application").map(binding));
  // Reuse the earlier validator's output, memory, recovery and cleanup assertions.
  // Its byte-identical-build assertion receives a comparison object with the one
  // explicitly allowed app difference. Neither actual build nor served report is modified.
  const comparison = { ...previousBuild, assets: previousBuild.assets.map(row => row.role === "application" ? app : row) };
  const result = inspectWarmCacheFailure(terminal, report, previousReport, build, comparison);
  return { ...result, intentionalDifference: "display-tree memoization only; compiled cache already present in comparison",
    servedCombinedAppValidated: true, workersAndCssUnchanged: true, combinedCandidateSufficient: false };
}
