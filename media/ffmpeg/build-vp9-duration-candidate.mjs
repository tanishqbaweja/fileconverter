// Compile tools only. Never instantiate a codec or convert any file in Node.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { makeVp9DurationBuildRecipe } from "./vp9-duration-build-recipe.mjs";
import { makeVp9OriginalWidthSource } from "./vp9-original-width-recipe.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/vp9-duration-output");
const read = file => readFile(path.join(root, file)), sha = value => createHash("sha256").update(value).digest("hex");
assert.equal(process.argv.length, 2); assert.equal(process.platform, "linux");
assert.equal(sha(await read("media/ffmpeg/within_remux.c")), "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
for (const dir of [output, path.join(root, "work/vp9-duration-build")]) await assert.rejects(access(dir), { code: "ENOENT" });
const sourcePins = {}, artifactPins = {};
const sourceFiles = ["media/ffmpeg/within_remux.c", "media/ffmpeg/vp9-packet-duration-recipe.mjs", "media/ffmpeg/vp9-stream-duration-recipe.mjs", "media/ffmpeg/vp9-original-width-recipe.mjs", "media/ffmpeg/vp9-duration-build-recipe.mjs",
  "media/ffmpeg/make-vp9-duration-source.mjs", "media/ffmpeg/build-vp9-duration-candidate.mjs", "media/ffmpeg/reproduce-nondocker.sh",
  "media/ffmpeg/wasm-pkg-config.sh", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/wasm-memory-limits.mjs",
  ".github/workflows/vp9-duration-nondocker.yml"];
for (const entry of await readdir(path.join(root, "media/ffmpeg"))) if (/^build-.*\.sh$/.test(entry)) sourceFiles.push("media/ffmpeg/" + entry);
for (const entry of await readdir(path.join(root, "media/ffmpeg/patches"))) if (entry.endsWith(".patch")) sourceFiles.push("media/ffmpeg/patches/" + entry);
for (const file of sourceFiles) sourcePins[file] = sha(await read(file));
const recipe = makeVp9DurationBuildRecipe((await read("media/ffmpeg/reproduce-nondocker.sh")).toString());
const runtime = await createOwnedRuntimeScratch("vp9-duration-builder-");
try {
  // Configure probes live under this TMPDIR, not the separate build root.
  // Extensionless Emscripten probes require a CommonJS package boundary here.
  await writeFile(path.join(runtime.directory, "package.json"), '{"type":"commonjs"}\n', { flag: "wx" });
  const script = path.join(runtime.directory, "recipe.sh"); await writeFile(script, recipe.generated, { flag: "wx" });
  const child = spawn("bash", [script], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...runtime.env,
    WITHIN_BUILD_CORE_FILTER: "within-remux", WITHIN_KEEP_NONDOCKER_OUTPUT: "1", WITHIN_VP9_DURATION_SCRIPT_DIR: path.join(root, "media/ffmpeg") } });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) =>
    code === 0 ? resolve() : reject(new Error(`Private duration build exit ${code}/${signal}`))); });
  const before = await readFile(path.join(output, "within_remux.base.c"), "utf8"), candidate = makeVp9OriginalWidthSource(before);
  assert.equal(await readFile(path.join(output, "within_remux.duration.c"), "utf8"), candidate.generated);
  const wasm = await readFile(path.join(output, "within-remux.wasm")); assert.ok(wasm.length < 16777216 && WebAssembly.validate(wasm));
  const limits = readWasmMemoryLimits(wasm);
  assert.deepEqual(limits, readWasmMemoryLimits(await read("public/engines/remux/within-remux.wasm")), "Never raise the published core's limits");
  const original = JSON.parse(await readFile(path.join(output, "build-manifest.json"))), core = original.modules.filter(row => row.name === "within-remux");
  assert.equal(core.length, 1); assert.equal(core[0].wasmPthreadPoolSize, 0); assert.equal(core[0].videoCodecThreads, 1);
  const components = await readFile(path.join(output, "config_components.h"), "utf8");
  for (const name of ["H264_DECODER", "HEVC_DECODER", "LIBVPX_VP9_ENCODER", "WEBM_MUXER"]) assert.match(components, new RegExp("^#define CONFIG_" + name + " 1$", "m"));
  const enabled = category => [...components.matchAll(new RegExp("^#define CONFIG_(\\w+)_" + category + " 1$", "gm"))].map(row => row[1].toLowerCase());
  for (const file of await readdir(output)) if (file !== "build-manifest.json") {
    const bytes = await readFile(path.join(output, file)); artifactPins[file] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  for (const [file, hash] of Object.entries(sourcePins)) assert.equal(sha(await read(file)), hash);
  await writeFile(path.join(output, "build-manifest.json"), JSON.stringify({ ...original,
    engine: "private-vp9-original-width", scope: "private-compiled-tool-not-public-reproduction-or-browser-acceptance",
    modules: core, profiles: ["private-vp9-original-width"], sources: sourcePins, artifacts: artifactPins,
    enabledDecoders: enabled("DECODER"), enabledEncoders: enabled("ENCODER"), enabledDemuxers: enabled("DEMUXER"),
    enabledMuxers: enabled("MUXER"), enabledParsers: enabled("PARSER"), enabledBitstreamFilters: enabled("BSF"),
    buildEnvironment: { usedDocker: false, emscripten: "6.0.4", emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f" },
    candidate: { baseWrapperSha256: candidate.parentSha256, compiledWrapperSha256: candidate.generatedSha256,
      generatedBuildRecipeSha256: recipe.generatedSha256, wrapperEdits: candidate.edits.length, codecSettingsChanged: false, ioChanged: false,
      privateVp9ExplicitWidth: candidate.privateVp9ExplicitWidth, defaultWidthPolicyChanged: candidate.defaultWidthPolicyChanged,
      publicWidthRegistryOrControlsChanged: candidate.publicWidthRegistryOrControlsChanged,
      wasmMemoryLimits: limits, memoryLimitsRaised: false, nodeInstantiated: false, mediaRead: false, mediaWritten: false,
      browserValidated: false, publicAcceptance: false } }, null, 2) + "\n");
  console.log(JSON.stringify({ status: "compiled-private-tool-requires-browser-validation", wasmBytes: wasm.length,
    compiledWrapperSha256: candidate.generatedSha256, memoryLimits: limits, publicAcceptance: false }));
} finally { await runtime.close(); }
