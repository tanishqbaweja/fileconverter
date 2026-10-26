// Actual private no-Docker compilation. Published engines and canonical recipe stay untouched.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { AUDIO_METADATA_PARENT_SHA256 } from "./audio-text-metadata-candidate.mjs";
import { makeMp3QuantizerSearchCore as makeAudioOggArtworkCandidate } from "./mp3-quantizer-search-candidate.mjs";
import { makeAudioRepeatedCommentCandidate } from "./audio-repeated-comment-candidate.mjs";
import { makeMp3QuantizerSearchBuildRecipe as makeMp3InputGainBuildRecipe } from "./mp3-quantizer-search-build-recipe.mjs";
import { makeMp3InputGainCandidate, MP3_GAIN_ARCHIVE_SHA256 } from "./mp3-input-gain-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/ffmpeg-nondocker-output");
const read = file => readFile(path.join(root, file)), sha = b => createHash("sha256").update(b).digest("hex");
assert.equal(process.platform, "linux");
assert.equal(sha(await read("media/ffmpeg/build-remux.sh")), "904f06e36b2a3ee4509a7cb8faeda3a375314ffd5d1fd119017eb90ad0bb3a9e");
assert.equal(sha(await read("media/ffmpeg/within_remux.c")), AUDIO_METADATA_PARENT_SHA256);
for (const dir of [output, path.join(root, "work/ffmpeg-nondocker-build")]) await assert.rejects(access(dir), { code: "ENOENT" });
const recipe = makeMp3InputGainBuildRecipe((await read("media/ffmpeg/reproduce-nondocker.sh")).toString());
const runtime = await createOwnedRuntimeScratch("mp3-quantizer-search-builder-");
try {
  await writeFile(path.join(runtime.directory, "package.json"), '{"type":"commonjs"}\n', { flag: "wx" });
  const script = path.join(runtime.directory, "recipe.sh"); await writeFile(script, recipe.generated, { flag: "wx" });
  const child = spawn("bash", [script], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...runtime.env,
    WITHIN_BUILD_CORE_FILTER: "within-remux", WITHIN_KEEP_NONDOCKER_OUTPUT: "1", WITHIN_AUDIO_METADATA_SCRIPT_DIR: path.join(root, "media/ffmpeg") } });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Private MP3 gain build exit ${code}/${signal}`))); });
  const parent = await readFile(path.join(output, "within_remux.parent.c"), "utf8");
  const candidate = makeAudioOggArtworkCandidate(parent, (await read("media/ffmpeg/audio-text-metadata.h")).toString(),
    (await read("media/ffmpeg/audio-muxer-metadata-order.h")).toString(), (await read("media/ffmpeg/audio-ogg-artwork.h")).toString(), { expectedParentSha256: sha(parent) });
  assert.equal(await readFile(path.join(output, "within_remux.metadata.c"), "utf8"), candidate.generated);
  const upstream = JSON.parse(await readFile(path.join(output, "audio-repeated-comment-source.json")));
  const commentCandidate = makeAudioRepeatedCommentCandidate(await readFile(path.join(output, "oggparsevorbis.parent.c"), "utf8"), { sourceArchiveSha256: upstream.sourceArchiveSha256 });
  assert.equal(await readFile(path.join(output, "oggparsevorbis.repeated.c"), "utf8"), commentCandidate.generated);
  const lame = makeMp3InputGainCandidate(await readFile(path.join(output, "lame-presets.parent.c"), "utf8"), { sourceArchiveSha256: MP3_GAIN_ARCHIVE_SHA256 });
  assert.equal(await readFile(path.join(output, "lame-presets.input-gain.c"), "utf8"), lame.generated);
  const { generated: ignoredGenerated, ...lameReceipt } = lame; assert.ok(ignoredGenerated);
  assert.deepEqual(JSON.parse(await readFile(path.join(output, "mp3-input-gain-source.json"))), lameReceipt);
  const limits = readWasmMemoryLimits(await readFile(path.join(output, "within-remux.wasm")));
  assert.deepEqual(limits, readWasmMemoryLimits(await read("public/engines/remux/within-remux.wasm")));
  const original = JSON.parse(await readFile(path.join(output, "build-manifest.json"))), core = original.modules.filter(m => m.name === "within-remux");
  assert.equal(core.length, 1); assert.equal(original.lameSourceSha256, MP3_GAIN_ARCHIVE_SHA256);
  const builderText = (await read("media/ffmpeg/build-audio-repeated-metadata-candidate.mjs")).toString();
  const declaration = builderText.match(/const sourceFiles = (\[[\s\S]*?\]);/); assert.ok(declaration);
  const sourceFiles = JSON.parse(declaration[1].replaceAll(/\s+/g, " "));
  sourceFiles.push("media/ffmpeg/audio-ogg-artwork.h", "media/ffmpeg/audio-ogg-artwork-candidate.mjs",
    "media/ffmpeg/make-audio-ogg-artwork-candidate.mjs", "media/ffmpeg/audio-ogg-artwork-build-recipe.mjs",
    "media/ffmpeg/build-audio-ogg-artwork-candidate.mjs", "scripts/lib/audio-ogg-artwork-build-workflow.mjs",
    "media/ffmpeg/mp3-input-gain-candidate.mjs", "media/ffmpeg/make-mp3-input-gain-candidate.mjs",
    "media/ffmpeg/mp3-input-gain-build-recipe.mjs", "media/ffmpeg/build-mp3-input-gain-candidate.mjs", "scripts/lib/mp3-input-gain-build-workflow.mjs",
    "media/ffmpeg/mp3-quantizer-search-candidate.mjs", "media/ffmpeg/mp3-quantizer-search-build-recipe.mjs",
    "media/ffmpeg/make-mp3-quantizer-search-candidate.mjs", "media/ffmpeg/build-mp3-quantizer-search-candidate.mjs",
    "scripts/lib/mp3-quantizer-search-build-workflow.mjs");
  for (const entry of await readdir(path.join(root, "media/ffmpeg"), { withFileTypes: true }))
    if (entry.isFile() && /^build-(vpx|opencore-amr|lame|opus|ogg|vorbis)\.sh$/.test(entry.name)) sourceFiles.push("media/ffmpeg/" + entry.name);
  for (const entry of await readdir(path.join(root, "media/ffmpeg/patches"), { withFileTypes: true }))
    if (entry.isFile() && entry.name.endsWith(".patch")) sourceFiles.push("media/ffmpeg/patches/" + entry.name);
  assert.equal(new Set(sourceFiles).size, sourceFiles.length); const sources = {}, artifacts = {};
  for (const file of sourceFiles) sources[file] = sha(await read(file));
  for (const entry of await readdir(output, { withFileTypes: true })) {
    assert.ok(entry.isFile() && !entry.isSymbolicLink());
    if (entry.name !== "build-manifest.json") artifacts[entry.name] = sha(await readFile(path.join(output, entry.name)));
  }
  await writeFile(path.join(output, "build-manifest.json"), JSON.stringify({ ...original, engine: "within-remux-private-bounded-audio-metadata",
    scope: "private-MP3-quantizer-search-candidate-not-public-acceptance", modules: core, profiles: ["mp3-quantizer-search-candidate"], sources, artifacts,
    mp3InputGainPolicy: "preserve-caller-input-scale-without-preset-attenuation",
    mp3EncoderOptions: { ...original.mp3EncoderOptions, compressionLevel: 2 },
    audioArtworkOptions: { ...original.audioArtworkOptions, supportedOutputs: [...original.audioArtworkOptions.supportedOutputs, "ogg", "opus"] },
    candidate: { parentSha256: candidate.parentSha256, compiledSourceSha256: candidate.generatedSha256, helperSha256: candidate.helperSha256,
      originalMasterSha256: AUDIO_METADATA_PARENT_SHA256, generatedRecipeSha256: recipe.generatedSha256, allowedSourceEdits: 11,
      mp3QuantizerSearchPolicy: candidate.mp3QuantizerSearchPolicy,
      muxerOrderHelperSha256: candidate.muxerOrderHelperSha256, artworkHelperSha256: candidate.artworkHelperSha256, wasmMemoryLimits: limits,
      upstreamCommentPatch: upstream, upstreamLameGainPatch: lameReceipt, codecSettingsChanged: true,
      ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false } }, null, 2) + "\n");
  console.log("Private MP3 quantization-search core compiled; actual fidelity/clipping/speed/memory/public qualification remain unverified.");
} finally { await runtime.close(); }
