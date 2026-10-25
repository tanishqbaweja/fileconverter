// Private actual Ogg-cover compilation, preserving the established SDK/codec/
// heap/linker/checksum/cleanup recipe. Never writes public engine assets.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { AUDIO_METADATA_PARENT_SHA256 } from "./audio-text-metadata-candidate.mjs";
import { makeAudioOggArtworkCandidate } from "./audio-ogg-artwork-candidate.mjs";
import { makeAudioOggArtworkBuildRecipe } from "./audio-ogg-artwork-build-recipe.mjs";
import { makeAudioRepeatedCommentCandidate } from "./audio-repeated-comment-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/ffmpeg-nondocker-output");
const read = file => readFile(path.join(root, file)), sha = b => createHash("sha256").update(b).digest("hex");
assert.equal(process.platform, "linux", "Use the isolated pinned no-Docker workflow");
assert.equal(sha(await read("media/ffmpeg/build-remux.sh")), "904f06e36b2a3ee4509a7cb8faeda3a375314ffd5d1fd119017eb90ad0bb3a9e");
assert.equal(sha(await read("media/ffmpeg/within_remux.c")), AUDIO_METADATA_PARENT_SHA256);
for (const dir of [output, path.join(root, "work/ffmpeg-nondocker-build")]) await assert.rejects(access(dir), { code: "ENOENT" });
const recipe = makeAudioOggArtworkBuildRecipe((await read("media/ffmpeg/reproduce-nondocker.sh")).toString());
const runtime = await createOwnedRuntimeScratch("audio-ogg-artwork-builder-");
try {
  await writeFile(path.join(runtime.directory, "package.json"), '{"type":"commonjs"}\n', { flag: "wx" });
  const script = path.join(runtime.directory, "recipe.sh"); await writeFile(script, recipe.generated, { flag: "wx" });
  const child = spawn("bash", [script], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...runtime.env,
    WITHIN_BUILD_CORE_FILTER: "within-remux", WITHIN_KEEP_NONDOCKER_OUTPUT: "1", WITHIN_AUDIO_METADATA_SCRIPT_DIR: path.join(root, "media/ffmpeg") } });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Private Ogg artwork build exit ${code}/${signal}`))); });
  const parent = await readFile(path.join(output, "within_remux.parent.c"), "utf8");
  const candidate = makeAudioOggArtworkCandidate(parent, (await read("media/ffmpeg/audio-text-metadata.h")).toString(),
    (await read("media/ffmpeg/audio-muxer-metadata-order.h")).toString(), (await read("media/ffmpeg/audio-ogg-artwork.h")).toString(), { expectedParentSha256: sha(parent) });
  assert.equal(await readFile(path.join(output, "within_remux.metadata.c"), "utf8"), candidate.generated);
  const upstream = JSON.parse(await readFile(path.join(output, "audio-repeated-comment-source.json")));
  const upstreamParent = await readFile(path.join(output, "oggparsevorbis.parent.c"), "utf8");
  const upstreamCandidate = makeAudioRepeatedCommentCandidate(upstreamParent, { sourceArchiveSha256: upstream.sourceArchiveSha256 });
  assert.equal(await readFile(path.join(output, "oggparsevorbis.repeated.c"), "utf8"), upstreamCandidate.generated);
  assert.equal(upstream.originalSha256, upstreamCandidate.originalSha256); assert.equal(upstream.generatedSha256, upstreamCandidate.generatedSha256);
  const limits = readWasmMemoryLimits(await readFile(path.join(output, "within-remux.wasm")));
  assert.deepEqual(limits, readWasmMemoryLimits(await read("public/engines/remux/within-remux.wasm")));
  const original = JSON.parse(await readFile(path.join(output, "build-manifest.json"))), core = original.modules.filter(m => m.name === "within-remux");
  assert.equal(core.length, 1); assert.equal(original.ffmpegSourceSha256, upstream.sourceArchiveSha256);
  // Inherit every exact V3 build input, adding the four new generator sources
  // and workflow derivative. The V3 files themselves remain byte-identical.
  const builderText = (await read("media/ffmpeg/build-audio-repeated-metadata-candidate.mjs")).toString();
  const sourceDeclaration = builderText.match(/const sourceFiles = (\[[\s\S]*?\]);/); assert.ok(sourceDeclaration);
  const sourceFiles = JSON.parse(sourceDeclaration[1].replaceAll(/\s+/g, " "));
  sourceFiles.push("media/ffmpeg/audio-ogg-artwork.h", "media/ffmpeg/audio-ogg-artwork-candidate.mjs",
    "media/ffmpeg/make-audio-ogg-artwork-candidate.mjs", "media/ffmpeg/audio-ogg-artwork-build-recipe.mjs",
    "media/ffmpeg/build-audio-ogg-artwork-candidate.mjs", "scripts/lib/audio-ogg-artwork-build-workflow.mjs");
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
    scope: "private-Ogg-Opus-artwork-candidate-not-public-acceptance", modules: core, profiles: ["audio-metadata-candidate"], sources, artifacts,
    audioArtworkOptions: { ...original.audioArtworkOptions, supportedOutputs: [...original.audioArtworkOptions.supportedOutputs, "ogg", "opus"] },
    candidate: { parentSha256: candidate.parentSha256, compiledSourceSha256: candidate.generatedSha256, helperSha256: candidate.helperSha256,
      originalMasterSha256: AUDIO_METADATA_PARENT_SHA256, generatedRecipeSha256: recipe.generatedSha256, allowedSourceEdits: 10,
      muxerOrderHelperSha256: candidate.muxerOrderHelperSha256, artworkHelperSha256: candidate.artworkHelperSha256, wasmMemoryLimits: limits,
      upstreamCommentPatch: upstream, codecSettingsChanged: false, ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false } }, null, 2) + "\n");
  console.log("Private Ogg/Opus cover core compiled. Browser fidelity, memory, stress and promotion remain unverified.");
} finally { await runtime.close(); }
