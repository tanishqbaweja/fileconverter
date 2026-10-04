// Diagnose a source-pinned build patch only; never a media conversion path.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const runtime = await createOwnedRuntimeScratch("mpeg2-mov-patch-check-");
try {
  const response = await fetch("https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavformat/movenc.c",
    { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok);
  assert.ok(Number(response.headers.get("content-length") ?? 0) <= 512 * 1024);
  const data = new Uint8Array(await response.arrayBuffer());
  assert.ok(data.length <= 512 * 1024, "Pinned build-source artifact size cap");
  assert.equal(createHash("sha256").update(data).digest("hex"),
    "d7aa80a99efecf757100dbd6d9d7adb84d263cbeed0603873206975405907068");
  await mkdir(path.join(runtime.directory, "libavformat"));
  await writeFile(path.join(runtime.directory, "libavformat/movenc.c"), data, { flag: "wx" });
  const directory = path.relative(root, runtime.directory).replaceAll(path.sep, "/");
  // Check/apply the exact sequence to this owned source artifact only, using
  // the same GNU implementation and zero-fuzz gate as the hosted build.
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  for (const name of ["mov-fragmented-cover-metadata-only.patch", "mov-bounded-custom-metadata.patch"]) {
    const relative = `media/ffmpeg/patches/${name}`;
    await exec("git", ["apply", "--check", "--directory", directory, relative],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000 });
    const patchPath = path.join(root, relative).replaceAll("\\", "/");
    const { stdout } = await exec(bash, ["--noprofile", "--norc", "-c",
      'patch --fuzz=0 --strip=1 --input "$1"', "patch-check", patchPath],
    { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 30000 });
    process.stdout.write(stdout);
  }
  process.stdout.write("Pinned mov patch sequence passes git checks and GNU zero-fuzz application.\n");
} finally {
  await runtime.close();
  await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  process.stdout.write("Patch-check source artifact and owned scratch removed.\n");
}
