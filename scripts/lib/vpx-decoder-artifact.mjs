import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { makeVpxDecoderLibraries, makeVpxDecoderBuildRecipe, verifyVpxDecoderComponents, VPX_COMPILED_WRAPPER_SHA256 } from "../../media/ffmpeg/vpx-decoder-candidate.mjs";
import { makeVpxDecoderBuildWorkflow } from "./vpx-decoder-build-workflow.mjs";
import { readWasmMemoryLimits } from "./wasm-memory-limits.mjs";
import { readEmscriptenExportAbi } from "./wasm-export-abi.mjs";
import { makeVpxPreservingSource, makeVpxPreservingRecipe, makeVpxPreservingWorkflow, makeVpxPreservingLibraries, verifyVpxSpecialistComponents } from "../../media/ffmpeg/vpx-preserving-candidate.mjs";
import { reverseVpxAuditDeclarationCorrection, verifyVpxRecoveryProvenance } from "./vpx-postbuild-recovery.mjs";
import { makeVpxAacSource, makeVpxAacMuxSource, makeVpxAacRecipe, makeVpxAacWorkflow } from "../../media/ffmpeg/vpx-aac-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const readTool = async file => { const info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 32 * 1024 ** 2); return readFile(file); };
export async function auditVpxDecoderArtifact(input) {
  const directory = await realpath(path.resolve(input)), work = await realpath(path.join(root, "work"));
  assert.equal(path.dirname(directory), work); assert.equal(directory.toLowerCase(), path.resolve(input).toLowerCase());
  let manifestName = "build-manifest.json";
  try { await lstat(path.join(directory, "qualification-manifest.json")); manifestName = "qualification-manifest.json"; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const raw = await readTool(path.join(directory, manifestName)); assert.ok(raw.length <= 2 * 1024 ** 2);
  const manifest = JSON.parse(raw), pub = JSON.parse(await readTool(path.join(root, "public/engines/remux/build-manifest.json")));
  const exactAac = manifest.engine === "within-remux-private-vpx-aac-editlist";
  const specialist = exactAac || manifest.engine === "within-remux-private-vpx-preserving-specialist";
  const preserving = specialist || manifest.engine === "within-remux-private-vpx-preserving";
  assert.ok(preserving || manifest.engine === "within-remux-private-vpx-software-decoders");
  const candidate = manifest.candidate; assert.equal(candidate.configureEdits, specialist ? 3 : 2);
  const recovery = candidate.postBuildAuditRecovery;
  if (manifestName === "qualification-manifest.json") {
    assert.ok(specialist && !exactAac && recovery); verifyVpxRecoveryProvenance(recovery);
    assert.equal(sha(await readTool(path.join(directory, "build-manifest.json"))), recovery.originalManifestSha256);
  } else assert.equal(recovery, undefined);
  assert.equal(candidate.wrapperChanged, preserving);
  for (const flag of ["encoderSettingsChanged", "ioChanged", "memoryLimitsRaised", "browserDecodeVerified", "publicAcceptance"]) assert.equal(candidate[flag], false, flag);
  assert.ok(Object.keys(manifest.sources).length > 10 && Object.keys(manifest.sources).length <= 128);
  assert.ok(Object.keys(manifest.artifacts).length > 3 && Object.keys(manifest.artifacts).length <= 64);
  for (const [file, expected] of Object.entries(manifest.artifacts)) {
    assert.match(file, /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:mjs|wasm|sh|c|h)|build-manifest\.json|LICENSE\.[A-Za-z0-9_.-]+)$/);
    assert.equal(sha(await readTool(path.join(directory, file))), expected, file);
  }
  for (const [file, expected] of Object.entries(manifest.sources)) {
    assert.match(file, /^(?:media|scripts|\.github)\/[A-Za-z0-9_./-]+$/); assert.ok(!file.split("/").includes(".."));
    let bytes = await readTool(path.join(root, file));
    if (recovery && file === "media/ffmpeg/vpx-preserving-candidate.mjs") bytes = Buffer.from(reverseVpxAuditDeclarationCorrection(bytes.toString()));
    const actual = file === ".github/workflows/reproduce-ffmpeg-nondocker.yml"
      ? (exactAac ? makeVpxAacWorkflow(bytes.toString()) : preserving ? makeVpxPreservingWorkflow(bytes.toString()) : makeVpxDecoderBuildWorkflow(bytes.toString())).generatedSha256 : sha(bytes);
    assert.equal(actual, expected, "Build source changed: " + file);
  }
  const base = (await readTool(path.join(directory, "build-libraries.base.sh"))).toString();
  assert.equal(base, (await readTool(path.join(root, "media/ffmpeg/build-libraries.sh"))).toString());
  const libraries = specialist ? makeVpxPreservingLibraries(base) : makeVpxDecoderLibraries(base);
  assert.equal((await readTool(path.join(directory, "build-libraries.vpx.sh"))).toString(), libraries.generated);
  assert.equal(candidate.generatedLibrariesSha256, libraries.generatedSha256);
  const recipeSource = (await readTool(path.join(root, "media/ffmpeg/reproduce-nondocker.sh"))).toString();
  assert.equal(candidate.generatedRecipeSha256, (exactAac ? makeVpxAacRecipe(recipeSource) : preserving ? makeVpxPreservingRecipe(recipeSource) : makeVpxDecoderBuildRecipe(recipeSource)).generatedSha256);
  const compiled = await readTool(path.join(directory, "within_remux.vpx.c"));
  if (preserving) {
    const derive = exactAac ? makeVpxAacSource : makeVpxPreservingSource;
    const derived = derive((await readTool(path.join(directory, "within_remux.vpx-base.c"))).toString());
    assert.equal(compiled.toString(), derived.generated); assert.equal(candidate.preservationParentSha256, VPX_COMPILED_WRAPPER_SHA256);
    assert.equal(candidate.preservationSourceEdits, derived.edits.length);
    for (const key of ["maxStreams", "maxChapters", "maxInterleaveUs", "maxFragmentBytes", "maxFragmentUs", "delayedMoov", "exactAacPriming"])
      assert.equal(candidate[key], derived[key]);
  } else assert.equal(sha(compiled), VPX_COMPILED_WRAPPER_SHA256);
  assert.equal(candidate.compiledSourceSha256, sha(compiled));
  if (exactAac) {
    assert.equal(candidate.exactAacEditList, true);
    const mux = makeVpxAacMuxSource((await readTool(path.join(directory, "movenc.vpx-base.c"))).toString(),
      (await readTool(path.join(root, "media/ffmpeg/patches/mov-fragmented-aac-exact-priming.patch"))).toString());
    assert.equal((await readTool(path.join(directory, "movenc.vpx-aac.c"))).toString(), mux.generated);
    assert.equal(candidate.muxSourceSha256, mux.generatedSha256); assert.equal(candidate.muxParentSha256, mux.parentSha256);
    assert.equal(candidate.muxPatchSha256, mux.patchSha256);
  }
  const components = verifyVpxDecoderComponents((await readTool(path.join(directory, "config_components.h"))).toString());
  let inventory = null;
  if (specialist) {
    assert.deepEqual(manifest.profiles, ["mkv-vp8-to-mp4-mpeg4", "mkv-vp9-to-mp4-mpeg4"]);
    assert.deepEqual(manifest.modules[0].profiles, manifest.profiles);
    inventory = verifyVpxSpecialistComponents((await readTool(path.join(directory, "config_components.h"))).toString());
    assert.deepEqual(candidate.specialistComponentInventory, inventory);
    for (const [key, names] of Object.entries(inventory)) assert.deepEqual(manifest[key], names);
  } else {
    assert.deepEqual(manifest.enabledDecoders, [...pub.enabledDecoders, "vp8", "vp9"]);
    assert.deepEqual(manifest.enabledParsers, [...pub.enabledParsers, "vp8", "vp9"]);
    assert.deepEqual(manifest.enabledEncoders, pub.enabledEncoders);
  }
  for (const key of ["ffmpegVersion", "ffmpegSourceSha256", "initialWasmMemoryBytes", "maximumWasmMemoryBytes", "avioInputBufferBytes", "avioOutputBufferBytes",
    "outstandingWrites", "audioFifoMaximumQueuedSamples", "audioEncoderOptions", "videoEncoderOptions", "audioArtworkOptions", "aacEncoderOptions", "opusEncoderOptions", "vorbisEncoderOptions", "mp3EncoderOptions"])
    assert.deepEqual(manifest[key], pub[key], key);
  assert.equal(manifest.modules.length, 1); assert.equal(manifest.modules[0].name, "within-remux");
  assert.equal(manifest.modules[0].videoCodecThreads, 1); assert.equal(manifest.modules[0].wasmPthreadPoolSize, 0);
  const wasm = await readTool(path.join(directory, "within-remux.wasm")), mjs = await readTool(path.join(directory, "within-remux.mjs"));
  const memoryLimits = readWasmMemoryLimits(wasm);
  assert.deepEqual(memoryLimits, readWasmMemoryLimits(await readTool(path.join(root, "public/engines/remux/within-remux.wasm"))));
  assert.deepEqual(memoryLimits, candidate.wasmMemoryLimits);
  const abi = readEmscriptenExportAbi(mjs.toString(), wasm);
  assert.equal(abi.parameterCount, 12); assert.deepEqual(abi.parameters, Array(12).fill(127)); assert.deepEqual(abi.results, [127]);
  return { directory, preserving, specialist, exactAac, inventory, recovery: recovery ?? null, manifestSha256: sha(raw), components, abi, memoryLimits, compiledSourceSha256: candidate.compiledSourceSha256,
    sourcePinsVerified: Object.keys(manifest.sources).length, artifactPinsVerified: Object.keys(manifest.artifacts).length,
    deliveredArtifacts: { "within-remux.mjs": sha(mjs), "within-remux.wasm": sha(wasm) }, publicAcceptance: false, browserDecodeVerified: false };
}
