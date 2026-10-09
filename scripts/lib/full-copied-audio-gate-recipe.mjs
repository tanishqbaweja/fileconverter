// Source preparation only. Never edit/attach to a live driver or launch a conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const EXECUTED_SINGLE_IDLE_FULL_SHA = "e65e464a1065d54e4c3da78b58ac1030cc0bfe7b17ca86602de803532a7bf96a";
export const copiedAudioGateFiles = Object.freeze([
  "scripts/lib/full-copied-audio-gate-recipe.mjs",
  "scripts/lib/streaming-copied-audio-validation.mjs",
  "tests/full-copied-audio-gate-recipe.test.mjs",
]);
const digest = value => createHash("sha256").update(value).digest("hex");

export function makeFullCopiedAudioGateRecipe(executed, root) {
  const source = executed.generated;
  assert.equal(digest(source), EXECUTED_SINGLE_IDLE_FULL_SHA, "Only the archived actually executed full driver may be extended");
  assert.equal(executed.generatedSha256, EXECUTED_SINGLE_IDLE_FULL_SHA);
  assert.ok(path.isAbsolute(root));
  const rootLine = source.match(/^const root = (".*?"), MiB = 1024 \*\* 2;$/m);
  assert.ok(rootLine); assert.equal(JSON.parse(rootLine[1]), root, "Validator import must stay in the executed repository");
  const declaration = [...source.matchAll(/^const sourceFiles = (\[[\s\S]*?\]);$/gm)];
  assert.equal(declaration.length, 1);
  const existingFiles = JSON.parse(declaration[0][1]);
  const addedFiles = copiedAudioGateFiles.filter(file => !existingFiles.includes(file));
  assert.ok(new Set([...existingFiles, ...addedFiles]).size <= 256);
  const importLine = `import { validateCopiedAudioFrames, AUDIO_VALIDATOR_LIMITS } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/streaming-copied-audio-validation.mjs")).href)};\n`;
  const audioBlock = `    assert.ok(inputAudio.length > 0 && inputAudio.length <= AUDIO_VALIDATOR_LIMITS.streams, "Protected full source requires bounded complete audio coverage");
    const decodedAudioFrameValidation = [];
    // Sequential ordinals: at most one source/output native validation pair active.
    for (let audioOrdinal = 0; audioOrdinal < inputAudio.length; audioOrdinal++) {
      decodedAudioFrameValidation.push(await validateCopiedAudioFrames(source, output,
        { env: runtime.env, audioOrdinal }));
    }`;
  const firstLine = source.slice(0, source.indexOf("\n") + 1);
  const audioAnchor = "    assert.deepEqual(await audioHashes(output), await audioHashes(source));";
  const edits = [
    [firstLine, firstLine + importLine],
    ["const sourceFiles = [", "const sourceFiles = [" + addedFiles.map(file => JSON.stringify(file) + ",").join("")],
    [audioAnchor, audioAnchor + "\n" + audioBlock],
    ["ssim, fullDecode: true };", "ssim, fullDecode: true, decodedAudioFrameValidation };"],
    ['"mode":"single-idle-full-completion"', '"mode":"single-idle-full-completion","decodedCopiedAudioRequired":true'],
  ];
  let generated = source;
  for (const [before, after] of edits) {
    assert.equal(generated.split(before).length, 2, "Exactly one known insertion anchor required: " + before);
    generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) {
    assert.equal(reversed.split(after).length, 2);
    reversed = reversed.replace(after, before);
  }
  assert.equal(reversed, source, "Every original conversion, quality, memory, timestamp, repeat and cleanup gate must remain byte-identical");
  assert.ok(generated.indexOf(audioBlock) < generated.indexOf("    await emptyOpfs(); await page.waitForFunction"));
  return { generated, generatedSha256: digest(generated), baseDriverSha256: EXECUTED_SINGLE_IDLE_FULL_SHA,
    edits, addedFiles, audioBlock, status: "prepared-source-only-not-executed",
    rootAndTraceBindingsUnchanged: true, requiresFreshOwnedWrapperBindingBeforeLaunch: true,
    requestedRuns: 3, maximumConversionMs: 21600000, fullCompletionRequired: true,
    originalFullAudioValidated: false, publicAcceptance: false };
}
