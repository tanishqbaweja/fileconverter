// Successful source-bound hosted tool only. No browser/fixture/public mutation.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readdir, realpath, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { aiffId3ToolSizeLimit } from "./lib/aiff-id3-tool-size.mjs";
import { AIFF_ID3_SPECIALIST_EDITS, PUBLISHED_AIFF_SOURCE_SHA256 } from "../media/ffmpeg/aiff-id3-specialist-source.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const runId = process.argv[2]; assert.equal(process.argv.length, 3); assert.equal(runId, "37998603437");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const cache = path.join(root, `work/aiff-id3-specialist-${runId}`), proofPath = path.join(root, `evidence/aiff-id3-specialist-build-${runId}.json`);
for (const file of [cache, proofPath]) await assert.rejects(access(file), { code: "ENOENT" });
const branch = JSON.parse(await readFile(path.join(root, "evidence/aiff-id3-specialist-build-branch-v2-2026-10-10.json")));
assert.equal(branch.commit, "20cf3cb851fd45225754e0a1e42be0343aabeaf1");
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 64 * 1024 ** 2);
const publishedWasm = await readFile(path.join(root, "public/engines/remux/within-aiff.wasm"));
const publishedToolSizeReference = { bytes: publishedWasm.length, sha256: sha(publishedWasm), maximumMetadataModuleGrowthBytes: 1024 ** 2 };
const runtime = await createOwnedRuntimeScratch("aiff-id3-artifact-");
const gh = "D:/Program Files/GitHub CLI/gh.exe", repo = "tanishqbaweja/fileconverter";
const call = async args => (await execute(gh, args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 1048576 })).stdout;
let run, artifact, manifest, files, identity, complete = false;
try {
  run = JSON.parse(await call(["run", "view", runId, "--repo", repo, "--json", "databaseId,headSha,createdAt,updatedAt,status,conclusion,jobs,url"]));
  assert.equal(String(run.databaseId), runId); assert.equal(run.headSha, branch.commit);
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success");
  assert.equal(run.jobs.length, 1); assert.ok(run.jobs.every(job => job.conclusion === "success"));
  const steps = run.jobs.flatMap(job => job.steps);
  for (const name of ["Retain private metadata-only AIFF specialist", "Remove repository-local build data"])
    assert.equal(steps.find(step => step.name === name)?.conclusion, "success");
  const listing = JSON.parse(await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`]));
  assert.equal(listing.total_count, 1); artifact = listing.artifacts[0];
  assert.equal(artifact.name, `private-aiff-id3-specialist-${runId}`); assert.equal(artifact.expired, false);
  assert.equal(artifact.workflow_run.head_sha, branch.commit); assert.equal(String(artifact.workflow_run.id), runId);
  assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 8 * 1024 ** 2);
  const download = path.join(runtime.directory, "tools");
  await call(["run", "download", runId, "--repo", repo, "--name", artifact.name, "--dir", download]);
  const names = await readdir(download); assert.equal(names.length, 12); files = [];
  for (const file of names.toSorted()) {
    assert.match(file, /^(?:within-aiff\.(?:mjs|wasm)|build-manifest\.json|within_aiff\.c|config_components\.h|LICENSE\.(?:lame|lame-linking|libogg|libtheora|libvorbis|opencore-amr|opus))$/);
    const info = await lstat(path.join(download, file));
    const limit = aiffId3ToolSizeLimit(file, publishedWasm.length);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= limit,
      `${file}: ${info.size} bytes; regular nonempty tool-file limit ${limit}`);
    files.push({ file, bytes: info.size, sha256: sha(await readFile(path.join(download, file))) });
  }
  assert.ok(files.reduce((sum, row) => sum + row.bytes, 0) <= 16 * 1024 ** 2);
  manifest = JSON.parse(await readFile(path.join(download, "build-manifest.json")));
  assert.equal(manifest.scope, "private-changed-source-build-not-browser-or-public-acceptance");
  assert.equal(manifest.engine, "within-aiff-private-id3-specialist");
  assert.equal(manifest.initialWasmMemoryBytes, 16777216); assert.equal(manifest.maximumWasmMemoryBytes, 33554432);
  assert.equal(manifest.modules.length, 1); assert.equal(manifest.modules[0].name, "within-aiff");
  assert.equal(manifest.modules[0].entrypoint, "within_aiff"); assert.equal(manifest.modules[0].wasmPthreadPoolSize, 0);
  assert.equal(manifest.modules[0].videoCodecThreads, 1); assert.deepEqual(manifest.profiles, ["m4a-to-aiff"]);
  assert.deepEqual(Object.keys(manifest.artifacts).toSorted(), names.filter(name => name !== "build-manifest.json").toSorted());
  for (const [file, hash] of Object.entries(manifest.artifacts)) assert.equal(files.find(row => row.file === file)?.sha256, hash, file);
  // Verify executed source against the immutable dispatched Git commit, never
  // silently rebind the compile to a subsequently corrected working tree.
  for (const [file, hash] of Object.entries(manifest.sources)) {
    assert.match(file, /^(?:media\/ffmpeg\/|scripts\/lib\/|\.github\/workflows\/)[a-zA-Z0-9_./-]+$/);
    assert.ok(!file.split("/").includes(".."));
    const { stdout } = await execute("git", ["show", `${branch.commit}:${file}`], { cwd: root, env: runtime.env,
      windowsHide: true, encoding: "buffer", timeout: 30000, maxBuffer: 1048576 });
    assert.equal(sha(stdout), hash, file);
  }
  assert.equal(manifest.sources[branch.workflow.path], branch.workflow.generatedSha256);
  for (const [file, hash] of Object.entries(branch.sourcePins).filter(([file]) => file.startsWith("media/ffmpeg/") || file === "scripts/lib/aiff-id3-build-workflow.mjs"))
    assert.equal(manifest.sources[file], hash, file);
  const source = await readFile(path.join(download, "within_aiff.c"), "utf8"); let published = source;
  for (const [before, after] of AIFF_ID3_SPECIALIST_EDITS.toReversed()) {
    assert.equal(published.split(after).length, 2); published = published.replace(after, before);
  }
  assert.equal(sha(published), PUBLISHED_AIFF_SOURCE_SHA256);
  assert.equal(manifest.metadataCandidate.compiledSourceSha256, sha(source));
  assert.equal(manifest.modules[0].sourceSha256, sha(source));
  assert.equal(manifest.metadataCandidate.publishedSourceRecoveredSha256, sha(published));
  assert.equal(manifest.metadataCandidate.generatedRecipeSha256, "e34d82eb3d905e59927870a8f38361c210570dd2e1748c685267b9154bad9133");
  assert.equal(manifest.metadataCandidate.allowedSourceEdits, 5);
  for (const key of ["codecSettingsChanged", "ioBoundsChanged", "memoryLimitsRaised", "actualBrowserConversionVerified", "publicAcceptance"])
    assert.equal(manifest.metadataCandidate[key], false, key);
  assert.deepEqual(readWasmMemoryLimits(await readFile(path.join(download, "within-aiff.wasm"))),
    [{ imported: true, initialPages: 256, maximumPages: 512, shared: true }]);
  assert.ok((await readFile(path.join(download, "within-aiff.mjs"), "utf8")).includes("within_aiff"));
  assert.match(await readFile(path.join(download, "config_components.h"), "utf8"), /^#define CONFIG_AIFF_MUXER 1$/m);
  await mkdir(cache); identity = await lstat(cache, { bigint: true });
  assert.ok(identity.isDirectory() && !identity.isSymbolicLink()); assert.equal(await realpath(cache), cache);
  for (const row of files) await copyFile(path.join(download, row.file), path.join(cache, row.file), constants.COPYFILE_EXCL);
  for (const row of files) assert.equal(sha(await readFile(path.join(cache, row.file))), row.sha256);
  complete = true;
} finally {
  try { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
  finally { if (identity && !complete) {
    assert.equal(path.dirname(cache), path.join(root, "work")); const current = await lstat(cache, { bigint: true });
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
    assert.ok(current.isDirectory() && !current.isSymbolicLink()); assert.equal(await realpath(cache), cache);
    await rm(cache, { recursive: true });
  } }
}
const result = { recordedAt: new Date().toISOString(), status: "actual-private-aiff-id3-build-source-and-wasm-bounds-verified-not-browser-acceptance",
  run, artifact, manifest, files, publishedToolSizeReference, reusableToolDirectory: cache, reusableToolBytes: files.reduce((sum, row) => sum + row.bytes, 0),
  retentionReason: "Small private tool required for pending genuine browser tag/artwork/audio/memory tests; remove when superseded",
  downloadRuntimeRemoved: true, hostedCleanupStepPassed: true, compiledCMetadataEditsReversedExactly: true,
  actualWasmLimitsIndependentlyVerified: true, collectorSourceSha256: sha(await readFile(new URL(import.meta.url))),
  originalReadOrCopied: false, noDocker: true, browserConversionsPerformed: 0, publishedAssetsChanged: false,
  speedImprovementProven: false, audioFidelityAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false };
await writeFile(proofPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, tools: cache, bytes: result.reusableToolBytes, actualWasmLimitsVerified: true, publicAcceptance: false }));
