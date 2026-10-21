import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeVpxDecoderLibraries, makeVpxDecoderBuildRecipe, verifyVpxDecoderComponents } from "../media/ffmpeg/vpx-decoder-candidate.mjs";
import { makeVpxDecoderBuildWorkflow } from "../scripts/lib/vpx-decoder-build-workflow.mjs";

test("private software decode configuration adds only VP8/VP9 decoders and parsers without changing encoders", async () => {
  const source = await readFile("media/ffmpeg/build-libraries.sh", "utf8"), candidate = makeVpxDecoderLibraries(source);
  assert.equal(candidate.edits.length, 2); assert.equal(candidate.publicAcceptance, false);
  for (const [before, after] of candidate.edits) assert.equal(after, before + ",vp8,vp9");
  assert.throws(() => makeVpxDecoderLibraries(source + "\n"));
});
test("private build preserves actual wrapper/link/heap/I/O steps and never compares changed artifacts to public", async () => {
  const recipe = makeVpxDecoderBuildRecipe(await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"));
  assert.equal(recipe.edits.length, 5); assert.equal(recipe.publicAcceptance, false);
  assert.match(recipe.generated, /bash "\$\{BUILD_ROOT\}\/build-libraries.vpx.sh"/);
  assert.match(recipe.generated, /config_components.h/); assert.match(recipe.generated, /within_remux.vpx.c/);
  assert.doesNotMatch(recipe.generated, /comparison_files=\(\)/);
  const builder = await readFile("media/ffmpeg/build-vpx-decoder-candidate.mjs", "utf8");
  for (const anchor of ["VPX_COMPILED_WRAPPER_SHA256", "verifyVpxDecoderComponents", "assert.deepEqual(limits", "windowsHide: true", "finally { await runtime.close(); }", "browserDecodeVerified: false", "memoryLimitsRaised: false"]) assert.ok(builder.includes(anchor), anchor);
});
test("actual FFmpeg components must prove both CPU decoders/parsers; no guessed AV1 or external decode coverage", () => {
  const enabled = ["VP8_DECODER", "VP9_DECODER", "VP8_PARSER", "VP9_PARSER"], disabled = ["LIBVPX_VP8_DECODER", "LIBVPX_VP9_DECODER", "AV1_DECODER", "LIBDAV1D_DECODER", "LIBAOM_AV1_DECODER"];
  const source = [...enabled.map(name => `#define CONFIG_${name} 1`), ...disabled.map(name => `#define CONFIG_${name} 0`)].join("\n");
  assert.equal(verifyVpxDecoderComponents(source).av1Implemented, false);
  for (const name of enabled) assert.throws(() => verifyVpxDecoderComponents(source.replace(`CONFIG_${name} 1`, `CONFIG_${name} 0`)));
  for (const name of disabled) assert.throws(() => verifyVpxDecoderComponents(source.replace(`CONFIG_${name} 0`, `CONFIG_${name} 1`)));
  assert.throws(() => verifyVpxDecoderComponents(""));
});
test("private workflow changes only general-core dispatch/upload while keeping pinned SDK and cleanup", async () => {
  const source = await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"), workflow = makeVpxDecoderBuildWorkflow(source);
  assert.equal(workflow.edits.length, 2); assert.equal(workflow.publicAcceptance, false);
  assert.equal(workflow.originalSdkDependencyAndCleanupStepsRetained, true);
  assert.match(workflow.generated, /private-vpx-decoders-/); assert.match(workflow.generated, /retention-days: 1/);
  assert.throws(() => makeVpxDecoderBuildWorkflow(source + "\n"));
});
