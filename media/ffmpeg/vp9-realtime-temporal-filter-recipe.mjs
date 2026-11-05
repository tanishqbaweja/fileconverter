// PRIVATE allocation-only candidate; no bitstream algorithm/settings change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
export const VP9_TEMPORAL_SOURCE_SHA256 = "c42b8ef0665831f40715eca748bf7cecfcc98dd212927bbfe042a355c6fc3faa";
export const VP9_TEMPORAL_FUNCTION_SHA256 = "24aecc5a9e2a7ca42cb8a3f724a88d5b18dbf0ebe1e9f09acbc7eb3621b3328a";
export function makeVp9RealtimeTemporalFilterFunction(source) {
  assert.equal(sha(source), VP9_TEMPORAL_FUNCTION_SHA256, "Only the exact archive-authenticated allocation function is eligible");
  const anchor = "  if (vpx_realloc_frame_buffer(&cpi->tf_buffer, oxcf->width, oxcf->height,\n";
  assert.equal(source.split(anchor).length, 2);
  const generated = source.replace(anchor,
    "  if ((oxcf->mode != REALTIME || oxcf->lag_in_frames != 0) &&\n" +
    "      vpx_realloc_frame_buffer(&cpi->tf_buffer, oxcf->width, oxcf->height,\n");
  assert.equal(generated.replace("  if ((oxcf->mode != REALTIME || oxcf->lag_in_frames != 0) &&\n      vpx_realloc_frame_buffer", "  if (vpx_realloc_frame_buffer"), source);
  return { generated, parentSha256: sha(source), generatedSha256: sha(generated), edits: [[source, generated]],
    scope: "Private skip of unused temporal-filter frame allocation ONLY for existing REALTIME zero-lag mode",
    sourceAudit: "evidence/2026-11-06-vp9-temporal-filter-source-audit.json",
    codecSettingsChanged: false, filteringAlgorithmsChanged: false, nonRealtimeAndNonzeroLagUnchanged: true,
    ioChanged: false, memoryLimitsRaised: false, nativeBuildExecuted: false, browserValidated: false,
    exactAllocationBytesSaved: null, speedGainProven: false, publicAcceptance: false };
}
export function makeVp9RealtimeTemporalFilterSource(source) {
  assert.equal(sha(source), VP9_TEMPORAL_SOURCE_SHA256, "Vendor source must match the pinned1.16.0 archive, not an unverified branch or cached page");
  const start = source.indexOf("static void alloc_raw_frame_buffers(VP9_COMP *cpi) {"), end = source.indexOf("static void alloc_util_frame_buffers", start);
  assert.ok(start > 0 && end > start); const before = source.slice(start, end), recipe = makeVp9RealtimeTemporalFilterFunction(before);
  const generated = source.slice(0, start) + recipe.generated + source.slice(end);
  assert.equal(generated.replace(recipe.generated, before), source);
  return { ...recipe, generated, parentSha256: sha(source), generatedSha256: sha(generated) };
}
