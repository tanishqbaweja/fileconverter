// Activated pinned Linux SDK only. No Docker, browser, fixture or public-engine writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { makeAiffId3BuildRecipe, AIFF_BASE_LINK_SHA } from "./aiff-id3-build-recipe.mjs";
import { AIFF_ID3_SPECIALIST_EDITS, PUBLISHED_AIFF_SOURCE_SHA256 } from "./aiff-id3-specialist-source.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/ffmpeg-nondocker-output");
const read = file => readFile(path.join(root, file)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.platform, "linux", "Compile this private candidate only through the isolated no-Docker Linux workflow");
assert.equal(sha(await read("media/ffmpeg/build-remux.sh")), AIFF_BASE_LINK_SHA);
for (const name of [output, path.join(root, "work/ffmpeg-nondocker-build")])
  await assert.rejects(access(name), { code: "ENOENT" }, "Never overwrite existing build/output");
const recipe = makeAiffId3BuildRecipe((await read("media/ffmpeg/reproduce-nondocker.sh")).toString());
const runtime = await createOwnedRuntimeScratch("aiff-id3-builder-");
try {
  const script = path.join(runtime.directory, "recipe.sh"); await writeFile(script, recipe.generated, { flag: "wx" });
  const child = spawn("bash", [script], { cwd: root, env: { ...runtime.env,
    WITHIN_BUILD_CORE_FILTER: "within-aiff", WITHIN_KEEP_NONDOCKER_OUTPUT: "1",
    WITHIN_AIFF_ID3_SCRIPT_DIR: path.join(root, "media/ffmpeg") }, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) =>
    code === 0 ? resolve() : reject(new Error(`Private AIFF build exit ${code}/${signal}`))); });
  const source = await readFile(path.join(output, "within_aiff.c"), "utf8");
  let published = source;
  for (const [before, after] of AIFF_ID3_SPECIALIST_EDITS.toReversed()) {
    assert.equal(published.split(after).length, 2); published = published.replace(after, before);
  }
  assert.equal(sha(published), PUBLISHED_AIFF_SOURCE_SHA256, "Actual compiled source differs only in the five allowed metadata edits");
  const wasm = await readFile(path.join(output, "within-aiff.wasm"));
  assert.deepEqual(readWasmMemoryLimits(wasm), [{ imported: true, initialPages: 256, maximumPages: 512, shared: true }]);
  assert.ok((await readFile(path.join(output, "within-aiff.mjs"), "utf8")).includes("within_aiff"));
  const manifestPath = path.join(output, "build-manifest.json"), previous = JSON.parse(await readFile(manifestPath));
  const core = previous.cores.find(row => row.name === "within-aiff"); assert.ok(core);
  assert.equal(core.initialWasmMemoryBytes, 16777216); assert.equal(core.maximumWasmMemoryBytes, 33554432);
  const sources = {}, artifacts = {};
  const sourceFiles = ["media/ffmpeg/build-aiff-id3-specialist.mjs", "media/ffmpeg/aiff-id3-build-recipe.mjs",
    "media/ffmpeg/aiff-id3-specialist-source.mjs", "media/ffmpeg/make-aiff-id3-specialist.mjs",
    "media/ffmpeg/make-aiff-specialist.mjs", "media/ffmpeg/within_remux.c", "media/ffmpeg/reproduce-nondocker.sh",
    "media/ffmpeg/build-remux.sh", "media/ffmpeg/build-libraries.sh", "media/ffmpeg/wasm-pkg-config.sh", "scripts/lib/owned-runtime-scratch.mjs",
    "scripts/lib/wasm-memory-limits.mjs", "scripts/lib/aiff-id3-build-workflow.mjs", ".github/workflows/reproduce-ffmpeg-nondocker.yml"];
  // Include every invoked dependency build script and applied source patch.
  for (const entry of await readdir(path.join(root, "media/ffmpeg"), { withFileTypes: true }))
    if (entry.isFile() && /^build-(vpx|opencore-amr|lame|opus|ogg|vorbis)\.sh$/.test(entry.name)) sourceFiles.push("media/ffmpeg/" + entry.name);
  for (const entry of await readdir(path.join(root, "media/ffmpeg/patches"), { withFileTypes: true }))
    if (entry.isFile() && entry.name.endsWith(".patch")) sourceFiles.push("media/ffmpeg/patches/" + entry.name);
  for (const file of sourceFiles) sources[file] = sha(await read(file));
  const entries = await readdir(output, { withFileTypes: true }); assert.ok(entries.length <= 32);
  for (const entry of entries) { assert.ok(entry.isFile() && !entry.isSymbolicLink());
    if (entry.name !== "build-manifest.json") artifacts[entry.name] = sha(await readFile(path.join(output, entry.name))); }
  const manifest = { ...previous, engine: "within-aiff-private-id3-specialist", scope: "private-changed-source-build-not-browser-or-public-acceptance",
    cores: [{ ...core, sourceSha256: sha(source) }], profiles: ["m4a-to-aiff"], sources, artifacts,
    metadataCandidate: { allowedSourceEdits: 5, publishedSourceRecoveredSha256: sha(published), compiledSourceSha256: sha(source),
      generatedRecipeSha256: recipe.generatedSha256, actualWasmMemoryLimitsVerified: true,
      codecSettingsChanged: false, ioBoundsChanged: false, memoryLimitsRaised: false,
      reproductionOfPublishedBinaryAttempted: false, actualBrowserConversionVerified: false,
      completeChromiumMemoryAcceptance: false, audioFidelityAcceptance: false, speedImprovementProven: false, publicAcceptance: false } };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Private metadata-only AIFF specialist compiled with unchanged 16/32 MiB limits. Browser/reproducibility/fidelity/memory gates remain pending.");
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
