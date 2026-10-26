// Read-only source diagnosis. Never encodes media or changes published/private engines.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const version = "4.0", expectedSha256 = "3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb";
const sourceFiles = ["libmp3lame/presets.c", "libmp3lame/lame.c", "libmp3lame/set_get.c"];
const runtime = await createOwnedRuntimeScratch("source-lame-audit-");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "failed-or-incomplete",
  scope: "read-only exact-checksum-pinned LAME source gain/default inspection; not browser gain measurement or conversion acceptance",
  version, expectedSha256, files: [], nativeConversionUsed: false, engineChanged: false, publicAcceptance: false, failures: [] };
try {
  const recipe = await readFile(path.join(root, "media/ffmpeg/reproduce-nondocker.sh"), "utf8");
  assert.ok(recipe.includes("LAME_VERSION=" + version) && recipe.includes("LAME_SHA256=" + expectedSha256));
  report.recipeSha256 = createHash("sha256").update(recipe).digest("hex");
  report.scriptSha256 = createHash("sha256").update(await readFile(import.meta.filename)).digest("hex");
  const url = `https://downloads.sourceforge.net/project/lame/lame/${version}/lame-${version}.tar.gz`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) }); assert.ok(response.ok, "Pinned archive download HTTP" + response.status);
  report.url = url; report.finalUrl = response.url;
  const archive = path.join(runtime.directory, "lame-pinned.tar.gz"), writer = await open(archive, "wx");
  let bytes = 0;
  try { for await (const chunk of response.body) {
    bytes += chunk.length; assert.ok(bytes <= 8 * 1048576, "Source-only archive exceeds finite8MiB bound");
    for (let offset = 0; offset < chunk.length;) { const count = Math.min(65536, chunk.length - offset);
      const written = await writer.write(chunk, offset, count); assert.ok(written.bytesWritten > 0); offset += written.bytesWritten; }
  } } finally { await writer.close(); }
  const hash = createHash("sha256"); for await (const chunk of createReadStream(archive, { highWaterMark: 65536 })) hash.update(chunk);
  report.archive = { bytes: (await lstat(archive)).size, sha256: hash.digest("hex") };
  assert.equal(report.archive.sha256, expectedSha256, "Never diagnose a different LAME release as the actual pinned encoder");
  for (const file of sourceFiles) {
    // Named member -> stdout, no extraction tree or files outside owned scratch.
    const { stdout } = await execute("tar", ["-xOf", archive, "lame-" + version + "/" + file],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 20000, maxBuffer: 1048576 });
    const lines = stdout.split(/\r?\n/), selected = new Set();
    for (const [index, line] of lines.entries()) if (/\bscale\b|apply_abr_preset|apply_preset|lame_set_scale|lame_set_preset/.test(line))
      for (let at = Math.max(0, index - 2); at <= Math.min(lines.length - 1, index + 2); at++) selected.add(at);
    assert.ok(selected.size <= 256, "Source excerpts must remain finite");
    report.files.push({ file, bytes: Buffer.byteLength(stdout), sha256: createHash("sha256").update(stdout).digest("hex"),
      excerpts: [...selected].sort((a, b) => a - b).map(index => ({ line: index + 1, text: lines[index] })) });
  }
  report.status = "exact-pinned-source-inspected-not-browser-cause-proof";
} catch (error) { report.status = "failed"; report.failures.push(String(error.stack ?? error).slice(0, 4096)); process.exitCode = 1; }
finally {
  await runtime.close(); report.disposableOwnedSourceArchiveRemoved = true;
  const output = path.join(root, "evidence", report.startedAt.replaceAll(":", "-") + "-lame-scale-source-audit.json");
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ receipt: output, status: report.status, archive: report.archive,
    excerpts: report.files.map(file => ({ file: file.file, lines: file.excerpts.length })), failures: report.failures,
    cleanup: report.disposableOwnedSourceArchiveRemoved }));
}
