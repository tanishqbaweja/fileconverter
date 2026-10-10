// Source-only preflight: no browser, codec execution, compiler or original read.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { applySingleIdlePlaneBuffer, applySingleIdlePlaneGetBuffer, reverseSingleIdlePlaneBuffer,
  reverseSingleIdlePlaneGetBuffer, UPSTREAM_BUFFER_SHA256, EXECUTED_ENCODER_GET_BUFFER_SHA256 } from "../media/ffmpeg/mpeg2-encoder-plane-source.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function fetchSource(file, expected) {
  const url = `https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/${file}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) }); assert.ok(response.ok);
  assert.ok(Number(response.headers.get("content-length") ?? 0) <= 32768);
  const reader = response.body.getReader(), chunks = []; let total = 0;
  try { for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength; assert.ok(total <= 32768); chunks.push(value);
  } } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = Buffer.concat(chunks); assert.equal(sha(bytes), expected);
  return { url, bytes: bytes.length, sha256: sha(bytes), source: bytes.toString("utf8") };
}
const proofPath = "evidence/mpeg2-encoder-plane-source-preflight-2026-10-10.json";
await assert.rejects(access(path.join(root, proofPath)), { code: "ENOENT" });
const runtime = await createOwnedRuntimeScratch("encoder-plane-source-");
const proof = { recordedAt: new Date().toISOString(), scope: "private-source-policy-not-compiled-lifecycle-or-browser-acceptance",
  ownedRuntime: runtime.directory, upstream: null, archive: null, failure: null, runtimeRemoved: false,
  compiledLifecycleExecuted: false, browserLaunches: 0, conversions: 0, originalVideoRead: false,
  heapLimitsRaised: false, pixelsOrCodecOptionsChanged: false, publicAcceptance: false, speedImprovementProven: false,
  liveCapacityOrFragmentationProven: false, sourcePins: {} };
try {
  // Read engineering dependencies only, all bounded and hash-pinned before use.
  const sources = await Promise.all([
    fetchSource("libavutil/buffer.c", UPSTREAM_BUFFER_SHA256),
    fetchSource("libavcodec/get_buffer.c", "38efe5e7fc627437306290919c8de3e2de5817d611b29d1f98e7ee6c12a8fb19"),
    fetchSource("libavutil/buffer_internal.h", "0cd37612f88b1889d23234a5739eda0cf4dcb22c23c82bc4bb023696fcf1b4ad"),
  ]);
  await mkdir(path.join(runtime.directory, "libavcodec"));
  const getFile = path.join(runtime.directory, "libavcodec/get_buffer.c");
  await writeFile(getFile, sources[1].source, { flag: "wx" });
  const oldPatch = "media/ffmpeg/patches/mpeg2-encoder-uncached-frame-buffers.patch";
  const relative = path.relative(root, runtime.directory).replaceAll(path.sep, "/");
  await exec("git", ["apply", "--check", "--directory", relative, oldPatch],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 16384 });
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  await exec(bash, ["--noprofile", "--norc", "-c", 'patch --fuzz=0 --strip=1 --input "$1"',
    "encoder-plane-preflight", path.join(root, oldPatch).replaceAll("\\", "/")],
  { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 16384 });
  const actualOldGet = await readFile(getFile, "utf8"); assert.equal(sha(actualOldGet), EXECUTED_ENCODER_GET_BUFFER_SHA256);
  const changedBuffer = applySingleIdlePlaneBuffer(sources[0].source), changedGet = applySingleIdlePlaneGetBuffer(actualOldGet);
  assert.equal(reverseSingleIdlePlaneBuffer(changedBuffer), sources[0].source);
  assert.equal(reverseSingleIdlePlaneGetBuffer(changedGet), actualOldGet);
  assert.ok(changedGet.includes("pool->buffer_size[i] = size[i] + 16 + STRIDE_ALIGN - 1;"));
  const header = await readFile(path.join(root, "media/ffmpeg/mpeg2-encoder-plane-policy.h"), "utf8");
  const smoke = await readFile(path.join(root, "media/ffmpeg/mpeg2-encoder-plane-smoke.c"), "utf8");
  const data = Buffer.from(JSON.stringify({ upstream: sources, actualOldGet, changedBuffer, changedGet, header, smoke }));
  assert.ok(data.length <= 262144);
  const compressed = gzipSync(data, { level: 9 }), archivePath = "outputs/reports/mpeg2-encoder-plane-source-preflight-2026-10-10.json.gz";
  await writeFile(path.join(root, archivePath), compressed, { flag: "wx" });
  proof.upstream = sources.map(({ source: _source, ...row }) => { void _source; return row; });
  proof.oldEncoderGetSha256 = sha(actualOldGet);
  proof.changedBufferSha256 = sha(changedBuffer); proof.changedGetSha256 = sha(changedGet);
  proof.exactSourceReversals = true; proof.publicStructAbiChanged = false;
  proof.policy = { scope: "single-thread MPEG2 encoder only, memory-poisoning disabled",
    maximumIdleEntriesPerSelectedPool: 1, otherPoolsUnchanged: true, zeroEveryAcquisitionIncludingPadding: true,
    discardOnlyInFinalUnrefCallback: true, capDecisionUnderExistingMutex: true, originalPoolRefcountsUnchanged: true,
    idlePlaneMayIncreaseResidentHeap: true, fixed16MiBFitNotProven: true };
  proof.archive = { path: archivePath, bytes: compressed.length, sha256: sha(compressed), restoredBytes: data.length, restoredSha256: sha(data) };
  const pins = ["media/ffmpeg/mpeg2-encoder-plane-source.mjs", "media/ffmpeg/mpeg2-encoder-plane-policy.h",
    "media/ffmpeg/mpeg2-encoder-plane-smoke.c", "media/ffmpeg/patch-mpeg2-encoder-planes.mjs",
    "scripts/verify-mpeg2-encoder-plane-source.mjs", oldPatch];
  for (const file of pins) proof.sourcePins[file] = sha(await readFile(path.join(root, file)));
} catch (error) { proof.failure = error.stack; process.exitCode = 1; }
finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); proof.runtimeRemoved = true;
  await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ proofPath, failure: proof.failure, runtimeRemoved: proof.runtimeRemoved,
    compiledLifecycleExecuted: false, conversions: 0 }));
}
