// Pinned source-only reversal check, not conversion or memory acceptance.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { instrumentFrameAllocation, reverseFrameAllocationDiagnostic, FRAME_ALLOCATION_SOURCE_SHA256 }
  from "../media/ffmpeg/mpeg2-frame-allocation-diagnostic.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const sha = (source) => createHash("sha256").update(source).digest("hex");
const runtime = await createOwnedRuntimeScratch("mpeg2-plane-source-check-");
try {
  const response = await fetch("https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/get_buffer.c",
    { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok); assert.ok(Number(response.headers.get("content-length") ?? 0) <= 32768);
  const data = new Uint8Array(await response.arrayBuffer()); assert.ok(data.length <= 32768);
  assert.equal(sha(data), "38efe5e7fc627437306290919c8de3e2de5817d611b29d1f98e7ee6c12a8fb19");
  await mkdir(path.join(runtime.directory, "libavcodec"));
  const target = path.join(runtime.directory, "libavcodec/get_buffer.c");
  await writeFile(target, data, { flag: "wx" });
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  for (const name of ["mpeg2-encoder-uncached-frame-buffers", "hevc-decoder-uncached-frame-buffers"]) {
    await exec(bash, ["--noprofile", "--norc", "-c", 'patch --fuzz=0 --strip=1 --input "$1"',
      "plane-source-check", path.join(root, `media/ffmpeg/patches/${name}.patch`).replaceAll("\\", "/")],
    { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 30000 });
  }
  const before = await readFile(target, "utf8"); assert.equal(sha(before), FRAME_ALLOCATION_SOURCE_SHA256);
  const after = instrumentFrameAllocation(before);
  assert.equal(reverseFrameAllocationDiagnostic(after), before);
  assert.throws(() => instrumentFrameAllocation(after));
  assert.throws(() => instrumentFrameAllocation(before.replace("av_buffer_allocz", "changed_alloc")));
  assert.throws(() => reverseFrameAllocationDiagnostic(after.replace("pool->linesize[i], 0", "pool->linesize[i], 2")));
  const sources = {};
  for (const file of ["media/ffmpeg/mpeg2-frame-allocation-diagnostic.mjs", "media/ffmpeg/mpeg2-frame-allocation-diagnostic.h",
    "scripts/verify-mpeg2-frame-allocation-diagnostic.mjs"])
    sources[file] = sha(await readFile(path.join(root, file)));
  process.stdout.write(`${JSON.stringify({ scope: "source-only-not-conversion-not-memory-acceptance", sources,
    originalSourceSha256: sha(data), beforeSourceSha256: sha(before), afterSourceSha256: sha(after),
    byteExactReversal: true, insertions: 3, allocationCodeChanged: false, eventCap: 192,
    duplicateInstrumentationRejected: true, changedAllocationRejected: true, changedInsertionRejected: true })}\n`);
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  process.stdout.write("Scalar plane source-check artifact and owned scratch removed.\n");
}
