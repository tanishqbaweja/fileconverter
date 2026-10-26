import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { requiresPersistentVorbisInput, VORBIS_SYNCHRONOUS_INPUT_CEILING_BYTES } from "../lib/audio-input-policy.ts";
test("only the exact large Opus-to-Vorbis native33 route changes to existing persistent BYOB; small and other paths stay unchanged", () => {
  assert.equal(VORBIS_SYNCHRONOUS_INPUT_CEILING_BYTES, 8388608);
  for (const bytes of [0, 1, 2097152, 8388608]) assert.equal(requiresPersistentVorbisInput("opus-to-ogg", 33, bytes), false);
  for (const bytes of [8388609, 147964541, 2958573265, 10737418240]) assert.equal(requiresPersistentVorbisInput("opus-to-ogg", 33, bytes), true);
  for (const profile of ["flac-to-ogg", "wav-to-ogg", "ogg-to-opus", "mkv-to-mp4", "opus-to-ogg"]) {
    for (let native = 1; native <= 40; native++) if (profile !== "opus-to-ogg" || native !== 33)
      assert.equal(requiresPersistentVorbisInput(profile, native, 147964541), false);
  }
  for (const invalid of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => requiresPersistentVorbisInput("opus-to-ogg", 33, invalid));
});
test("worker disables slice allocation for targeted input and retains the actual bounded seekable reader, native settings and strict backpressure", async () => {
  const worker = await readFile("workers/media-remux.ts", "utf8");
  assert.match(worker, /requiresPersistentVorbisInput\(profileId, remuxProfile, file.size\)/);
  assert.match(worker, /forceAsynchronousInput \|\| persistentAudioInput \|\|/);
  assert.match(worker, /readSync: synchronousInputReader\s*\?/);
  assert.match(worker, /inputReader = file\s*\.slice\(offset\)\s*\.stream\(\)\s*\.getReader\(\{ mode: "byob" \}\)/);
  assert.match(worker, /await inputReader\?\.cancel\("FFmpeg input seek"\)/);
  assert.match(worker, /value.buffer.byteLength >= MAX_AVIO_CHUNK\s*\? new Uint8Array\(value.buffer\)\s*: allocateInputBuffer\(\)/);
  assert.match(worker, /audioInputTransport.inFlight !== 0/); assert.match(worker, /finally \{ if \(audioInputTransport\) audioInputTransport.inFlight = 0/);
  assert.match(worker, /metrics.audioInputTransport = audioInputTransport/);
  assert.match(worker, /resolveAudioQualityArgument\(profileId, remuxProfile/);
  const policy = await readFile("lib/audio-input-policy.ts", "utf8");
  assert.doesNotMatch(policy, /readAsArrayBuffer|fetch\(|write|codecCode|qualityCode|wasmMemory/);
});
