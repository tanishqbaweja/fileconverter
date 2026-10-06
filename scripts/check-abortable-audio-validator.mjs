// Real native fixture/validator/cancellation controls. No browser conversion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAbortableAudioValidator } from "./lib/abortable-audio-validator-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const historical = JSON.parse(await readFile(path.join(root, "evidence/streaming-audio-validator-controls-2026-10-07.json")));
const source = await readFile(path.join(root, "scripts/lib/streaming-copied-audio-validation.mjs"), "utf8");
const generated = makeAbortableAudioValidator(source, historical.sourcePins["scripts/lib/streaming-copied-audio-validation.mjs"]);
const runtime = await createOwnedRuntimeScratch("audio-cancellation-controls-");
let positive, negative, cancelled, alreadyAborted, childrenAbsent = false;
try {
  const validatorModulePath = path.join(runtime.directory, "validator.mjs"); await writeFile(validatorModulePath, generated, { flag: "wx" });
  const { validateCopiedAudioFrames } = await import(pathToFileURL(validatorModulePath).href);
  const fixture = path.join(runtime.directory, "source.mka"), shifted = path.join(runtime.directory, "shifted.mka");
  const executable = "C:/ffmpeg/bin/ffmpeg.exe";
  const native = args => execute(executable, ["-v", "error", "-y", ...args], {
    env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  await native(["-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=0.25", "-c:a", "aac", "-b:a", "96k", fixture]);
  await native(["-itsoffset", "0.125", "-i", fixture, "-map", "0:a", "-c", "copy", shifted]);
  positive = await validateCopiedAudioFrames(fixture, fixture, { env: runtime.env, executable, maximumMs: 30000 });
  try { await validateCopiedAudioFrames(fixture, shifted, { env: runtime.env, executable, maximumMs: 30000 }); }
  catch (error) { negative = error.message; }
  assert.match(negative ?? "", /Decoded audio (pts|dts) changed/);
  const controller = new AbortController();
  const pending = validateCopiedAudioFrames(fixture, fixture, { env: runtime.env, executable, maximumMs: 30000, signal: controller.signal });
  // Both generators start native readers synchronously before their first await.
  // Abort the real active readers before trusting/reading their first record.
  queueMicrotask(() => controller.abort());
  try { await pending; } catch (error) { cancelled = error.message; }
  assert.match(cancelled ?? "", /cancelled\/deadline|abort/i);
  const stopped = new AbortController(); stopped.abort();
  try { await validateCopiedAudioFrames(fixture, fixture, { env: runtime.env, executable, signal: stopped.signal }); }
  catch (error) { alreadyAborted = error.message; }
  assert.match(alreadyAborted ?? "", /abort/i);
  const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `@(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${process.pid} AND Name = 'ffmpeg.exe'").Count`], {
    env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 4096 });
  assert.equal(Number(stdout.trim()), 0); childrenAbsent = true;
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
}
const sourcePins = {};
for (const file of ["scripts/lib/streaming-copied-audio-validation.mjs", "scripts/lib/abortable-audio-validator-recipe.mjs",
  "scripts/check-abortable-audio-validator.mjs", "tests/abortable-audio-validator-recipe.test.mjs"])
  sourcePins[file] = sha(await readFile(path.join(root, file)));
const proof = { recordedAt: new Date().toISOString(), status: "passed-native-cancellation-controls-only",
  scope: "Quarter-second native AAC fixture controls; not a browser conversion or full-original fidelity proof",
  generatedValidatorSha256: sha(generated), sourcePins, positive, shiftedClockRejected: negative,
  activeReadersCancelled: cancelled, preAbortedSignalRejected: alreadyAborted,
  ownedNativeChildrenAbsent: childrenAbsent, ownedScratchAndFixturesRemoved: true,
  browserConversionsPerformed: 0, originalFullAudioValidation: false, completeChromiumMemoryAcceptance: false };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 8192);
const report = path.join(root, "evidence/abortable-audio-validator-controls-2026-10-07.json");
await writeFile(report, json, { flag: "wx" }); console.log(report);
