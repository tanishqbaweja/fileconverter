// Native fixture/validator controls ONLY, not a browser conversion or route gate.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { validateCopiedAudioFrames } from "./lib/streaming-copied-audio-validation.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const runtime = await createOwnedRuntimeScratch("audio-validator-controls-");
const executable = "C:/ffmpeg/bin/ffmpeg.exe", source = path.join(runtime.directory, "source.mka");
const shifted = path.join(runtime.directory, "shifted.mka"), changed = path.join(runtime.directory, "changed.mka");
const generate = args => execute(executable, ["-v", "error", "-y", ...args], { env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
let positive, negative, cleanupRemoved = false;
try {
  await generate(["-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=0.25", "-c:a", "aac", "-b:a", "96k", source]);
  await generate(["-itsoffset", "0.125", "-i", source, "-map", "0:a", "-c", "copy", shifted]);
  await generate(["-f", "lavfi", "-i", "sine=frequency=1499:sample_rate=48000:duration=0.25", "-c:a", "aac", "-b:a", "96k", changed]);
  for (const file of [source, shifted, changed]) assert.ok((await stat(file)).size < 65536);
  positive = await validateCopiedAudioFrames(source, source, { env: runtime.env, executable, maximumMs: 30000 });
  negative = [];
  for (const [kind, output, pattern] of [["shifted-clock", shifted, /Decoded audio (pts|dts) changed/], ["changed-content", changed, /Decoded audio (sha256|bytes|duration) changed/]]) {
    let rejection = null;
    try { await validateCopiedAudioFrames(source, output, { env: runtime.env, executable, maximumMs: 30000 }); }
    catch (error) { rejection = error.message; }
    assert.match(rejection ?? "", pattern, kind); negative.push({ kind, status: "rejected-as-required", error: rejection });
  }
  await assert.rejects(validateCopiedAudioFrames(source, source, { env: runtime.env, executable: path.join(runtime.directory, "absent-validator.exe"), maximumMs: 30000 }), /ENOENT/);
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanupRemoved = true;
}
const sourcePins = {};
for (const file of ["scripts/check-streaming-audio-validator.mjs", "scripts/lib/streaming-copied-audio-validation.mjs", "tests/streaming-copied-audio-validation.test.mjs"])
  sourcePins[file] = sha(await readFile(path.join(root, file)));
const proof = { recordedAt: new Date().toISOString(), scope: "Independent native validator controls with generated quarter-second AAC fixtures, NOT browser conversion or original-size fidelity acceptance",
  status: "passed-validator-controls", positive, negative, nativeSpawnFailureRejected: true, ownedScratchAndFixturesRemoved: cleanupRemoved,
  browserConversionsPerformed: 0, originalFullAudioValidation: false, completeChromiumMemoryAcceptance: false, sourcePins };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 8192);
const report = path.join(root, "evidence/streaming-audio-validator-controls-2026-10-07.json");
await writeFile(report, json, { flag: "wx" }); console.log(report);
