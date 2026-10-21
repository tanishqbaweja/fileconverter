import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { makeVpxDecoderLibraries, makeVpxDecoderBuildRecipe, verifyVpxDecoderComponents, VPX_COMPILED_WRAPPER_SHA256 } from "../../media/ffmpeg/vpx-decoder-candidate.mjs";
import { makeVpxDecoderBuildWorkflow } from "./vpx-decoder-build-workflow.mjs";
import { readWasmMemoryLimits } from "./wasm-memory-limits.mjs";
import { readEmscriptenExportAbi } from "./wasm-export-abi.mjs";
import { makeVpxPreservingSource, makeVpxPreservingRecipe, makeVpxPreservingWorkflow } from "../../media/ffmpeg/vpx-preserving-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const readTool = async file => { const info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 32 * 1024 ** 2); return readFile(file); };
export async function auditVpxDecoderArtifact(input) {
  const directory = await realpath(path.resolve(input)), work = await realpath(path.join(root, "work"));
  assert.equal(path.dirname(directory), work); assert.equal(directory.toLowerCase(), path.resolve(input).toLowerCase());
  const raw = await readTool(path.join(directory, "build-manifest.json")); assert.ok(raw.length <= 2 * 1024 ** 2);
  const manifest = JSON.parse(raw), pub = JSON.parse(await readTool(path.join(root, "public/engines/remux/build-manifest.json")));
  const preserving = manifest.engine === "within-remux-private-vpx-preserving";
  assert.ok(preserving || manifest.engine === "within-remux-private-vpx-software-decoders");
  const candidate = manifest.candidate; assert.equal(candidate.configureEdits, 2);
  assert.equal(candidate.wrapperChanged, preserving);
  for (const flag of ["encoderSettingsChanged", "ioChanged", "memoryLimitsRaised", "browserDecodeVerified", "publicAcceptance"]) assert.equal(candidate[flag], false, flag);
  assert.ok(Object.keys(manifest.sources).length > 10 && Object.keys(manifest.sources).length <= 128);
  assert.ok(Object.keys(manifest.artifacts).length > 3 && Object.keys(manifest.artifacts).length <= 64);
  for (const [file, expected] of Object.entries(manifest.artifacts)) {
    assert.match(file, /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:mjs|wasm|sh|c|h)|LICENSE\.[A-Za-z0-9_.-]+)$/);
    assert.equal(sha(await readTool(path.join(directory, file))), expected, file);
  }
  for (const [file, expected] of Object.entries(manifest.sources)) {
    assert.match(file, /^(?:media|scripts|\.github)\/[A-Za-z0-9_./-]+$/); assert.ok(!file.split("/").includes(".."));
    const bytes = await readTool(path.join(root, file)), actual = file === ".github/workflows/reproduce-ffmpeg-nondocker.yml"
      ? (preserving ? makeVpxPreservingWorkflow(bytes.toString()) : makeVpxDecoderBuildWorkflow(bytes.toString())).generatedSha256 : sha(bytes);
    assert.equal(actual, expected, "Build source changed: " + file);
  }
  const base = (await readTool(path.join(directory, "build-libraries.base.sh"))).toString();
  assert.equal(base, (await readTool(path.join(root, "media/ffmpeg/build-libraries.sh"))).toString());
  const libraries = makeVpxDecoderLibraries(base);
  assert.equal((await readTool(path.join(directory, "build-libraries.vpx.sh"))).toString(), libraries.generated);
  assert.equal(candidate.generatedLibrariesSha256, libraries.generatedSha256);
  const recipeSource = (await readTool(path.join(root, "media/ffmpeg/reproduce-nondocker.sh"))).toString();
  assert.equal(candidate.generatedRecipeSha256, (preserving ? makeVpxPreservingRecipe(recipeSource) : makeVpxDecoderBuildRecipe(recipeSource)).generatedSha256);
  const compiled = await readTool(path.join(directory, "within_remux.vpx.c"));
  if (preserving) {
    const derived = makeVpxPreservingSource((await readTool(path.join(directory, "within_remux.vpx-base.c"))).toString());
    assert.equal(compiled.toString(), derived.generated); assert.equal(candidate.preservationParentSha256, VPX_COMPILED_WRAPPER_SHA256);
    assert.equal(candidate.preservationSourceEdits, derived.edits.length);
    for (const key of ["maxStreams", "maxChapters", "maxInterleaveUs"]) assert.equal(candidate[key], derived[key]);
  } else assert.equal(sha(compiled), VPX_COMPILED_WRAPPER_SHA256);
  assert.equal(candidate.compiledSourceSha256, sha(compiled));
  const components = verifyVpxDecoderComponents((await readTool(path.join(directory, "config_components.h"))).toString());
  assert.deepEqual(manifest.enabledDecoders, [...pub.enabledDecoders, "vp8", "vp9"]);
  assert.deepEqual(manifest.enabledParsers, [...pub.enabledParsers, "vp8", "vp9"]);
  for (const key of ["ffmpegVersion", "ffmpegSourceSha256", "initialWasmMemoryBytes", "maximumWasmMemoryBytes", "avioInputBufferBytes", "avioOutputBufferBytes",
    "outstandingWrites", "audioFifoMaximumQueuedSamples", "enabledEncoders", "audioEncoderOptions", "videoEncoderOptions", "audioArtworkOptions", "aacEncoderOptions", "opusEncoderOptions", "vorbisEncoderOptions", "mp3EncoderOptions"])
    assert.deepEqual(manifest[key], pub[key], key);
  assert.equal(manifest.modules.length, 1); assert.equal(manifest.modules[0].name, "within-remux");
  assert.equal(manifest.modules[0].videoCodecThreads, 1); assert.equal(manifest.modules[0].wasmPthreadPoolSize, 0);
  const wasm = await readTool(path.join(directory, "within-remux.wasm")), mjs = await readTool(path.join(directory, "within-remux.mjs"));
  const memoryLimits = readWasmMemoryLimits(wasm);
  assert.deepEqual(memoryLimits, readWasmMemoryLimits(await readTool(path.join(root, "public/engines/remux/within-remux.wasm"))));
  assert.deepEqual(memoryLimits, candidate.wasmMemoryLimits);
  const abi = readEmscriptenExportAbi(mjs.toString(), wasm);
  assert.equal(abi.parameterCount, 12); assert.deepEqual(abi.parameters, Array(12).fill(127)); assert.deepEqual(abi.results, [127]);
  return { directory, preserving, manifestSha256: sha(raw), components, abi, memoryLimits, compiledSourceSha256: candidate.compiledSourceSha256,
    sourcePinsVerified: Object.keys(manifest.sources).length, artifactPinsVerified: Object.keys(manifest.artifacts).length,
    deliveredArtifacts: { "within-remux.mjs": sha(mjs), "within-remux.wasm": sha(wasm) }, publicAcceptance: false, browserDecodeVerified: false };
}
