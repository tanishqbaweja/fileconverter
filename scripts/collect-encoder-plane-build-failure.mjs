// Preserve the actual terminal failure and immutable Git-source preimage before correction.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const runId = "38043483415", commit = "a446deb25583b8b22de4da216222da91991ab4fd";
const proofPath = `evidence/mpeg2-encoder-plane-build-failure-${runId}.json`;
await assert.rejects(access(path.join(root, proofPath)), { code: "ENOENT" });
const runtime = await createOwnedRuntimeScratch("encoder-plane-failed-build-");
let run, logs, archives, sourcePins;
const archive = async (suffix, data) => {
  assert.ok(data.length <= 4194304); const bytes = gzipSync(data, { level: 9 });
  assert.deepEqual(gunzipSync(bytes, { maxOutputLength: 4194304 }), data);
  const file = `outputs/reports/mpeg2-encoder-plane-failure-${runId}-${suffix}.gz`;
  await writeFile(path.join(root, file), bytes, { flag: "wx" });
  return { path: file, bytes: bytes.length, sha256: sha(bytes), restoredBytes: data.length, restoredSha256: sha(data) };
};
try {
  const gh = async args => (await exec("D:/Program Files/GitHub CLI/gh.exe", args,
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 4194304 })).stdout;
  const repo = "tanishqbaweja/fileconverter";
  run = JSON.parse(await gh(["run", "view", runId, "--repo", repo, "--json", "databaseId,status,conclusion,headSha,headBranch,createdAt,updatedAt,url,jobs"]));
  assert.equal(String(run.databaseId), runId); assert.equal(run.headSha, commit);
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, "failure");
  assert.equal(run.jobs.flatMap(job => job.steps).find(step => step.name === "Remove repository-local build data")?.conclusion, "success");
  logs = await gh(["run", "view", runId, "--repo", repo, "--log-failed"]);
  assert.match(logs, /libavutil\/buffer\.c:265:15: error: no previous prototype for function 'ff_within_mpeg2_single_idle_plane_pool'/);
  assert.match(logs, /make: \*\*\* \[ffbuild\/common\.mak:91: libavutil\/buffer\.o\] Error 1/);
  const files = ["media/ffmpeg/build-mpeg2-encoder-planes.mjs", "media/ffmpeg/mpeg2-encoder-plane-recipe.mjs",
    "media/ffmpeg/mpeg2-encoder-plane-source.mjs", "media/ffmpeg/mpeg2-encoder-plane-policy.h",
    "media/ffmpeg/mpeg2-encoder-plane-smoke.c", "media/ffmpeg/patch-mpeg2-encoder-planes.mjs",
    "media/ffmpeg/build-mpeg2-split-encoder.sh", "media/ffmpeg/mpeg2-split-encoder.c",
    "media/ffmpeg/mpeg2-accessory-smoke.c", "scripts/verify-mpeg2-split-encoder-native.mjs",
    "media/ffmpeg/patches/mpeg2-encoder-uncached-frame-buffers.patch",
    "media/ffmpeg/patches/mpeg2-encoder-uncached-accessories.patch", ".github/workflows/reproduce-ffmpeg-nondocker.yml"];
  const sources = {}; sourcePins = {};
  for (const file of files) {
    const { stdout } = await exec("git", ["show", `${commit}:${file}`],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 1048576 });
    sources[file] = stdout; sourcePins[file] = sha(stdout);
  }
  archives = { failedStepLogs: await archive("step-log.txt", Buffer.from(logs)),
    executedSources: await archive("executed-sources.json", Buffer.from(JSON.stringify({ commit, sources, sourcePins }))) };
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const proof = { observedAt: new Date().toISOString(), status: "actual-terminal-compiler-failure-preserved-not-reclassified",
  run, firstFatalDiagnostic: "libavutil/buffer.c:265:15 no previous prototype for ff_within_mpeg2_single_idle_plane_pool [-Werror,-Wmissing-prototypes]",
  optionalStdbitConfigureProbeNotCause: true, actualLibraryBuildFailed: true, compiledLifecycleExecuted: false,
  compiledEncoderProduced: false, browserConversions: 0, failureRemainsFailed: true, archives, executedSourcePins: sourcePins,
  hostedCleanupStepPassed: true, artifactRetentionNotNeededOnCompilerFailure: true, ownedCollectorRuntimeRemoved: true,
  originalRead: false, publicAcceptance: false, collectorSha256: sha(await readFile(new URL(import.meta.url))),
  next: "Add a private forward declaration without weakening -Werror=missing-prototypes or changing pool policy/heaps/codec settings. Preserve this exact failure and source archive before one changed isolated build." };
await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, failurePreserved: true, logBytes: Buffer.byteLength(logs), hostedCleanupPassed: true }));
