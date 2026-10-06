// Preserve the executed validator/control evidence byte-for-byte. This derived
// native-only validator adds external cancellation, never different fidelity.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export function makeAbortableAudioValidator(source, expectedSha256) {
  assert.match(expectedSha256, /^[a-f0-9]{64}$/);
  assert.equal(createHash("sha256").update(source).digest("hex"), expectedSha256,
    "Cancellation derivative must use the actually tested validator bytes");
  const replacements = [
    ['async function* nativeLines(executable, args, env, signal, maximumMs) {',
      'async function* nativeLines(executable, args, env, signal, maximumMs) {\n  signal.throwIfAborted();'],
    ['audioOrdinal = 0, maximumMs = 30 * 60 * 1000 } = {}) {',
      'audioOrdinal = 0, maximumMs = 30 * 60 * 1000, signal = null } = {}) {\n  assert.ok(signal === null || signal instanceof AbortSignal);\n  signal?.throwIfAborted();'],
    ['const controller = new AbortController(), states = [createAudioFrameState(), createAudioFrameState()];',
      'const controller = new AbortController(), states = [createAudioFrameState(), createAudioFrameState()];\n  const externalAbort = () => controller.abort();\n  signal?.addEventListener("abort", externalAbort, { once: true });'],
    ['} finally { controller.abort(); await Promise.allSettled(readers.map(reader => reader.return())); }',
      '} finally { signal?.removeEventListener("abort", externalAbort); controller.abort(); await Promise.allSettled(readers.map(reader => reader.return())); }'],
  ];
  let generated = source;
  for (const [before, after] of replacements) {
    assert.equal(generated.split(before).length, 2, "Unique cancellation anchor required");
    generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of replacements.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only external cancellation may change");
  return generated;
}
