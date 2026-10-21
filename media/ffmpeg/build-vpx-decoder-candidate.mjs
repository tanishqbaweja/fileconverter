// Compile the real FFmpeg software decoders, not a codec-presence simulation.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { makeVpxDecoderLibraries, makeVpxDecoderBuildRecipe, verifyVpxDecoderComponents, VPX_COMPILED_WRAPPER_SHA256 } from "./vpx-decoder-candidate.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/ffmpeg-nondocker-output");
const read = file => readFile(path.join(root, file)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.platform, "linux", "Use the isolated pinned no-Docker Linux build");
assert.equal(sha(await read("media/ffmpeg/within_remux.c")), "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
assert.equal(sha(await read("media/ffmpeg/build-remux.sh")), "904f06e36b2a3ee4509a7cb8faeda3a375314ffd5d1fd119017eb90ad0bb3a9e");
for (const directory of [output, path.join(root, "work/ffmpeg-nondocker-build")]) await assert.rejects(access(directory), { code: "ENOENT" });
const recipe = makeVpxDecoderBuildRecipe((await read("media/ffmpeg/reproduce-nondocker.sh")).toString());
const libraries = makeVpxDecoderLibraries((await read("media/ffmpeg/build-libraries.sh")).toString());
const runtime = await createOwnedRuntimeScratch("vpx-decoder-builder-");
try {
  await writeFile(path.join(runtime.directory, "package.json"), '{"type":"commonjs"}\n', { flag: "wx" });
  const script = path.join(runtime.directory, "recipe.sh"); await writeFile(script, recipe.generated, { flag: "wx" });
  const child = spawn("bash", [script], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...runtime.env,
    WITHIN_BUILD_CORE_FILTER: "within-remux", WITHIN_KEEP_NONDOCKER_OUTPUT: "1", WITHIN_VPX_DECODER_SCRIPT_DIR: path.join(root, "media/ffmpeg") } });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Private VPX decoder build exit ${code}/${signal}`))); });
  assert.equal(await readFile(path.join(output, "build-libraries.vpx.sh"), "utf8"), libraries.generated);
  assert.equal(await readFile(path.join(output, "build-libraries.base.sh"), "utf8"), (await read("media/ffmpeg/build-libraries.sh")).toString());
  const compiledSourceSha256 = sha(await readFile(path.join(output, "within_remux.vpx.c")));
  assert.equal(compiledSourceSha256, VPX_COMPILED_WRAPPER_SHA256, "Do not change the compiled wrapper, I/O or encoding settings");
  const components = verifyVpxDecoderComponents(await readFile(path.join(output, "config_components.h"), "utf8"));
  const limits = readWasmMemoryLimits(await readFile(path.join(output, "within-remux.wasm")));
  assert.deepEqual(limits, readWasmMemoryLimits(await read("public/engines/remux/within-remux.wasm")), "Never raise memory limits");
  const original = JSON.parse(await readFile(path.join(output, "build-manifest.json"))), core = original.modules.filter(row => row.name === "within-remux");
  assert.equal(core.length, 1);
  const sources = {}, artifacts = {};
  const sourceFiles = ["media/ffmpeg/within_remux.c", "media/ffmpeg/vpx-decoder-candidate.mjs", "media/ffmpeg/make-vpx-decoder-candidate.mjs",
    "media/ffmpeg/build-vpx-decoder-candidate.mjs", "media/ffmpeg/reproduce-nondocker.sh", "media/ffmpeg/build-remux.sh", "media/ffmpeg/build-libraries.sh",
    "media/ffmpeg/wasm-pkg-config.sh", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/wasm-memory-limits.mjs",
    "scripts/lib/vpx-decoder-build-workflow.mjs", ".github/workflows/reproduce-ffmpeg-nondocker.yml"];
  for (const entry of await readdir(path.join(root, "media/ffmpeg"), { withFileTypes: true }))
    if (entry.isFile() && /^build-(vpx|opencore-amr|lame|opus|ogg|vorbis)\.sh$/.test(entry.name)) sourceFiles.push("media/ffmpeg/" + entry.name);
  for (const entry of await readdir(path.join(root, "media/ffmpeg/patches"), { withFileTypes: true }))
    if (entry.isFile() && entry.name.endsWith(".patch")) sourceFiles.push("media/ffmpeg/patches/" + entry.name);
  for (const file of sourceFiles) sources[file] = sha(await read(file));
  for (const entry of await readdir(output, { withFileTypes: true })) {
    assert.ok(entry.isFile() && !entry.isSymbolicLink());
    if (entry.name !== "build-manifest.json") artifacts[entry.name] = sha(await readFile(path.join(output, entry.name)));
  }
  await writeFile(path.join(output, "build-manifest.json"), JSON.stringify({ ...original, engine: "within-remux-private-vpx-software-decoders",
    scope: "private-config-only-software-decode-candidate-not-public-reproduction-or-browser-acceptance", modules: core,
    profiles: ["private-vp8-vp9-decode-reencode"], enabledDecoders: [...original.enabledDecoders, "vp8", "vp9"],
    enabledParsers: [...original.enabledParsers, "vp8", "vp9"], sources, artifacts,
    candidate: { ...components, compiledSourceSha256, generatedLibrariesSha256: libraries.generatedSha256,
      generatedRecipeSha256: recipe.generatedSha256, configureEdits: 2, wrapperChanged: false, encoderSettingsChanged: false,
      ioChanged: false, wasmMemoryLimits: limits, memoryLimitsRaised: false, browserDecodeVerified: false, publicAcceptance: false } }, null, 2) + "\n");
  console.log("Private VP8/VP9 software decoder core compiled. Genuine browser decoding/re-encoding, fidelity, memory and promotion gates still pending; AV1 is not implemented.");
} finally { await runtime.close(); }
