// Authenticated static private tools only. No original/converted media is read.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { makeVp9PacketDurationSource } from "../media/ffmpeg/vp9-packet-duration-recipe.mjs";
import { makeVp9StreamDurationSource } from "../media/ffmpeg/vp9-stream-duration-recipe.mjs";
import { makeVp9OriginalWidthSource } from "../media/ffmpeg/vp9-original-width-recipe.mjs";
assert.equal(process.argv.length, 3); const attempt = process.argv[2]; assert.match(attempt, /^[1-9]$/);
const suffix = attempt === "1" ? "" : "-attempt" + attempt, root = path.resolve(import.meta.dirname, ".."), repo = "tanishqbaweja/fileconverter";
const prefix = Number(attempt) >= 5 ? "evidence/2026-11-06-vp9-original-width" : "evidence/2026-11-05-vp9-duration";
const dispatch = JSON.parse(await readFile(path.join(root, prefix + "-build-dispatch" + suffix + ".json")));
const runId = dispatch.run.databaseId; assert.ok(Number.isSafeInteger(runId));
const terminal = JSON.parse(await readFile(path.join(root, prefix + `-build-${runId}-terminal.json`)));
assert.equal(terminal.head, dispatch.head); assert.equal(terminal.conclusion, "success"); assert.equal(terminal.cleanupStepsPassed, true);
const target = path.join(root, `work/vp9-duration-input-${runId}`), output = path.join(root, prefix + `-native-${runId}.json`);
await assert.rejects(access(target), { code: "ENOENT" }); await assert.rejects(access(output), { code: "ENOENT" });
assert.equal(await realpath(path.join(root, "work")), path.join(root, "work"));
const sha = value => createHash("sha256").update(value).digest("hex"), execute = promisify(execFile);
const runtime = await createOwnedRuntimeScratch("vp9-duration-collection-");
let retained = false, identity;
try {
  const gh = async (args, maxBuffer = 1048576) => (await execute(process.env.WITHIN_GH_EXECUTABLE ?? "gh", args,
    { cwd: root, env: { ...runtime.env, GH_PROMPT_DISABLED: "true" }, windowsHide: true, timeout: 60000, maxBuffer, encoding: "buffer" })).stdout;
  const artifact = JSON.parse(await gh(["api", `repos/${repo}/actions/artifacts/${terminal.artifact.id}`]));
  assert.equal(artifact.workflow_run.head_sha, dispatch.head); assert.equal(artifact.workflow_run.id, runId);
  assert.equal(artifact.name, `private-vp9-duration-${runId}`); assert.equal(artifact.expired, false);
  assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 33554432);
  const zip = await gh(["api", `repos/${repo}/actions/artifacts/${artifact.id}/zip`], 33554432);
  assert.equal(artifact.digest, "sha256:" + sha(zip));
  const allowed = ["within-remux.mjs", "within-remux.wasm", "within_remux.base.c", "within_remux.duration.c", "vp9-duration-source-proof.json",
    "config_components.h", "build-manifest.json", "LICENSE.lame", "LICENSE.lame-linking", "LICENSE.libogg", "LICENSE.libtheora",
    "LICENSE.libvorbis", "LICENSE.opencore-amr", "LICENSE.opus", "LICENSE.ffmpeg-lgpl3", "LICENSE.libvpx"];
  const seen = new Set(); let total = 0;
  const members = unzipSync(zip, { filter(entry) {
    assert.ok(allowed.includes(entry.name) && !seen.has(entry.name)); seen.add(entry.name);
    assert.ok(entry.originalSize > 0 && entry.originalSize <= (entry.name.endsWith(".wasm") ? 16777216 : 2097152));
    total += entry.originalSize; assert.ok(total <= 25165824); return true;
  } });
  assert.deepEqual(Object.keys(members).sort(), allowed.toSorted());
  const manifest = JSON.parse(Buffer.from(members["build-manifest.json"]).toString());
  assert.ok(["private-vp9-packet-duration", "private-vp9-stream-duration", "private-vp9-original-width"].includes(manifest.engine)); assert.equal(manifest.candidate.publicAcceptance, false);
  assert.equal(manifest.candidate.browserValidated, false); assert.equal(manifest.candidate.nodeInstantiated, false);
  assert.equal(manifest.candidate.mediaRead, false); assert.equal(manifest.candidate.mediaWritten, false);
  assert.equal(manifest.candidate.memoryLimitsRaised, false); assert.equal(manifest.buildEnvironment.usedDocker, false);
  assert.deepEqual(Object.keys(manifest.artifacts).sort(), allowed.filter(file => file !== "build-manifest.json").toSorted());
  for (const [file, pin] of Object.entries(manifest.artifacts)) { assert.equal(members[file].length, pin.bytes); assert.equal(sha(members[file]), pin.sha256); }
  for (const [file, pin] of Object.entries(manifest.sources)) {
    assert.match(file, /^(?:media\/ffmpeg|scripts\/lib|\.github\/workflows)\/[a-z0-9/_.-]+$/i); assert.ok(!file.split("/").includes(".."));
    const source = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["show", dispatch.head + ":" + file],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576, encoding: "buffer" })).stdout;
    assert.equal(sha(source), pin, file);
  }
  assert.equal(sha(await readFile(path.join(root, "media/ffmpeg/vp9-packet-duration-recipe.mjs"))), manifest.sources["media/ffmpeg/vp9-packet-duration-recipe.mjs"]);
  const originalWidth = manifest.engine === "private-vp9-original-width", streamDuration = manifest.engine === "private-vp9-stream-duration" || originalWidth;
  if (streamDuration) assert.equal(sha(await readFile(path.join(root, "media/ffmpeg/vp9-stream-duration-recipe.mjs"))), manifest.sources["media/ffmpeg/vp9-stream-duration-recipe.mjs"]);
  if (originalWidth) {
    assert.equal(sha(await readFile(path.join(root, "media/ffmpeg/vp9-original-width-recipe.mjs"))), manifest.sources["media/ffmpeg/vp9-original-width-recipe.mjs"]);
    assert.equal(manifest.candidate.privateVp9ExplicitWidth, 1920); assert.equal(manifest.candidate.defaultWidthPolicyChanged, false);
    assert.equal(manifest.candidate.publicWidthRegistryOrControlsChanged, false);
  }
  const sourceProof = (originalWidth ? makeVp9OriginalWidthSource : streamDuration ? makeVp9StreamDurationSource : makeVp9PacketDurationSource)(Buffer.from(members["within_remux.base.c"]).toString());
  assert.equal(sourceProof.parentSha256, "ff8926c995010617bcc76701f0ea75feb5a2c99dadb136d8b8d1c8703e5d6dcd");
  assert.equal(sourceProof.generated, Buffer.from(members["within_remux.duration.c"]).toString());
  assert.equal(sourceProof.generatedSha256, manifest.candidate.compiledWrapperSha256);
  assert.equal(sourceProof.edits.length, manifest.candidate.wrapperEdits);
  const limits = readWasmMemoryLimits(members["within-remux.wasm"]);
  assert.deepEqual(limits, manifest.candidate.wasmMemoryLimits);
  assert.deepEqual(limits, readWasmMemoryLimits(await readFile(path.join(root, "public/engines/remux/within-remux.wasm"))));
  assert.ok(WebAssembly.validate(members["within-remux.wasm"]));
  await mkdir(target); identity = await lstat(target, { bigint: true });
  for (const [file, bytes] of Object.entries(members)) await writeFile(path.join(target, file), bytes, { flag: "wx" });
  const report = { runId, head: dispatch.head, status: "authenticated-private-source-built-duration-tool-not-browser-acceptance",
    artifact: { id: artifact.id, bytes: zip.length, sha256: sha(zip), expiresAt: artifact.expires_at }, nativeContract: manifest,
    retainedDirectory: path.relative(root, target).replaceAll("\\", "/"), retainedBytes: total,
    retainedPurpose: "One reusable static private CPU core for strict browser fidelity testing; remove when obsolete",
    originalRead: false, mediaRead: false, publicAssetReplacement: false, nodeInstantiated: false,
    browserValidated: false, speedGainProven: false, publicAcceptance: false };
  await writeFile(path.join(target, "owned-input.json"), JSON.stringify({ runId, head: dispatch.head, dev: String(identity.dev), ino: String(identity.ino) }) + "\n", { flag: "wx" });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); retained = true;
  console.log(JSON.stringify({ output, retainedDirectory: report.retainedDirectory, retainedBytes: total,
    wasm: manifest.artifacts["within-remux.wasm"], memoryLimits: limits, publicAcceptance: false }));
} finally {
  if (identity && !retained) {
    const current = await lstat(target, { bigint: true }); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
    assert.ok(!current.isSymbolicLink()); assert.equal(await realpath(target), target); await rm(target, { recursive: true, force: true });
  }
  await runtime.close();
}
