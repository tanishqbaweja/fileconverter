// Forensic packaging of an ALREADY compiled binary. Never rebuild, modify Wasm,
// relabel a failed workflow green, or overwrite its original build manifest.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { makeVpxPreservingSource, makeVpxPreservingRecipe, makeVpxPreservingLibraries, verifyVpxSpecialistComponents } from "../../media/ffmpeg/vpx-preserving-candidate.mjs";
import { verifyVpxDecoderComponents } from "../../media/ffmpeg/vpx-decoder-candidate.mjs";
import { readWasmMemoryLimits } from "./wasm-memory-limits.mjs";
import { readEmscriptenExportAbi } from "./wasm-export-abi.mjs";
const root = path.resolve(import.meta.dirname, "../.."), sha = value => createHash("sha256").update(value).digest("hex");
export const VPX_RECOVERY_BUILD = "b53061ba87a310b986ab79a6e12a080a33f58fd5";
export const VPX_RECOVERY_RUN = 39581181533;
const helper = "media/ffmpeg/vpx-preserving-candidate.mjs";
const oldLine = '["enabledBitstreamFilters", "BSF", ["aac_adtstoasc"], ["aac_adtstoasc"]]';
const newLine = '["enabledBitstreamFilters", "BSF", ["aac_adtstoasc", "vp9_superframe", "vp9_superframe_split"], ["aac_adtstoasc"]]';
export function reverseVpxAuditDeclarationCorrection(source) {
  assert.equal(source.split(newLine).length, 2);
  return source.replace(newLine, oldLine);
}
export function verifyVpxRecoveryProvenance(value) {
  assert.equal(value.run, VPX_RECOVERY_RUN); assert.equal(value.job, 119158907067);
  assert.equal(value.buildCommit, VPX_RECOVERY_BUILD); assert.equal(value.workflowConclusion, "failure");
  assert.equal(value.compiledBytesRebuiltOrModified, false);
  assert.equal(value.originalManifestFile, "build-manifest.json"); assert.match(value.originalManifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(value.allowedSourceCorrection, "exact-two-VP9-automatic-BSF-declarations-only");
}
export async function recoverVpxSpecialistManifest(input) {
  const directory = await realpath(path.resolve(input)), work = await realpath(path.join(root, "work"));
  assert.equal(path.dirname(directory), work); assert.equal(path.basename(directory), "vpx-timing-39581181533");
  const read = async file => { const info = await lstat(path.join(directory, file));
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 32 * 1024 ** 2); return readFile(path.join(directory, file)); };
  const git = async args => (await promisify(execFile)("git", args,
    { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 ** 2 })).stdout;
  const old = async file => git(["show", VPX_RECOVERY_BUILD + ":" + file]);
  const builder = await old("media/ffmpeg/build-vpx-preserving-candidate.mjs");
  const sourceFiles = JSON.parse(/const sourceFiles = (\[[\s\S]*?\]);/.exec(builder)?.[1] ?? "null");
  assert.ok(Array.isArray(sourceFiles) && sourceFiles.length > 10);
  const tree = (await git(["ls-tree", "-r", "--name-only", VPX_RECOVERY_BUILD, "--", "media/ffmpeg"])).trim().split("\n");
  for (const file of tree) if (/^media\/ffmpeg\/build-(vpx|opencore-amr|lame|opus|ogg|vorbis)\.sh$/.test(file) || /^media\/ffmpeg\/patches\/[^/]+\.patch$/.test(file)) sourceFiles.push(file);
  assert.equal(sourceFiles.length, 40); assert.equal(new Set(sourceFiles).size, 40);
  const sources = {};
  for (const file of sourceFiles) {
    assert.match(file, /^(?:media|scripts|\.github)\/[A-Za-z0-9_./-]+$/); assert.ok(!file.split("/").includes(".."));
    const frozen = await old(file); sources[file] = sha(frozen);
    if (file === ".github/workflows/reproduce-ffmpeg-nondocker.yml") continue; // Normal auditor checks the exact private workflow derivative.
    let current = await readFile(path.join(root, file), "utf8");
    if (file === helper) current = reverseVpxAuditDeclarationCorrection(current);
    assert.equal(sha(current), sources[file], "Build source changed outside the declared audit-only correction: " + file);
  }
  const raw = await read("build-manifest.json"), original = JSON.parse(raw);
  const base = (await read("within_remux.vpx-base.c")).toString(), compiled = (await read("within_remux.vpx.c")).toString();
  const derived = makeVpxPreservingSource(base); assert.equal(compiled, derived.generated);
  assert.equal(derived.generatedSha256, "51167f7af62176f589ce18c880b80770990b75c9b5af621789689561b5440dfc");
  const libraries = makeVpxPreservingLibraries((await read("build-libraries.base.sh")).toString());
  assert.equal((await read("build-libraries.vpx.sh")).toString(), libraries.generated);
  const config = (await read("config_components.h")).toString(), components = verifyVpxDecoderComponents(config), inventory = verifyVpxSpecialistComponents(config);
  assert.deepEqual(inventory.enabledBitstreamFilters, ["aac_adtstoasc", "vp9_superframe", "vp9_superframe_split"]);
  const wasm = await read("within-remux.wasm"), mjs = await read("within-remux.mjs");
  const limits = readWasmMemoryLimits(wasm), abi = readEmscriptenExportAbi(mjs.toString(), wasm);
  assert.deepEqual(limits, [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }]);
  assert.deepEqual(abi.parameters, Array(12).fill(127)); assert.deepEqual(abi.results, [127]);
  const artifacts = {};
  for (const item of await readdir(directory, { withFileTypes: true })) {
    assert.ok(item.isFile() && !item.isSymbolicLink()); assert.notEqual(item.name, "qualification-manifest.json");
    artifacts[item.name] = sha(await read(item.name));
  }
  const profiles = ["mkv-vp8-to-mp4-mpeg4", "mkv-vp9-to-mp4-mpeg4"];
  const provenance = { run: VPX_RECOVERY_RUN, job: 119158907067, buildCommit: VPX_RECOVERY_BUILD,
    workflowConclusion: "failure", compiledBytesRebuiltOrModified: false, originalManifestFile: "build-manifest.json",
    originalManifestSha256: sha(raw), allowedSourceCorrection: "exact-two-VP9-automatic-BSF-declarations-only" };
  verifyVpxRecoveryProvenance(provenance);
  const manifest = { ...original, engine: "within-remux-private-vpx-preserving-specialist",
    modules: original.modules.filter(row => row.name === "within-remux").map(row => ({ ...row, profiles })), sources, artifacts, profiles, ...inventory,
    candidate: { ...components, compiledSourceSha256: sha(compiled), generatedLibrariesSha256: libraries.generatedSha256,
      generatedRecipeSha256: makeVpxPreservingRecipe(await readFile(path.join(root, "media/ffmpeg/reproduce-nondocker.sh"), "utf8")).generatedSha256,
      configureEdits: 3, wrapperChanged: true, specialistComponentInventory: inventory,
      preservationSourceEdits: derived.edits.length, preservationParentSha256: derived.parentSha256,
      maxStreams: derived.maxStreams, maxChapters: derived.maxChapters, maxInterleaveUs: derived.maxInterleaveUs,
      maxFragmentBytes: derived.maxFragmentBytes, maxFragmentUs: derived.maxFragmentUs,
      delayedMoov: true, exactAacPriming: true, encoderSettingsChanged: false, ioChanged: false, wasmMemoryLimits: limits,
      memoryLimitsRaised: false, browserDecodeVerified: false, publicAcceptance: false, postBuildAuditRecovery: provenance } };
  await writeFile(path.join(directory, "qualification-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return { provenance, abi, inventory, artifactPins: artifacts, sourcePins: sources };
}
