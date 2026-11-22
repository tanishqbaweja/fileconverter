// Compile authorization remains in the CI builder. This step authenticates
// real built files and stages a private static layout, never a deployment.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORRECTED_DIRECT_MKV_CORE } from "../lib/mkv-corrected-direct-qualification.ts";
import { loadQualifiedHeaderNativeCache } from "./lib/mkv-header-native-cache.mjs";
import { readEmscriptenExportAbi } from "./lib/wasm-export-abi.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";

const root = path.resolve(import.meta.dirname, ".."), buildProofName = "mkv-edit-list-build-proof.json";
const sha = b => createHash("sha256").update(b).digest("hex");
const jobKeys = ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_JOB", "GITHUB_SHA"];
const evidenceKeys = ["schemaVersion", "recipe", "source", "wasmMemory", "publishedWasmSha256",
  "publishedArtifactsUnchanged", "artifacts", "browserTimelineVerified", "firstFragmentMemoryVerified", "mediaInputs", "publicAcceptance"];

export function assertExactMkvHeaderRebuild(qualified, rebuilt, job) {
  assert.equal(rebuilt.head, job.GITHUB_SHA); assert.equal(rebuilt.runId, job.GITHUB_RUN_ID);
  assert.match(rebuilt.head, /^[a-f0-9]{40}$/); assert.match(rebuilt.runId, /^[0-9]+$/);
  assert.notEqual(rebuilt.runId, qualified.runId, "A genuinely new run must rebuild the native artifacts");
  assert.deepEqual(Object.keys(rebuilt).sort(), [...evidenceKeys, "head", "runId"].sort());
  for (const key of evidenceKeys) assert.deepEqual(rebuilt[key], qualified.build[key], `Rebuild proof differs: ${key}`);
  assert.equal(rebuilt.publishedArtifactsUnchanged, true);
  assert.equal(rebuilt.mediaInputs, 0); assert.equal(rebuilt.publicAcceptance, false);
}

export function assertExactMkvHeaderArtifact(body, expected, name) {
  assert.ok(Buffer.isBuffer(body));
  assert.equal(body.length, expected.bytes, `Rebuilt byte extent changed: ${name}`);
  assert.equal(sha(body), expected.sha256, `Rebuilt SHA-256 changed: ${name}`);
}

const checkedRead = async (directory, name, limit) => {
  assert.match(name, /^[a-zA-Z0-9._-]+$/);
  assert.ok(name !== "." && name !== "..");
  const file = path.join(directory, name), info = await lstat(file);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= limit, name);
  assert.equal(await realpath(file), file);
  const bytes = await readFile(file);
  assert.equal(bytes.length, info.size);
  return bytes;
};

export function privateMkvHeaderPackageLayout() {
  const entries = {
    "within-direct.mjs": CORRECTED_DIRECT_MKV_CORE.module.slice(1),
    "within-direct.wasm": CORRECTED_DIRECT_MKV_CORE.wasm.slice(1),
    "LICENSE.ffmpeg-lgpl3": "engines/remux-qualification/LICENSE.ffmpeg-lgpl3",
  };
  assert.equal(entries["within-direct.mjs"], "engines/remux-qualification/mkv-header-41c4a075.mjs");
  assert.equal(entries["within-direct.wasm"], "engines/remux-qualification/mkv-header-41c4a075.wasm");
  return entries;
}

async function verifyOwnedCiRebuild(env) {
  assert.equal(env.GITHUB_ACTIONS, "true");
  assert.equal(env.GITHUB_JOB, "corrected-mkv-reproduction");
  const owner = env.WITHIN_CI_RUNTIME_OWNER, ciRoot = path.dirname(owner);
  assert.equal(path.dirname(ciRoot), path.join(root, "work"));
  assert.match(path.basename(ciRoot), /^ci-[A-Za-z0-9]{6}$/);
  assert.equal(owner, path.join(ciRoot, "ci-runtime-owner.json")); assert.equal(await realpath(ciRoot), ciRoot);
  const record = JSON.parse(await checkedRead(ciRoot, path.basename(owner), 8192)), info = await lstat(ciRoot, { bigint: true });
  assert.equal(record.directory, ciRoot); assert.equal(record.schemaVersion, 1);
  assert.equal(record.dev, String(info.dev)); assert.equal(record.ino, String(info.ino));
  const job = Object.fromEntries(jobKeys.map(key => [key, env[key]]));
  assert.deepEqual(record.job, job);

  const { proof: qualified } = await loadQualifiedHeaderNativeCache(root);
  const input = path.join(ciRoot, "mkv-timeline-artifacts");
  assert.equal(await realpath(input), input);
  const rebuilt = JSON.parse(await checkedRead(input, buildProofName, 32768));
  assertExactMkvHeaderRebuild(qualified, rebuilt, job);
  const all = Object.entries(qualified.build.artifacts);
  assert.equal(all.length, 10);
  assert.deepEqual((await readdir(input)).sort(), [buildProofName, ...all.map(([name]) => name)].sort());
  const artifacts = new Map();
  for (const [name, expected] of all) {
    const bytes = await checkedRead(input, name, 8 * 1048576);
    assertExactMkvHeaderArtifact(bytes, expected, name);
    artifacts.set(name, bytes);
  }
  const wasm = artifacts.get("within-direct.wasm"), glue = artifacts.get("within-direct.mjs");
  assert.ok(WebAssembly.validate(wasm));
  assert.deepEqual(readWasmMemoryLimits(wasm), qualified.build.wasmMemory);
  assert.deepEqual(readEmscriptenExportAbi(glue.toString("utf8"), wasm), qualified.abi);

  const packageRoot = path.join(ciRoot, "private-corrected-mkv-package");
  await mkdir(packageRoot);
  await mkdir(path.join(packageRoot, "engines", "remux-qualification"), { recursive: true });
  const layout = privateMkvHeaderPackageLayout();
  const packaged = [];
  for (const [name, relative] of Object.entries(layout)) {
    const out = path.join(packageRoot, relative), bytes = artifacts.get(name);
    await writeFile(out, bytes, { flag: "wx" });
    assertExactMkvHeaderArtifact(await checkedRead(path.dirname(out), path.basename(out), 8 * 1048576), qualified.build.artifacts[name], name);
    packaged.push({ relative, ...qualified.build.artifacts[name] });
  }
  const receipt = { schemaVersion: 1, status: "verified-fresh-exact-rebuild-and-private-package-layout", job,
    previousQualifiedBuild: { head: qualified.head, runId: qualified.runId },
    rebuiltArtifacts: rebuilt.artifacts, wasmMemory: qualified.build.wasmMemory, abi: qualified.abi,
    packaged, publishedArtifactsUnchanged: true, browserRun: false, publicAcceptance: false, deployed: false, mediaInputs: 0 };
  const output = path.join(ciRoot, "mkv-hevc-header-reproduction-receipt.json");
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  return { receipt, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2);
  const { receipt, output } = await verifyOwnedCiRebuild(process.env);
  const { appendFile } = await import("node:fs/promises");
  assert.doesNotMatch(output, /[\r\n]/);
  await appendFile(process.env.GITHUB_OUTPUT, `receipt=${output}\n`);
  console.log(JSON.stringify(receipt));
}
