// Independent native validator only. Never used as the browser converter.
// Compare copied audio's fully decoded PCM, trim, every frame clock and endpoints
// without retaining PCM or an audio-frame history. One source/output pair active.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

export const AUDIO_VALIDATOR_LIMITS = Object.freeze({ streams: 16, chunkBytes: 65536, lineBytes: 4096,
  stderrBytes: 4096, headerLines: 128, clockSeconds: 0.001 });
const safe = (value, label) => { assert.ok(Number.isSafeInteger(value), `${label} unavailable/unsafe`); return value; };
export function createAudioFrameState() {
  return { headers: new Map(), headerLines: 0, frames: 0, bytes: 0, samples: 0,
    start: null, end: null, lastPts: null, digest: createHash("sha256"), maximumClockErrorSeconds: 0 };
}
export function parseAudioFrameHashLine(line, state) {
  assert.ok(Buffer.byteLength(line) <= AUDIO_VALIDATOR_LIMITS.lineBytes, "Audio metadata line cap");
  if (!line.trim()) return null;
  if (line.startsWith("#")) {
    assert.equal(state.frames, 0, "Unexpected metadata after audio payload");
    assert.ok(++state.headerLines <= AUDIO_VALIDATOR_LIMITS.headerLines, "Audio header cap");
    const match = /^#(format|version|hash|tb|media_type|codec_id|sample_rate|channel_layout_name)(?: (\d+))?: (.+)$/.exec(line);
    if (match) {
      if (match[2] !== undefined) assert.equal(match[2], "0", "Only requested audio ordinal may be decoded");
      assert.ok(!state.headers.has(match[1]), "Duplicate audio metadata"); state.headers.set(match[1], match[3]);
    }
    return null;
  }
  assert.equal(state.headers.get("format"), "frame checksums"); assert.equal(state.headers.get("version"), "2");
  assert.equal(state.headers.get("hash"), "SHA256"); assert.equal(state.headers.get("media_type"), "audio");
  assert.equal(state.headers.get("codec_id"), "pcm_s32le");
  const rateText = state.headers.get("sample_rate"), clock = state.headers.get("tb");
  assert.match(rateText ?? "", /^[1-9][0-9]*$/); const rate = safe(Number(rateText), "Audio sample rate");
  assert.ok(rate >= 8000 && rate <= 384000); assert.equal(clock, `1/${rate}`, "Canonical sample clock required");
  assert.ok((state.headers.get("channel_layout_name")?.length ?? 0) > 0, "Channel layout unavailable");
  const fields = line.split(",").map(field => field.trim()); assert.equal(fields.length, 6, "Unsupported audio frame record");
  assert.equal(fields[0], "0");
  for (const value of fields.slice(1, 5)) assert.match(value, /^-?[0-9]+$/, "Audio clock/count unavailable");
  assert.match(fields[5], /^[a-f0-9]{64}$/);
  const [dts, pts, duration, bytes] = fields.slice(1, 5).map((value, i) => safe(Number(value), `Audio frame field${i}`));
  assert.ok(duration > 0 && duration <= 65536 && bytes > 0 && bytes <= 8 * 1024 ** 2);
  assert.ok(state.lastPts === null || pts >= state.lastPts, "Audio frame PTS order changed");
  state.frames = safe(state.frames + 1, "Audio frame count"); state.bytes = safe(state.bytes + bytes, "Decoded byte count");
  state.samples = safe(state.samples + duration, "Decoded sample count"); state.lastPts = pts;
  state.start = state.start === null ? pts / rate : Math.min(state.start, pts / rate);
  state.end = state.end === null ? (pts + duration) / rate : Math.max(state.end, (pts + duration) / rate);
  state.digest.update(fields[5]);
  return { dts, pts, duration, bytes, sha256: fields[5], rate };
}
export function compareCopiedAudioFrames(source, output, sourceState, outputState) {
  assert.deepEqual([...outputState.headers], [...sourceState.headers], "Canonical audio metadata changed");
  for (const name of ["duration", "bytes", "sha256", "rate"]) assert.equal(output[name], source[name], `Decoded audio ${name} changed`);
  for (const name of ["pts", "dts"]) {
    const error = Math.abs(source[name] / source.rate - output[name] / output.rate);
    assert.ok(error <= AUDIO_VALIDATOR_LIMITS.clockSeconds + 1e-12, `Decoded audio ${name} changed`);
    outputState.maximumClockErrorSeconds = Math.max(outputState.maximumClockErrorSeconds, error);
  }
}
async function* nativeLines(executable, args, env, signal, maximumMs) {
  const child = spawn(executable, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = Buffer.alloc(0), stderrOversize = false, timedOut = false, complete = false;
  child.stderr.on("data", chunk => {
    if (chunk.length > AUDIO_VALIDATOR_LIMITS.chunkBytes) { stderrOversize = true; child.kill(); return; }
    const combined = Buffer.concat([stderr, chunk]);
    stderr = Buffer.from(combined.subarray(Math.max(0, combined.length - AUDIO_VALIDATOR_LIMITS.stderrBytes)));
  });
  const done = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, childSignal) => resolve({ code, signal: childSignal })); });
  void done.catch(() => {}); // An early spawn failure must not become an unhandled rejection.
  const stop = () => { if (child.exitCode === null && child.signalCode === null) child.kill(); };
  signal.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(() => { timedOut = true; stop(); }, maximumMs);
  try {
    let pending = "";
    for await (const chunk of child.stdout) {
      assert.ok(chunk.length <= AUDIO_VALIDATOR_LIMITS.chunkBytes, "Native audio stdout chunk cap");
      pending += chunk.toString("utf8");
      let index;
      while ((index = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, index).replace(/\r$/, ""); pending = pending.slice(index + 1);
        assert.ok(Buffer.byteLength(line) <= AUDIO_VALIDATOR_LIMITS.lineBytes, "Native audio line cap"); yield line;
      }
      assert.ok(Buffer.byteLength(pending) <= AUDIO_VALIDATOR_LIMITS.lineBytes, "Incomplete audio line cap");
    }
    if (pending) { assert.ok(Buffer.byteLength(pending) <= AUDIO_VALIDATOR_LIMITS.lineBytes); yield pending; }
    const result = await done;
    assert.ok(!timedOut && !signal.aborted, "Native audio validation cancelled/deadline");
    assert.equal(stderrOversize, false, "Native audio stderr chunk cap");
    assert.equal(result.code, 0, `Native audio validator failed: ${stderr}`); complete = true;
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", stop);
    if (!complete) stop(); await done.catch(() => {});
  }
}
async function nextFrame(iterator, state) {
  for (;;) { const next = await iterator.next(); if (next.done) return null;
    const frame = parseAudioFrameHashLine(next.value, state); if (frame) return frame; }
}
export async function validateCopiedAudioFrames(source, output, { env, executable = "C:/ffmpeg/bin/ffmpeg.exe", audioOrdinal = 0, maximumMs = 30 * 60 * 1000 } = {}) {
  assert.ok(env && typeof env === "object", "Explicit native runtime environment required; caller owns scratch");
  assert.ok(Number.isInteger(audioOrdinal) && audioOrdinal >= 0 && audioOrdinal < AUDIO_VALIDATOR_LIMITS.streams);
  assert.ok(Number.isInteger(maximumMs) && maximumMs > 0 && maximumMs <= 30 * 60 * 1000);
  const args = file => ["-v", "error", "-xerror", "-copyts", "-threads", "1", "-i", file, "-map", `0:a:${audioOrdinal}`,
    "-c:a", "pcm_s32le", "-f", "framehash", "-hash", "sha256", "pipe:1"];
  const controller = new AbortController(), states = [createAudioFrameState(), createAudioFrameState()];
  const readers = [source, output].map(file => nativeLines(executable, args(file), env, controller.signal, maximumMs)[Symbol.asyncIterator]());
  try {
    for (;;) {
      const pair = await Promise.all(readers.map((reader, i) => nextFrame(reader, states[i])));
      if (!pair[0] || !pair[1]) { assert.equal(Boolean(pair[0]), Boolean(pair[1]), "Decoded audio trim/frame count changed"); break; }
      compareCopiedAudioFrames(pair[0], pair[1], states[0], states[1]);
    }
    assert.ok(states[0].frames > 0, "No decoded audio evidence");
    const summarize = state => ({ frames: state.frames, decodedBytes: state.bytes, samples: state.samples,
      startSeconds: state.start, endSeconds: state.end, orderedFramePayloadHashesSha256: state.digest.digest("hex") });
    const baseline = summarize(states[0]), candidate = summarize(states[1]);
    for (const key of ["frames", "decodedBytes", "samples", "orderedFramePayloadHashesSha256"]) assert.equal(candidate[key], baseline[key]);
    for (const key of ["startSeconds", "endSeconds"]) assert.ok(Math.abs(candidate[key] - baseline[key]) <= AUDIO_VALIDATOR_LIMITS.clockSeconds + 1e-12, `Decoded presentation ${key} changed`);
    return { status: "passed-copied-audio-ordinal-only", audioOrdinal, canonicalCodec: "pcm_s32le", clockToleranceSeconds: AUDIO_VALIDATOR_LIMITS.clockSeconds,
      maximumClockErrorSeconds: states[1].maximumClockErrorSeconds, source: baseline, output: candidate,
      limits: AUDIO_VALIDATOR_LIMITS, retainedFrameRows: 0, productConversionPerformed: false,
      caveat: "Independent copied-audio validator requiring matching decoder frame segmentation. Other ordinals, video, process-tree memory and browser conversion are not certified by this result." };
  } finally { controller.abort(); await Promise.allSettled(readers.map(reader => reader.return())); }
}
