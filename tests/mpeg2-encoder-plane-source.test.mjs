import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { applySingleIdlePlaneBuffer, applySingleIdlePlaneGetBuffer, reverseSingleIdlePlaneBuffer,
  reverseSingleIdlePlaneGetBuffer } from "../media/ffmpeg/mpeg2-encoder-plane-source.mjs";
import { makeSingleIdleEncoderPlaneRecipe } from "../media/ffmpeg/mpeg2-encoder-plane-recipe.mjs";
import { makeEncoderPlaneBuildWorkflow } from "../scripts/lib/encoder-plane-build-workflow.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const sha = value => createHash("sha256").update(value).digest("hex"), execute = promisify(execFile);
const proof = JSON.parse(await read("evidence/mpeg2-encoder-plane-source-preflight-2026-10-10.json"));
const compressed = await read(proof.archive.path);
assert.equal(compressed.length, proof.archive.bytes); assert.equal(sha(compressed), proof.archive.sha256);
const bytes = gunzipSync(compressed, { maxOutputLength: 262144 });
assert.equal(bytes.length, proof.archive.restoredBytes); assert.equal(sha(bytes), proof.archive.restoredSha256);
const source = JSON.parse(bytes);
test("Actual pinned upstream source and old encoder stage reverse byte-exactly; live-ref decrement/default pools/alignment unchanged", () => {
  assert.equal(applySingleIdlePlaneBuffer(source.upstream[0].source), source.changedBuffer);
  assert.equal(applySingleIdlePlaneGetBuffer(source.actualOldGet), source.changedGet);
  assert.equal(reverseSingleIdlePlaneBuffer(source.changedBuffer), source.upstream[0].source);
  assert.equal(reverseSingleIdlePlaneGetBuffer(source.changedGet), source.actualOldGet);
  assert.equal(sha(source.changedBuffer), proof.changedBufferSha256); assert.equal(sha(source.changedGet), proof.changedGetSha256);
  const decrement = 'if (atomic_fetch_sub_explicit(&pool->refcount, 1, memory_order_acq_rel) == 1)';
  assert.equal(source.changedBuffer.split(decrement).length, source.upstream[0].source.split(decrement).length);
  assert.match(source.changedGet, /buffer_size\[i\] = size\[i\] \+ 16 \+ STRIDE_ALIGN - 1/);
  assert.match(source.changedBuffer, /memset\(ret->data, 0, ret->size\)/);
  assert.match(source.changedBuffer, /pool->pool_free == within_mpeg2_single_idle_plane_free && pool->pool/);
  assert.equal(proof.publicStructAbiChanged, false);
});
test("Wrong decoder-stage, ambiguous, malformed, repeat or changed sources cannot receive a private pool patch", () => {
  assert.throws(() => applySingleIdlePlaneGetBuffer(source.upstream[1].source));
  assert.throws(() => applySingleIdlePlaneGetBuffer(source.changedGet));
  assert.throws(() => applySingleIdlePlaneBuffer(source.changedBuffer));
  assert.throws(() => applySingleIdlePlaneBuffer(source.upstream[0].source + "\n"));
  assert.throws(() => reverseSingleIdlePlaneBuffer(source.changedBuffer + "\n"));
  assert.throws(() => reverseSingleIdlePlaneGetBuffer(source.changedGet + source.changedGet));
});
test("Executed source preflight retains exact pins/compact sources and cleaned scratch, without claiming compiled lifetime or browser fit", async () => {
  assert.equal(proof.failure, null); assert.equal(proof.runtimeRemoved, true);
  await assert.rejects(access(proof.ownedRuntime), { code: "ENOENT" });
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest);
  assert.equal(source.header, (await read("media/ffmpeg/mpeg2-encoder-plane-policy.h")).toString());
  assert.equal(source.smoke, (await read("media/ffmpeg/mpeg2-encoder-plane-smoke.c")).toString());
  for (const key of ["compiledLifecycleExecuted", "originalVideoRead", "publicAcceptance", "speedImprovementProven", "liveCapacityOrFragmentationProven"]) assert.equal(proof[key], false);
  assert.equal(proof.policy.fixed16MiBFitNotProven, true);
  assert.equal(proof.browserLaunches, 0); assert.equal(proof.conversions, 0);
});
test("Private encoder-only recipe parses without building; identical flags/wrapper/old accessory tests with new compiled lifecycle before linking", async () => {
  const base = (await read("media/ffmpeg/build-mpeg2-split-encoder.sh")).toString();
  const { generated, edits } = makeSingleIdleEncoderPlaneRecipe(base);
  let restored = generated; for (const [before, after] of edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, base); assert.throws(() => makeSingleIdleEncoderPlaneRecipe(base + "\n"));
  assert.ok(generated.indexOf("patch-mpeg2-encoder-planes.mjs") < generated.indexOf("emconfigure ./configure"));
  assert.ok(generated.indexOf("encoder-plane-smoke.js") < generated.indexOf('emcc "${SCRIPT_DIR}/mpeg2-split-encoder.c"'));
  assert.equal((generated.match(/-sINITIAL_MEMORY=16777216/g) ?? []).length, 3);
  assert.equal((generated.match(/-sMAXIMUM_MEMORY=16777216/g) ?? []).length, 3);
  assert.ok(generated.includes('node "${PROJECT_ROOT}/scripts/verify-mpeg2-split-encoder-native.mjs"'));
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  // Feed syntax only, not an executable build file; no generated source on disk.
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(bash, ["--noprofile", "--norc", "-n"], { cwd: root, input: generated,
    windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 16384 });
  assert.equal(result.status, 0, result.stderr);
});
test("Builder refuses this Windows host before compile/source mutation; real Wasm32 lifecycle remains pending", async () => {
  const builder = (await read("media/ffmpeg/build-mpeg2-encoder-planes.mjs")).toString();
  assert.match(builder, /windowsHide: true/);
  assert.match(builder, /imported: true, initialPages: 256, maximumPages: 256, shared: true/);
  assert.match(builder, /reverseSingleIdlePlaneBuffer\(patchedBuffer\)/);
  assert.match(builder, /browserAcceptance: false/);
  if (process.platform === "win32") await assert.rejects(execute(process.execPath,
    ["media/ffmpeg/build-mpeg2-encoder-planes.mjs"], { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 16384 }),
  error => error.code === 1 && /isolated no-Docker hosted builder/.test(error.stderr));
});
test("Registered workflow derivative changes only encoder command, preserves default/SDK/retention/always-cleanup and refuses changed input", async () => {
  const original = (await read(".github/workflows/reproduce-ffmpeg-nondocker.yml")).toString();
  const changed = makeEncoderPlaneBuildWorkflow(original);
  assert.equal(changed.replace("node media/ffmpeg/build-mpeg2-encoder-planes.mjs", "bash media/ffmpeg/build-mpeg2-split-encoder.sh"), original);
  assert.throws(() => makeEncoderPlaneBuildWorkflow(original + "\n"));
  assert.match(changed, /path: work\/mpeg2-split-encoder-output\//);
  assert.match(changed, /retention-days: 1/); assert.match(changed, /if: always\(\)/);
  const helper = (await read("scripts/prepare-encoder-plane-build-branch.mjs")).toString();
  assert.match(helper, /GIT_INDEX_FILE/); assert.match(helper, /windowsHide: true/);
  assert.match(helper, /Never overwrite a branch/); assert.match(helper, /refs\/heads\/main/);
});
