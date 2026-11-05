// Source/function checks only; a real patched library build and browser A/B remain required.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { makeVp9RealtimeTemporalFilterFunction, makeVp9RealtimeTemporalFilterSource, VP9_TEMPORAL_SOURCE_SHA256 } from "../media/ffmpeg/vp9-realtime-temporal-filter-recipe.mjs";
const root = new URL("../", import.meta.url), json = async file => JSON.parse(await readFile(new URL(file, root)));
const audit = await json("evidence/2026-11-06-vp9-temporal-filter-source-audit.json"), source = audit.allocation.exactSource;
const sha = value => createHash("sha256").update(value).digest("hex");
test("pinned public source audit checked all880C/header files and all four buffer reference files", () => {
  assert.equal(audit.source.archiveSha256, "7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c");
  assert.equal(audit.source.cFiles, 880); assert.equal(audit.references.length, 4); assert.equal(audit.allocation.sourceSha256, VP9_TEMPORAL_SOURCE_SHA256);
  assert.equal(audit.filterCallSites.length, 2); assert.ok(audit.filterCallSites.every(row => row.context.includes("!= REALTIME")));
  assert.equal(audit.userMediaReadOrConverted, false); assert.equal(audit.generatedSourceCopiesOnDisk, 0);
});
test("proposed allocation guard is one exact reversible expression and leaves actual allocator/error/lag-buffer code unchanged", () => {
  const result = makeVp9RealtimeTemporalFilterFunction(source), [[before, after]] = result.edits;
  assert.equal(result.parentSha256, sha(source)); assert.equal(result.generatedSha256, sha(result.generated));
  assert.equal(after.replace("  if ((oxcf->mode != REALTIME || oxcf->lag_in_frames != 0) &&\n      vpx_realloc_frame_buffer", "  if (vpx_realloc_frame_buffer"), before);
  assert.equal(result.edits.length, 1); assert.ok(result.generated.includes("Failed to allocate temporal filter buffer"));
  assert.ok(result.generated.includes("vp9_lookahead_init"));
  for (const field of ["codecSettingsChanged", "filteringAlgorithmsChanged", "ioChanged", "memoryLimitsRaised", "nativeBuildExecuted", "browserValidated", "speedGainProven", "publicAcceptance"])
    assert.equal(result[field], false);
  assert.equal(result.exactAllocationBytesSaved, null);
});
test("guard truth table skips only realtime zero-lag; it is not a compiled-code or quality claim", () => {
  const result = makeVp9RealtimeTemporalFilterFunction(source);
  assert.ok(result.generated.includes("(oxcf->mode != REALTIME || oxcf->lag_in_frames != 0) &&"));
  for (const realtime of [false, true]) for (const lag of [-1, 0, 1, 25])
    assert.equal(!realtime || lag !== 0, !(realtime && lag === 0));
});
test("unpinned/altered vendor function and whole-file source fail closed before any generation", () => {
  assert.throws(() => makeVp9RealtimeTemporalFilterFunction(source.replace("oxcf->lag_in_frames", "other_lag")), /exact archive-authenticated/);
  assert.throws(() => makeVp9RealtimeTemporalFilterSource(source), /Vendor source must match/);
});
