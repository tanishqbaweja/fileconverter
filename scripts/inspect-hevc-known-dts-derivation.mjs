// Authenticate the existing native preimage, derive sources only, and discard
// downloaded tools in finally. Never execute native or browser media conversion.
import assert from "node:assert/strict";
import { loadMkvEditListBuildArtifact } from "./lib/mkv-edit-list-build-artifact.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeHevcKnownDtsCandidate, makeHevcKnownDtsParser, hevcParserParentSha256, makeHevcKnownDtsPrefix } from "../media/ffmpeg/mkv-hevc-known-dts-candidate.mjs";
import { readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const runtime = await createOwnedRuntimeScratch("hevc-clock-source-inspection-");
let report;
try {
  const tools = await loadMkvEditListBuildArtifact("43653656481", "147b05167d5d5729a8aa186c2c073c833816aa3c", runtime, true, true, true, true);
  assert.equal(tools.proof.build.artifacts["within_remux.c"].sha256, "1c6b184978eecb8ce966a6db55cc3b8f3aa2d216e102a81e11aa9cc80d83db1f");
  const tar = path.join(process.env.SystemRoot ?? "C:/Windows", "System32/tar.exe");
  const { stdout } = await promisify(execFile)(tar, ["-xOf", path.join(runtime.directory, "mkv-edit-list-tools.zip"), "within_remux.c"],
    { env: runtime.env, windowsHide: true, encoding: "buffer", timeout: 15000, maxBuffer: 524288 });
  assert.equal(createHash("sha256").update(stdout).digest("hex"), tools.proof.build.artifacts["within_remux.c"].sha256);
  const response = await fetch("https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/hevc/parser.c");
  assert.equal(response.status, 200); const parser = Buffer.from(await response.arrayBuffer()); assert.ok(parser.length <= 32768);
  assert.equal(createHash("sha256").update(parser).digest("hex"), hevcParserParentSha256);
  report = { status: "passed-authenticated-source-derivation-only-not-build-or-browser-acceptance", mediaInputs: 0, nativeConversionUsed: false,
    parent: { head: tools.proof.head, runId: tools.proof.runId, artifact: tools.proof.artifact },
    wrapper: makeHevcKnownDtsCandidate(stdout).proof, parser: makeHevcKnownDtsParser(parser).proof,
    prefixSha256: makeHevcKnownDtsPrefix(await readFile("media/ffmpeg/h264-startup-prefix.inc")).sha256 };
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" }); report.downloadedToolsRemoved = true;
const file = `evidence/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-hevc-known-dts-source-derivation.json`;
await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ file, ...report }));
