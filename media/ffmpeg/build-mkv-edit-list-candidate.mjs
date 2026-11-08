// Build tools only. No media input, codec execution, or changes to published assets.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { makeMkvEditListTimelineCandidate } from "./mkv-edit-list-timeline-candidate.mjs";
import { deriveMkvEditListBuildRecipe, sha256 } from "./mkv-edit-list-build-recipe.mjs";

const root = path.resolve(import.meta.dirname, "../.."), work = path.join(root, "work");
const publicDir = path.join(root, "public/engines/remux");
const sourceProof = "mkv-edit-list-source-proof.json";
const files = {
  "within-direct.mjs": 256 * 1024,
  "within-direct.wasm": 2 * 1024 * 1024,
  "build-manifest.json": 32 * 1024,
  "within_remux.c": 512 * 1024,
  "LICENSE.ffmpeg-lgpl3": 32 * 1024,
};
const readBounded = async (directory, file, limit) => {
  const target = path.join(directory, file), info = await lstat(target);
  assert.ok(info.isFile() && info.size > 0 && info.size <= limit, `Invalid build artifact: ${file}`);
  const data = await readFile(target);
  assert.equal(data.length, info.size);
  return data;
};
const published = async () => Object.fromEntries(await Promise.all(Object.entries(files).slice(0, 3)
  .map(async ([file, limit]) => [file, await readBounded(publicDir, file, limit)])));

async function prepare(build, output) {
  const owner = process.env.WITHIN_MKV_TIMELINE_BUILD_ROOT;
  assert.equal(path.dirname(owner), work);
  assert.match(path.basename(owner), /^mkv-timeline-builder-[A-Za-z0-9]{6}$/);
  assert.equal(build, path.join(owner, "build"));
  assert.equal(output, path.join(owner, "compiled"));
  for (const directory of [build, output]) assert.equal(await realpath(directory), directory);
  const base = await readBounded(build, "within_remux.c", files["within_remux.c"]);
  const { generated, proof } = makeMkvEditListTimelineCandidate(base);
  const staged = path.join(build, "within_remux.c.candidate");
  await writeFile(staged, generated, { flag: "wx" });
  await writeFile(path.join(output, "within_remux.c"), generated, { flag: "wx" });
  await writeFile(path.join(output, sourceProof), JSON.stringify(proof), { flag: "wx" });
  await rename(staged, path.join(build, "within_remux.c"));
}

function runRecipe(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [script], { cwd: root, stdio: "inherit", windowsHide: true, env });
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 ? resolve() : reject(new Error(`Candidate compiler exited ${code ?? signal}`)));
  });
}

async function buildCandidate() {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Use the isolated hosted candidate job");
  const ciOwner = process.env.WITHIN_CI_RUNTIME_OWNER, ciRoot = path.dirname(ciOwner);
  assert.equal(path.dirname(ciRoot), work);
  assert.match(path.basename(ciRoot), /^ci-[A-Za-z0-9]{6}$/);
  assert.equal(ciOwner, path.join(ciRoot, "ci-runtime-owner.json"));
  assert.equal(await realpath(ciRoot), ciRoot);
  const ciRecord = JSON.parse(await readBounded(ciRoot, path.basename(ciOwner), 8192));
  assert.equal(ciRecord.directory, ciRoot);
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_JOB", "GITHUB_SHA"])
    assert.equal(ciRecord.job[key], process.env[key]);
  assert.match(process.env.GITHUB_SHA, /^[a-f0-9]{40}$/);
  const release = await published();
  assert.equal(sha256(release["within-direct.wasm"]), "306d44ccae312668190f6e43c6e51867981e75868c6c45a7267f1b24e3ce30d0");
  const { generated, ...recipe } = deriveMkvEditListBuildRecipe(await readFile(path.join(import.meta.dirname, "reproduce-nondocker.sh")));
  const runtime = await createOwnedRuntimeScratch("mkv-timeline-builder-");
  try {
    const script = path.join(runtime.directory, "recipe.sh"), compiled = path.join(runtime.directory, "compiled");
    await writeFile(path.join(runtime.directory, "package.json"), '{"type":"commonjs"}\n', { flag: "wx" });
    await writeFile(script, generated, { flag: "wx" });
    await runRecipe(script, { ...runtime.env, WITHIN_MKV_TIMELINE_BUILD_ROOT: runtime.directory,
      WITHIN_MKV_TIMELINE_SCRIPT_DIR: import.meta.dirname, WITHIN_KEEP_NONDOCKER_OUTPUT: "1",
      WITHIN_VERIFY_SOURCE_REWRITES_ONLY: "0", WITHIN_BUILD_CORE_FILTER: "within-direct" });
    assert.equal(await realpath(compiled), compiled);
    const artifacts = Object.fromEntries(await Promise.all(Object.entries(files)
      .map(async ([file, limit]) => [file, await readBounded(compiled, file, limit)])));
    const derivation = JSON.parse(await readBounded(compiled, sourceProof, 8192));
    assert.equal(derivation.exactReversal, true);
    assert.equal(derivation.candidateWrapperSha256, "a55da1418f671f93932d97f879260763da74bf2e260a09914812d93869afab99");
    assert.equal(sha256(artifacts["within_remux.c"]), derivation.candidateWrapperSha256);
    assert.deepEqual(await published(), release, "Published artifacts must stay byte-exact");
    assert.deepEqual(artifacts["build-manifest.json"], release["build-manifest.json"], "Build configuration must stay byte-exact");
    const wasm = artifacts["within-direct.wasm"];
    assert.ok(WebAssembly.validate(wasm));
    assert.notEqual(sha256(wasm), sha256(release["within-direct.wasm"]), "Refuse to label released Wasm a candidate");
    const memory = readWasmMemoryLimits(wasm);
    assert.deepEqual(memory, [{ imported: true, initialPages: 384, maximumPages: 1024, shared: true }]);
    const glue = artifacts["within-direct.mjs"].toString("utf8");
    assert.match(glue, /\bwithin-direct\.wasm\b/);
    assert.match(glue, /\b_within_remux\b/);
    const report = { schemaVersion: 1, head: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID,
      recipe, source: { ...derivation, candidateBuildRun: true }, wasmMemory: memory,
      publishedWasmSha256: sha256(release["within-direct.wasm"]), publishedArtifactsUnchanged: true,
      artifacts: Object.fromEntries(Object.entries(artifacts).map(([name, data]) => [name, { bytes: data.length, sha256: sha256(data) }])),
      browserTimelineVerified: false, firstFragmentMemoryVerified: false, mediaInputs: 0, publicAcceptance: false };
    const handoff = path.join(ciRoot, "mkv-timeline-artifacts");
    await mkdir(handoff);
    for (const [name, data] of Object.entries(artifacts)) await writeFile(path.join(handoff, name), data, { flag: "wx" });
    await writeFile(path.join(handoff, "mkv-edit-list-build-proof.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  } finally {
    await runtime.close();
  }
}

assert.equal(process.platform, "linux");
const args = process.argv.slice(2);
if (args.length === 0) await buildCandidate();
else {
  assert.equal(args.length, 3);
  assert.equal(args[0], "--prepare");
  await prepare(args[1], args[2]);
}
