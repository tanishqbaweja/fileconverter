// Private changed-source compilation. No public binary or canonical recipe writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { makeAudioTextMetadataCandidate, AUDIO_METADATA_PARENT_SHA256 } from "./audio-text-metadata-candidate.mjs";
import { makeAudioRepeatedCommentBuildRecipe } from "./audio-repeated-comment-build-recipe.mjs";
import { makeAudioRepeatedCommentCandidate } from "./audio-repeated-comment-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/ffmpeg-nondocker-output");
const read = file => readFile(path.join(root, file)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.platform, "linux", "Use the isolated pinned no-Docker Linux build workflow");
assert.equal(sha(await read("media/ffmpeg/build-remux.sh")), "904f06e36b2a3ee4509a7cb8faeda3a375314ffd5d1fd119017eb90ad0bb3a9e");
assert.equal(sha(await read("media/ffmpeg/within_remux.c")), AUDIO_METADATA_PARENT_SHA256);
for (const directory of [output, path.join(root, "work/ffmpeg-nondocker-build")]) await assert.rejects(access(directory), { code: "ENOENT" });
const recipe = makeAudioRepeatedCommentBuildRecipe((await read("media/ffmpeg/reproduce-nondocker.sh")).toString());
const runtime = await createOwnedRuntimeScratch("audio-repeated-builder-");
try {
  await writeFile(path.join(runtime.directory, "package.json"), '{"type":"commonjs"}\n', { flag: "wx" });
  const script = path.join(runtime.directory, "recipe.sh"); await writeFile(script, recipe.generated, { flag: "wx" });
  const child = spawn("bash", [script], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...runtime.env,
    WITHIN_BUILD_CORE_FILTER: "within-remux", WITHIN_KEEP_NONDOCKER_OUTPUT: "1", WITHIN_AUDIO_METADATA_SCRIPT_DIR: path.join(root, "media/ffmpeg") } });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Private repeated metadata build exit ${code}/${signal}`))); });
  const parent = await readFile(path.join(output, "within_remux.parent.c"), "utf8"), helper = (await read("media/ffmpeg/audio-text-metadata.h")).toString();
  const candidate = makeAudioTextMetadataCandidate(parent, helper, { expectedParentSha256: sha(parent) });
  assert.equal(await readFile(path.join(output, "within_remux.metadata.c"), "utf8"), candidate.generated);
  const upstream = JSON.parse(await readFile(path.join(output, "audio-repeated-comment-source.json")));
  const upstreamParent = await readFile(path.join(output, "oggparsevorbis.parent.c"), "utf8");
  const upstreamCandidate = makeAudioRepeatedCommentCandidate(upstreamParent, { sourceArchiveSha256: upstream.sourceArchiveSha256 });
  assert.equal(await readFile(path.join(output, "oggparsevorbis.repeated.c"), "utf8"), upstreamCandidate.generated);
  assert.equal(upstream.originalSha256, upstreamCandidate.originalSha256); assert.equal(upstream.generatedSha256, upstreamCandidate.generatedSha256);
  const limits = readWasmMemoryLimits(await readFile(path.join(output, "within-remux.wasm")));
  assert.deepEqual(limits, readWasmMemoryLimits(await read("public/engines/remux/within-remux.wasm")), "Never raise initial or maximum memory");
  const original = JSON.parse(await readFile(path.join(output, "build-manifest.json"))), core = original.modules.filter(row => row.name === "within-remux");
  assert.equal(core.length, 1); assert.equal(original.ffmpegSourceSha256, upstream.sourceArchiveSha256);
  const sources = {}, artifacts = {};
  const sourceFiles = ["media/ffmpeg/within_remux.c", "media/ffmpeg/audio-text-metadata.h", "media/ffmpeg/audio-text-metadata-candidate.mjs",
    "media/ffmpeg/make-audio-text-metadata-candidate.mjs", "media/ffmpeg/audio-text-metadata-build-recipe.mjs", "media/ffmpeg/build-audio-text-metadata-candidate.mjs",
    "media/ffmpeg/audio-repeated-comment-candidate.mjs", "media/ffmpeg/make-audio-repeated-comment-candidate.mjs",
    "media/ffmpeg/audio-repeated-comment-build-recipe.mjs", "media/ffmpeg/build-audio-repeated-metadata-candidate.mjs",
    "media/ffmpeg/reproduce-nondocker.sh", "media/ffmpeg/build-remux.sh", "media/ffmpeg/build-libraries.sh", "media/ffmpeg/wasm-pkg-config.sh",
    "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/wasm-memory-limits.mjs", "scripts/lib/audio-metadata-build-workflow.mjs",
    "scripts/lib/audio-repeated-comment-build-workflow.mjs", ".github/workflows/reproduce-ffmpeg-nondocker.yml"];
  for (const entry of await readdir(path.join(root, "media/ffmpeg"), { withFileTypes: true }))
    if (entry.isFile() && /^build-(vpx|opencore-amr|lame|opus|ogg|vorbis)\.sh$/.test(entry.name)) sourceFiles.push("media/ffmpeg/" + entry.name);
  for (const entry of await readdir(path.join(root, "media/ffmpeg/patches"), { withFileTypes: true }))
    if (entry.isFile() && entry.name.endsWith(".patch")) sourceFiles.push("media/ffmpeg/patches/" + entry.name);
  for (const file of sourceFiles) sources[file] = sha(await read(file));
  for (const entry of await readdir(output, { withFileTypes: true })) {
    assert.ok(entry.isFile() && !entry.isSymbolicLink());
    if (entry.name !== "build-manifest.json") artifacts[entry.name] = sha(await readFile(path.join(output, entry.name)));
  }
  await writeFile(path.join(output, "build-manifest.json"), JSON.stringify({ ...original, engine: "within-remux-private-bounded-audio-metadata",
    scope: "private-repeated-comment-metadata-candidate-not-public-reproduction-or-browser-acceptance", modules: core, profiles: ["audio-metadata-candidate"], sources, artifacts,
    candidate: { parentSha256: candidate.parentSha256, compiledSourceSha256: candidate.generatedSha256, helperSha256: candidate.helperSha256,
      originalMasterSha256: AUDIO_METADATA_PARENT_SHA256, generatedRecipeSha256: recipe.generatedSha256, allowedSourceEdits: 3, wasmMemoryLimits: limits,
      upstreamCommentPatch: upstream, codecSettingsChanged: false, ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false } }, null, 2) + "\n");
  console.log("Private repeated-comment metadata core compiled. Real browser correctness, fidelity, stress, memory and promotion remain pending.");
} finally { await runtime.close(); }
