// Linux activated Emscripten6.0.4 only, no Docker. Frozen baseline recipe +
// one alignment wrapper; never changes the historical sources or public files.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { BASE_SPLIT_RECIPE_SHA256, makeAlignedReuseRecipe } from "./mpeg2-aligned-reuse-recipe.mjs";
import { readWasmFunctionNames } from "../../scripts/lib/wasm-stack-symbols.mjs";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, "../.."), work = path.join(root, "work"), output = path.join(work, "mpeg2-split-pipeline-output");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.platform, "linux", "Use the no-Docker hosted Linux builder");
await mkdir(work, { recursive: true }); assert.equal(await realpath(work), work);
for (const file of [output, path.join(work, "mpeg2-split-pipeline-build")])
  await assert.rejects(access(file), { code: "ENOENT" }, "Do not overwrite an existing build/recipe/output");
const base = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-split-pipeline.sh"), "utf8"), recipe = makeAlignedReuseRecipe(base);
let outputIdentity, complete = false;
const exec = promisify(execFile);
const runtime = await createOwnedRuntimeScratch("mpeg2-aligned-builder-");
const recipePath = path.join(runtime.directory, "recipe.sh"), smokePath = path.join(runtime.directory, "smoke");
try {
  await writeFile(recipePath, recipe, { flag: "wx" });
  await exec("cc", ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "media/ffmpeg/mpeg2-aligned-reuse-smoke.c", "-o", smokePath],
    { cwd: root, env: runtime.env, timeout: 30000 });
  const { stdout } = await exec(smokePath, [], { cwd: root, timeout: 5000 });
  const smoke = JSON.parse(stdout); assert.equal(smoke.passed, 6); assert.equal(smoke.conversionsPerformed, 0);
  console.log(stdout.trim());
  // Stream build output, never retain an unbounded child stdout buffer.
  const { spawn } = await import("node:child_process");
  const child = spawn("bash", [recipePath], { cwd: root, env: { ...runtime.env,
    WITHIN_ALIGNED_REUSE_SCRIPT_DIR: path.join(root, "media/ffmpeg") }, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Private build exit ${code}/${signal}`)));
  });
  outputIdentity = await lstat(output, { bigint: true });
  assert.equal(await realpath(output), output); assert.equal(outputIdentity.isSymbolicLink(), false);
  const manifestPath = path.join(output, "build-manifest.json"), manifest = JSON.parse(await readFile(manifestPath));
  const wasm = await readFile(path.join(output, "within-mpeg2-split.wasm"));
  const names = readWasmFunctionNames(wasm);
  assert.ok([...names.values()].includes("__wrap_posix_memalign"), "Actual linked wrapper required, not a source-only claim");
  assert.notEqual(sha(wasm), "7b8a42b60efc439f0ceca045f4caaabfd4b0ebf0706397b6011cceedada4980c");
  assert.equal(manifest.artifacts["split-encoder.mjs"], "00c0d1b4435e9294c6784e9ccaf196f171caa3c9cc3d4c7a4aab1a47c6d8bb5e");
  assert.equal(manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  for (const file of ["media/ffmpeg/build-mpeg2-aligned-reuse.mjs", "media/ffmpeg/mpeg2-aligned-reuse-recipe.mjs",
    "media/ffmpeg/mpeg2-aligned-reuse.c", "media/ffmpeg/mpeg2-aligned-reuse-smoke.c",
    "scripts/lib/owned-runtime-scratch.mjs", ".github/workflows/reproduce-ffmpeg-nondocker.yml"])
    manifest.sources[file] = sha(await readFile(path.join(root, file)));
  manifest.scope = "private-fixed-heap-alignment-reuse-candidate-not-browser-acceptance";
  manifest.alignedReuse = { minimumBytes: 262144, alignment: 16, entrypoint: "__wrap_posix_memalign",
    upstreamFallback: true, freesOnlyFreshUnexposedPointer: true, baselineRecipeSha256: BASE_SPLIT_RECIPE_SHA256,
    generatedRecipeSha256: sha(recipe), standaloneSyntheticContract: smoke,
    actualLinkedWrapperVerified: true, originalRead: false, browserConversionVerified: false,
    liveReferenceRelease: false, codecOptionsChanged: false, heapLimitRaised: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  complete = true; console.log("Actual private wrapper linked; unchanged separate encoder and fixed memories verified. Browser conversion still required.");
} finally {
  const removeOwned = async (file, identity, recursive = false) => {
    if (!identity) return;
    const now = await lstat(file, { bigint: true }); assert.equal(now.dev, identity.dev); assert.equal(now.ino, identity.ino);
    assert.equal(now.isSymbolicLink(), false); assert.equal(await realpath(file), file); assert.equal(path.dirname(file), work);
    await rm(file, { recursive });
  };
  const cleanup = await Promise.allSettled([runtime.close(),
    !complete ? removeOwned(output, outputIdentity, true) : Promise.resolve()]);
  const errors = cleanup.filter(result => result.status === "rejected").map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, "Private builder cleanup failed");
}
