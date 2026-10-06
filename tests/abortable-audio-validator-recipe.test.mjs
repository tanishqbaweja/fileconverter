import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeAbortableAudioValidator } from "../scripts/lib/abortable-audio-validator-recipe.mjs";
const source = await readFile(new URL("../scripts/lib/streaming-copied-audio-validation.mjs", import.meta.url), "utf8");
const proof = JSON.parse(await readFile(new URL("../evidence/streaming-audio-validator-controls-2026-10-07.json", import.meta.url)));
const digest = proof.sourcePins["scripts/lib/streaming-copied-audio-validation.mjs"];
test("External cancellation derivative retains the actual executed audio validator and every fidelity bound", () => {
  const generated = makeAbortableAudioValidator(source, digest);
  for (const line of source.split("\n")) {
    if (line.includes('maximumMs = 30 * 60 * 1000 }') || line.includes('finally { controller.abort();')) continue;
    assert.ok(generated.includes(line));
  }
  assert.equal(generated.split("signal.throwIfAborted()").length - 1, 1);
  assert.ok(generated.includes('signal?.removeEventListener("abort", externalAbort)'));
  assert.ok(generated.includes('signal?.addEventListener("abort", externalAbort, { once: true })'));
  assert.equal(createHash("sha256").update(source).digest("hex"), digest);
});
test("Cancellation recipe refuses changed or ambiguous historical validator bytes", () => {
  assert.throws(() => makeAbortableAudioValidator(source + "\n", digest));
  const changed = source.replace("async function* nativeLines", "async function* renamedLines");
  assert.throws(() => makeAbortableAudioValidator(changed, createHash("sha256").update(changed).digest("hex")));
  assert.throws(() => makeAbortableAudioValidator(source, "unavailable"));
});
