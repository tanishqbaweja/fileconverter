// Retrieve only the exact hosted tools, before launching any local browser.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { deriveMkvEditListBuildRecipe, sha256 } from "../../media/ffmpeg/mkv-edit-list-build-recipe.mjs";
import { editListParentSha256, exactAacWrapperSha256, exactAacMovSha256, exactAacBuildRef } from "../../media/ffmpeg/mkv-exact-aac-timeline-candidate.mjs";
import { readWasmMemoryLimits } from "./wasm-memory-limits.mjs";
import { readEmscriptenExportAbi } from "./wasm-export-abi.mjs";

const repo = "tanishqbaweja/fileconverter", branch = "codex/mkv-edit-list-native-20261108";
const root = path.resolve(import.meta.dirname, "../.."), execute = promisify(execFile);
const proofName = "mkv-edit-list-build-proof.json";
const limits = { "within-direct.mjs": 256 * 1024, "within-direct.wasm": 2 * 1024 * 1024,
  "build-manifest.json": 32 * 1024, "within_remux.c": 512 * 1024, "LICENSE.ffmpeg-lgpl3": 32 * 1024, [proofName]: 8192 };

export function checkMkvEditListArchive({ run, artifact, archive }, runId, head, exactAac = false) {
  assert.equal(typeof exactAac, "boolean");
  const expectedBranch = exactAac ? exactAacBuildRef : branch;
  assert.equal(String(run.id), runId);
  assert.equal(run.workflow_id, 345162646);
  assert.equal(run.head_sha, head);
  assert.equal(run.head_branch, expectedBranch);
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.equal(artifact.name, `unpublished-mkv-edit-list-${runId}`);
  assert.equal(artifact.expired, false);
  assert.equal(String(artifact.workflow_run.id), runId);
  assert.equal(artifact.workflow_run.head_branch, expectedBranch);
  assert.equal(artifact.workflow_run.head_sha, head);
  assert.ok(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 2097152);
  if (archive) {
    assert.equal(archive.length, artifact.size_in_bytes);
    assert.equal(`sha256:${sha256(archive)}`, artifact.digest);
  } else assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/);
}

export async function loadMkvEditListBuildArtifact(runId, head, runtime, exactAac = false) {
  assert.match(runId, /^[1-9]\d{1,14}$/);
  assert.match(head, /^[a-f0-9]{40}$/);
  const gh = process.env.WITHIN_GH_EXECUTABLE ?? "gh";
  const env = { ...runtime.env, GH_PROMPT_DISABLED: "true" };
  const capture = async (exe, args, maxBuffer) => (await execute(exe, args,
    { cwd: root, env, windowsHide: true, encoding: "buffer", timeout: 45000, maxBuffer })).stdout;
  const request = (endpoint, cap = 131072) => capture(gh, ["api", `repos/${repo}/actions/${endpoint}`], cap);
  const [run, list] = await Promise.all([request(`runs/${runId}`), request(`runs/${runId}/artifacts?per_page=10`)]);
  const identity = JSON.parse(run), { total_count, artifacts } = JSON.parse(list);
  assert.equal(total_count, 1);
  assert.equal(artifacts.length, 1);
  const artifact = artifacts[0];
  assert.ok(Number.isSafeInteger(artifact.id) && artifact.id > 0);
  checkMkvEditListArchive({ run: identity, artifact }, runId, head, exactAac);
  const archive = await request(`artifacts/${artifact.id}/zip`, 2097152);
  checkMkvEditListArchive({ run: identity, artifact, archive }, runId, head, exactAac);
  const file = path.join(runtime.directory, "mkv-edit-list-tools.zip");
  await writeFile(file, archive, { flag: "wx" });
  // List first, then read each allowlisted entry to bounded stdout. Never
  // extract paths or trust ZIP names to choose a filesystem destination.
  const tar = path.join(process.env.SystemRoot ?? "C:/Windows", "System32/tar.exe");
  const names = (await capture(tar, ["-tf", file], 8192)).toString().trimEnd().split(/\r?\n/);
  const expected = exactAac ? { ...limits, "movenc.c": 512 * 1024 } : limits;
  assert.deepEqual(names.sort(), Object.keys(expected).sort());
  const content = {};
  for (const name of names) content[name] = await capture(tar, ["-xOf", file, name], expected[name]);
  const proof = JSON.parse(content[proofName]);
  assert.equal(proof.schemaVersion, 1);
  assert.equal(proof.head, head);
  assert.equal(proof.runId, runId);
  assert.equal(proof.source.candidateBuildRun, true);
  assert.equal(proof.source.candidateWrapperSha256, exactAac ? exactAacWrapperSha256 : editListParentSha256);
  if (exactAac) {
    assert.equal(proof.source.exactAacPriming, true);
    assert.equal(proof.source.packetClocksRewritten, false);
    assert.equal(proof.source.extraPacketBuffering, false);
    assert.equal(proof.source.mov.exactReversal, true);
    assert.equal(proof.source.mov.generatedSha256, exactAacMovSha256);
    assert.equal(sha256(content["movenc.c"]), exactAacMovSha256);
  }
  const { generated: _generated, ...recipe } = deriveMkvEditListBuildRecipe(await readFile(path.join(root, "media/ffmpeg/reproduce-nondocker.sh")), { exactAac });
  assert.deepEqual(proof.recipe, recipe);
  assert.equal(proof.publishedArtifactsUnchanged, true);
  assert.equal(proof.publicAcceptance, false);
  assert.deepEqual(Object.keys(proof.artifacts).sort(), names.filter(name => name !== proofName));
  for (const [name, data] of Object.entries(content)) if (name !== proofName) {
    assert.ok(data.length > 0 && data.length <= expected[name]);
    assert.deepEqual(proof.artifacts[name], { bytes: data.length, sha256: sha256(data) });
  }
  assert.equal(sha256(content["within_remux.c"]), proof.source.candidateWrapperSha256);
  const release = name => readFile(path.join(root, "public/engines/remux", name));
  assert.deepEqual(content["build-manifest.json"], await release("build-manifest.json"));
  const wasm = content["within-direct.wasm"], module = content["within-direct.mjs"];
  const baseline = await release("within-direct.wasm");
  assert.equal(sha256(baseline), proof.publishedWasmSha256);
  assert.notEqual(sha256(wasm), sha256(baseline));
  if (exactAac) assert.notEqual(sha256(wasm), "f313b5aaa78ec7d6b98e33741241d176d07d92eaf63bcb5ebb14b45989a3273e");
  assert.deepEqual(readWasmMemoryLimits(wasm), readWasmMemoryLimits(baseline));
  assert.deepEqual(readWasmMemoryLimits(wasm), proof.wasmMemory);
  const abi = readEmscriptenExportAbi(module.toString(), wasm);
  const releaseAbi = readEmscriptenExportAbi((await release("within-direct.mjs")).toString(), baseline);
  assert.deepEqual([abi.parameters, abi.results], [releaseAbi.parameters, releaseAbi.results]);
  return { proof: { head, runId, artifact: { id: artifact.id, digest: artifact.digest, bytes: artifact.size_in_bytes }, build: proof, abi },
    assets: new Map([["/engines/remux/within-direct.mjs", { body: module, type: "text/javascript" }],
      ["/engines/remux/within-direct.wasm", { body: wasm, type: "application/wasm" }]]) };
}
