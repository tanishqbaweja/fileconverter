// Native input inspection only: compare decoder arithmetic to retained hashes
// of genuine browser FLAC outputs. No browser output is generated natively.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { AUDIO_METADATA_FIDELITY_CASES, audioMetadataFixtureArguments } from "./lib/audio-metadata-fidelity-fixture.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), runtime = await createOwnedRuntimeScratch("audio-pcm-reference-");
const sha = b => createHash("sha256").update(b).digest("hex"), receiptPath = "evidence/2026-10-24T13-50-10.413Z-audio-metadata-fidelity-result.json";
const receiptBytes = await readFile(path.join(root, receiptPath)), receipt = JSON.parse(receiptBytes);
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), scope: "Native reference-decoder diagnostic; no new browser conversion or changed acceptance policy",
  receipt: receiptPath, receiptSha256: sha(receiptBytes), cases: [], fullMetadataAcceptance: false, browserFlagsChanged: false };
report.sourcePins = {};
for (const file of ["scripts/check-audio-pcm-reference.mjs", "scripts/lib/audio-metadata-fidelity-fixture.mjs", "scripts/lib/audio-metadata-artifact.mjs"])
  report.sourcePins[file] = sha(await readFile(path.join(root, file)));
const native = (args) => execute("ffmpeg", args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
try {
  report.nativeVersion = (await native(["-version"])).stdout.split(/\r?\n/)[0];
  const { auditAudioMetadataArtifact } = await import("./lib/audio-metadata-artifact.mjs"), artifact = await auditAudioMetadataArtifact("work/audio-metadata-39517752087");
  for (const source of [...new Set(AUDIO_METADATA_FIDELITY_CASES.filter(c => c.destination === "flac").map(c => c.source))]) {
    const file = path.join(runtime.directory, "source." + source); await native(audioMetadataFixtureArguments(source, file));
    assert.ok((await lstat(file)).size < 1048576); assert.equal(sha(await readFile(file)), artifact.fixtures[source].sha256);
    const retained = receipt.cases.find(c => c.name === source + "-to-flac").fidelity;
    const row = { source, sourceFixtureSha256: artifact.fixtures[source].sha256,
      retainedDefaultNativeSha256: retained.sourceSha256, retainedBrowserFlacPcmSha256: retained.outputSha256, variants: [] }; report.cases.push(row);
    for (const [name, before] of [["default", []], ["scalar", ["-cpuflags", "0"]], ["scalar-bitexact", ["-cpuflags", "0", "-flags:a", "+bitexact"]]]) {
      const { stdout } = await native(["-v", "error", "-xerror", "-nostdin", ...before, "-c:a", source === "ogg" ? "vorbis" : "opus", "-i", file,
        "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash", "-hash", "sha256", "pipe:1"]);
      const match = /^SHA256=([a-f0-9]{64})\s*$/.exec(stdout); assert.ok(match);
      if (name === "default") assert.equal(match[1], retained.sourceSha256);
      row.variants.push({ name, decoderFlagsBeforeInput: before, pcmSha256: match[1], matchesRetainedBrowserPcm: match[1] === retained.outputSha256 });
    }
  }
} finally { await runtime.close(); report.ownedFixtureScratchRemoved = true; }
report.finishedAt = new Date().toISOString();
for (const [file, expected] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), expected);
const file = path.join(root, "evidence", report.startedAt.replaceAll(":", "-") + "-audio-pcm-reference.json");
await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ report: file, cases: report.cases, cleanup: report.ownedFixtureScratchRemoved }));
