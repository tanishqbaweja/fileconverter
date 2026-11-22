import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hevcHeaderLoopReference } from "../scripts/lib/mkv-hevc-header-core-reference.mjs";
import { loadQualifiedHeaderNativeCache } from "../scripts/lib/mkv-header-native-cache.mjs";
import { assertExactMkvHeaderArtifact, assertExactMkvHeaderRebuild, privateMkvHeaderPackageLayout } from "../scripts/verify-mkv-hevc-header-reproduction.mjs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = name => readFile(path.join(root, name));

test("reproduction contract compares all source/config/artifact claims to the exact prior qualified build under a different run ID", async () => {
  const b = await read(hevcHeaderLoopReference.file), { candidateBuild: prior } = JSON.parse(b);
  const job = { GITHUB_SHA: "ab".repeat(20), GITHUB_RUN_ID: "123456789" };
  // Unit guard exercise, not a fresh compile or CI receipt.
  const fresh = { ...prior.build, head: job.GITHUB_SHA, runId: job.GITHUB_RUN_ID };
  assert.doesNotThrow(() => assertExactMkvHeaderRebuild(prior, fresh, job));
  assert.throws(() => assertExactMkvHeaderRebuild(prior, prior.build, { GITHUB_SHA: prior.head, GITHUB_RUN_ID: prior.runId }), /new run/);
  assert.throws(() => assertExactMkvHeaderRebuild(prior, { ...fresh, mediaInputs: 1 }, job));
  assert.throws(() => assertExactMkvHeaderRebuild(prior, { ...fresh, wasmMemory: [] }, job));
  assert.throws(() => assertExactMkvHeaderRebuild(prior, { ...fresh, artifacts: { ...fresh.artifacts, "within-direct.wasm": { bytes: 1, sha256: "a".repeat(64) } } }, job));
});

test("actual cached module, wasm and license authenticate independently; package paths stay outside public remux namespace", async () => {
  const cached = await loadQualifiedHeaderNativeCache(root);
  const bodies = [cached.assets.get("/engines/remux/within-direct.mjs").body, cached.assets.get("/engines/remux/within-direct.wasm").body,
    await read("fixtures/qualification-tools/LICENSE.ffmpeg-lgpl3")];
  const layout = privateMkvHeaderPackageLayout();
  for (const [[name, destination], body] of Object.entries(layout).map((entry, i) => [entry, bodies[i]])) {
    assert.match(destination, /^engines\/remux-qualification\/[^/]+$/);
    assertExactMkvHeaderArtifact(body, cached.proof.build.artifacts[name], name);
    const changed = Buffer.from(body); changed[0] ^= 1;
    assert.throws(() => assertExactMkvHeaderArtifact(changed, cached.proof.build.artifacts[name], name), /SHA-256/);
  }
});

test("hosted workflow builds from the guarded native recipe, deletes scratch, and uploads only a compact receipt", async () => {
  const yaml = (await read(".github/workflows/reproduce-corrected-mkv.yml")).toString();
  const builder = (await read("media/ffmpeg/build-mkv-edit-list-candidate.mjs")).toString();
  assert.match(yaml, /branches: \[main, media-options\]/);
  assert.match(yaml, /contents: read/);
  assert.match(yaml, /emsdk" install 6\.0\.4/);
  assert.match(yaml, /build-mkv-edit-list-candidate\.mjs --verify-hevc-header-reproduction/);
  assert.match(yaml, /git diff --exit-code HEAD -- public lib\/capability-registry.ts/);
  assert.match(yaml, /path: \$\{\{ steps.verify.outputs.receipt \}\}/);
  assert.match(yaml, /if: always\(\)[\s\S]*ci-owned-runtime\.mjs cleanup/);
  assert.doesNotMatch(yaml, /docker run|actions\/deploy|actions\/upload-pages|test\.mkv/);
  assert.match(builder, /assert\.equal\(process\.env\.GITHUB_JOB, "corrected-mkv-reproduction"\)/);
});
