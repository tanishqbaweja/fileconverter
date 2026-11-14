// Build tools only. No media input, codec execution, or changes to published assets.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { makeMkvEditListTimelineCandidate } from "./mkv-edit-list-timeline-candidate.mjs";
import { editListParentSha256, exactAacWrapperSha256, exactAacMovSha256, exactAacBuildRef,
  makeMkvExactAacTimelineCandidate, makeMkvExactAacMovSource } from "./mkv-exact-aac-timeline-candidate.mjs";
import { deriveMkvEditListBuildRecipe, sha256 } from "./mkv-edit-list-build-recipe.mjs";
import { h264VfrBuildRef, h264VfrWrapperSha256, makeMkvH264VfrCandidate } from "./mkv-h264-vfr-candidate.mjs";
import { h264ProbeDecoderBuildRef, h264ProbeWrapperSha256, makeH264ProbeDecoderWrapper,
  makeH264ProbeDecoderLibraries, makeH264ProbeDecoderManifest, assertH264ProbeDecoderConfig } from "./mkv-h264-probe-decoder-candidate.mjs";

const root = path.resolve(import.meta.dirname, "../.."), work = path.join(root, "work");
const publicDir = path.join(root, "public/engines/remux");
const sourceProof = "mkv-edit-list-source-proof.json";
const movProof = "mkv-exact-aac-mov-proof.json";
const envMode = process.env.WITHIN_MKV_EXACT_AAC ?? "0";
assert.ok(["0", "1"].includes(envMode));
const exactAac = envMode === "1";
const vfrMode = process.env.WITHIN_MKV_H264_VFR ?? "0";
assert.ok(["0", "1"].includes(vfrMode));
const h264Vfr = vfrMode === "1";
assert.ok(!h264Vfr || exactAac);
const probeMode = process.env.WITHIN_MKV_H264_PROBE_DECODER ?? "0";
assert.ok(["0", "1"].includes(probeMode));
const probeDecoder = probeMode === "1";
assert.ok(!probeDecoder || h264Vfr);
const wrapperSha256 = probeDecoder ? h264ProbeWrapperSha256 : h264Vfr ? h264VfrWrapperSha256 : exactAac ? exactAacWrapperSha256 : editListParentSha256;
const files = {
  "within-direct.mjs": 256 * 1024,
  "within-direct.wasm": (probeDecoder ? 8 : 2) * 1024 * 1024,
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

async function prepare(action, build, output) {
  const owner = process.env.WITHIN_MKV_TIMELINE_BUILD_ROOT;
  assert.equal(path.dirname(owner), work);
  assert.match(path.basename(owner), /^mkv-timeline-builder-[A-Za-z0-9]{6}$/);
  assert.equal(build, path.join(owner, "build"));
  assert.equal(output, path.join(owner, "compiled"));
  for (const directory of [build, output]) assert.equal(await realpath(directory), directory);
  if (action === "--prepare-mov") {
    assert.equal(exactAac, true);
    const directory = path.join(build, "ffmpeg/libavformat");
    assert.equal(await realpath(directory), directory);
    const mov = await readBounded(directory, "movenc.c", 512 * 1024);
    const patch = await readBounded(path.join(import.meta.dirname, "patches"), "mov-fragmented-aac-exact-priming.patch", 8192);
    const { generated, proof } = makeMkvExactAacMovSource(mov, patch);
    const staged = path.join(directory, "movenc.c.candidate");
    await writeFile(staged, generated, { flag: "wx" });
    await writeFile(path.join(output, "movenc.c"), generated, { flag: "wx" });
    await writeFile(path.join(output, movProof), JSON.stringify(proof), { flag: "wx" });
    await rename(staged, path.join(directory, "movenc.c"));
    if (probeDecoder) {
      const script = path.join(build, "build-libraries.sh"), mode = (await lstat(script)).mode & 0o777;
      const library = makeH264ProbeDecoderLibraries(await readBounded(build, "build-libraries.sh", 32768));
      const replacement = script + ".candidate";
      await writeFile(replacement, library.generated, { flag: "wx", mode });
      await rename(replacement, script);
      await writeFile(path.join(output, "build-libraries.sh"), library.generated, { flag: "wx" });
      await writeFile(path.join(output, "h264-probe-library-proof.json"), JSON.stringify(library.proof), { flag: "wx" });
    }
    return;
  }
  const base = await readBounded(build, "within_remux.c", files["within_remux.c"]);
  const parent = (exactAac ? makeMkvExactAacTimelineCandidate : makeMkvEditListTimelineCandidate)(base);
  const vfr = h264Vfr ? makeMkvH264VfrCandidate(parent.generated) : parent;
  const derived = probeDecoder ? makeH264ProbeDecoderWrapper(vfr.generated) : vfr;
  const { generated } = derived, proof = { ...parent.proof, ...vfr.proof, ...derived.proof };
  if (probeDecoder) {
    const config = await readBounded(path.join(build, "ffmpeg"), "config_components.h", 512 * 1024);
    proof.library = { ...JSON.parse(await readBounded(output, "h264-probe-library-proof.json", 8192)), ...assertH264ProbeDecoderConfig(config) };
    await writeFile(path.join(output, "config-components.h"), config, { flag: "wx" });
  }
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
  if (exactAac) assert.equal(process.env.GITHUB_REF, `refs/heads/${probeDecoder ? h264ProbeDecoderBuildRef : h264Vfr ? h264VfrBuildRef : exactAacBuildRef}`);
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
  const { generated, ...recipe } = deriveMkvEditListBuildRecipe(await readFile(path.join(import.meta.dirname, "reproduce-nondocker.sh")), { exactAac });
  const runtime = await createOwnedRuntimeScratch("mkv-timeline-builder-");
  try {
    const script = path.join(runtime.directory, "recipe.sh"), compiled = path.join(runtime.directory, "compiled");
    await writeFile(path.join(runtime.directory, "package.json"), '{"type":"commonjs"}\n', { flag: "wx" });
    await writeFile(script, generated, { flag: "wx" });
    await runRecipe(script, { ...runtime.env, WITHIN_MKV_TIMELINE_BUILD_ROOT: runtime.directory,
      WITHIN_MKV_TIMELINE_SCRIPT_DIR: import.meta.dirname, WITHIN_KEEP_NONDOCKER_OUTPUT: "1",
      WITHIN_VERIFY_SOURCE_REWRITES_ONLY: "0", WITHIN_BUILD_CORE_FILTER: "within-direct" });
    assert.equal(await realpath(compiled), compiled);
    const expected = { ...files, ...(exactAac ? { "movenc.c": 512 * 1024 } : {}),
      ...(probeDecoder ? { "build-libraries.sh": 32768, "config-components.h": 512 * 1024 } : {}) };
    const artifacts = Object.fromEntries(await Promise.all(Object.entries(expected)
      .map(async ([file, limit]) => [file, await readBounded(compiled, file, limit)])));
    const derivation = JSON.parse(await readBounded(compiled, sourceProof, 8192));
    assert.equal(derivation.exactReversal, true);
    assert.equal(derivation.candidateWrapperSha256, wrapperSha256);
    assert.equal(sha256(artifacts["within_remux.c"]), derivation.candidateWrapperSha256);
    if (exactAac) {
      const mov = JSON.parse(await readBounded(compiled, movProof, 8192));
      assert.equal(mov.exactReversal, true);
      assert.equal(mov.generatedSha256, exactAacMovSha256);
      assert.equal(sha256(artifacts["movenc.c"]), exactAacMovSha256);
      derivation.mov = mov;
    }
    assert.deepEqual(await published(), release, "Published artifacts must stay byte-exact");
    assert.deepEqual(artifacts["build-manifest.json"], release["build-manifest.json"], "Build configuration must stay byte-exact");
    if (probeDecoder) {
      assert.deepEqual(assertH264ProbeDecoderConfig(artifacts["config-components.h"]),
        { enabledDecoders: derivation.library.enabledDecoders, configSha256: derivation.library.configSha256 });
      assert.equal(sha256(artifacts["build-libraries.sh"]), derivation.library.generatedSha256);
      artifacts["build-manifest.json"] = Buffer.from(makeH264ProbeDecoderManifest(artifacts["build-manifest.json"]));
    }
    const wasm = artifacts["within-direct.wasm"];
    assert.ok(WebAssembly.validate(wasm));
    assert.notEqual(sha256(wasm), sha256(release["within-direct.wasm"]), "Refuse to label released Wasm a candidate");
    if (exactAac) assert.notEqual(sha256(wasm), "f313b5aaa78ec7d6b98e33741241d176d07d92eaf63bcb5ebb14b45989a3273e");
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
  assert.ok(["--prepare", "--prepare-mov"].includes(args[0]));
  await prepare(...args);
}
