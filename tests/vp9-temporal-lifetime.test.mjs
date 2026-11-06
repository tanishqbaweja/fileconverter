import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { VP9_TEMPORAL_LIFETIME_PINS, verifyVp9TemporalLifetimeSources } from "../media/ffmpeg/vp9-temporal-lifetime.mjs";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root), "utf8");
test("pinned archive lifetime audit records zero initialization, empty cleanup, and realtime config", async () => {
  const audit = JSON.parse(await read("evidence/2026-11-06-vp9-temporal-filter-lifetime-audit.json"));
  assert.equal(audit.archiveSha256, "7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c");
  assert.equal(audit.cFiles, 880);
  for (const field of ["encoder", "codecInterface", "frameFree", "allocatorFree"])
    assert.equal(audit[field].sha256, VP9_TEMPORAL_LIFETIME_PINS[audit[field].file]);
  const contexts = field => audit[field].matches.map(row => row.context).join("\n");
  assert.ok(contexts("encoder").includes("vp9_zero(*cpi);"));
  assert.ok(contexts("encoder").includes("vpx_free_frame_buffer(&cpi->tf_buffer);"));
  assert.ok(contexts("codecInterface").includes("new_mode = REALTIME;"));
  assert.ok(contexts("frameFree").includes("if (ybf->buffer_alloc_sz > 0)"));
  assert.match(contexts("allocatorFree"), /void vpx_free\(void \*memblk\) \{\s*if \(memblk\)/);
  assert.equal(audit.publicAcceptance, false);
});
test("lifetime verifier rejects missing and unpinned full sources before any patch", () => {
  assert.throws(() => verifyVp9TemporalLifetimeSources({}), /vp9_encoder/);
  assert.throws(() => verifyVp9TemporalLifetimeSources({ "vp9/encoder/vp9_encoder.c": "vp9_zero(*cpi);" }), /Pinned lifetime source/);
});
test("build patch verifies actual files before writing and precedes libvpx compilation", async () => {
  const script = await read("media/ffmpeg/make-vp9-temporal-filter-source.mjs");
  assert.ok(script.indexOf("verifyVp9TemporalLifetimeSources(sources)") < script.indexOf("await writeFile("));
  assert.ok(script.includes("runVp9TemporalCUnit(recipe.edits[0][0])"));
  assert.ok(script.includes("assert.equal(await realpath(target), target)"));
  const builder = await read("media/ffmpeg/build-vp9-duration-candidate.mjs");
  assert.ok(builder.includes("{ temporalFilterGuard: true, allocationDiagnostics, lazyUtility }"));
  assert.ok(builder.includes('const privateEngine=lazyUtility?"private-vp9-lazy-utility":allocationDiagnostics?"private-vp9-allocation-diagnostic":"private-vp9-realtime-temporal"'));
  assert.ok(builder.includes("readWasmMemoryLimits(await read(\"public/engines/remux/within-remux.wasm\"))"));
});
