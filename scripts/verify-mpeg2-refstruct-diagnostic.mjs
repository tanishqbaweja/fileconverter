// Verify a read-only diagnostic source addition. Never a conversion path.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const runtime = await createOwnedRuntimeScratch("mpeg2-refstruct-source-check-");
try {
  const response = await fetch("https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavutil/refstruct.c",
    { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok);
  assert.ok(Number(response.headers.get("content-length") ?? 0) <= 32768);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length <= 32768);
  const digest = (data) => createHash("sha256").update(data).digest("hex");
  assert.equal(digest(bytes), "d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f");
  const before = new TextDecoder().decode(bytes);
  await mkdir(path.join(runtime.directory, "libavutil"));
  const target = path.join(runtime.directory, "libavutil/refstruct.c");
  await writeFile(target, bytes, { flag: "wx" });
  const relativePatch = "media/ffmpeg/patches/refstruct-readonly-pool-diagnostic.patch";
  const directory = path.relative(root, runtime.directory).replaceAll(path.sep, "/");
  await exec("git", ["apply", "--check", "--directory", directory, relativePatch],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000 });
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  const { stdout } = await exec(bash, ["--noprofile", "--norc", "-c",
    'patch --fuzz=0 --strip=1 --input "$1"', "patch-check", path.join(root, relativePatch).replaceAll("\\", "/")],
  { cwd: runtime.directory, env: runtime.env, windowsHide: true, timeout: 30000 });
  process.stdout.write(stdout);
  const after = await readFile(target, "utf8");
  const added = (await readFile(path.join(root, relativePatch), "utf8")).split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)).join("\n") + "\n";
  assert.equal(after.split(added).length, 2, "Exactly one diagnostic-only addition");
  assert.equal(after.replace(added, ""), before, "Remove only scalar getter; every upstream byte identical");
  assert.equal(digest(after), "715cba26d3c68d65db8edf584f2dc3daae555de92f1003b5cfe3f32d6ddbb0b2");
  assert.doesNotMatch(added, /pool->\w+\s*=(?!=)|av_malloc|av_free\(|atomic_(?:fetch|store)|memset\(/);
  process.stdout.write(`Read-only refstruct patched SHA256 ${digest(after)}; reversal byte-identical.\n`);
} finally {
  await runtime.close();
  await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  process.stdout.write("Diagnostic source artifact and owned scratch removed.\n");
}
