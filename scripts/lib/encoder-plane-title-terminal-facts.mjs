// Post-terminal facts only; title representation never substitutes for full fidelity.
import assert from "node:assert/strict";
import { encoderPlaneTerminalFacts } from "./encoder-plane-terminal-facts.mjs";
import { validateMatroskaMp4StreamTitle } from "./matroska-mp4-stream-title.mjs";
import { CLEANUP_ERROR_LIMITS } from "./bounded-cleanup-error.mjs";

export function boundedTitleFullCleanupDiagnostics(errors) {
  assert.ok(Array.isArray(errors) && errors.length <= 64);
  return errors.map(value => {
    assert.equal(typeof value, "string");
    assert.ok(Buffer.byteLength(value) <= CLEANUP_ERROR_LIMITS.serializedBytes);
    try {
      const parsed = JSON.parse(value);
      assert.ok(parsed && typeof parsed === "object" && parsed.details && typeof parsed.details === "object");
      assert.deepEqual(parsed.limits, CLEANUP_ERROR_LIMITS);
      return { serializedDetailsRetained: true, diagnostics: parsed, historicalFailureCauseProven: false };
    } catch {
      return { serializedDetailsRetained: false, originalText: value, historicalFailureCauseProven: false };
    }
  });
}

export function encoderPlaneTitleTerminalFacts(raw) {
  const facts = encoderPlaneTerminalFacts(raw);
  const validatedTitleMappings = [];
  for (const run of raw.runs) {
    if (run.state?.jobState !== "complete" || !run.independentValidation) continue;
    const source = raw.source.probe, output = run.independentValidation.probe;
    assert.deepEqual(run.independentPreAssertionProbe, output, "Retain exact output metadata before assertions");
    const videos = probe => probe.streams.filter(s => s.codec_type === "video" && !s.disposition?.attached_pic);
    const inputVideo = videos(source), outputVideo = videos(output);
    assert.equal(inputVideo.length, 1); assert.equal(outputVideo.length, 1);
    const video = validateMatroskaMp4StreamTitle(inputVideo[0].tags, outputVideo[0].tags);
    assert.deepEqual(run.exactVideoTitleMapping, video);
    const inputAudio = source.streams.filter(s => s.codec_type === "audio");
    const outputAudio = output.streams.filter(s => s.codec_type === "audio");
    assert.ok(inputAudio.length > 0); assert.equal(outputAudio.length, inputAudio.length);
    const audio = inputAudio.map((stream, index) => validateMatroskaMp4StreamTitle(stream.tags, outputAudio[index].tags));
    assert.deepEqual(run.exactAudioTitleMappings, audio);
    validatedTitleMappings.push({ number: run.number, video, audio });
  }
  assert.equal(validatedTitleMappings.length, facts.completedConversions);
  return { ...facts, validatedTitleMappings,
    firstCandidateFailure: raw.failure ?? null,
    exactStreamTitlesIndependentlyRechecked: validatedTitleMappings.length > 0,
    historicalFullOutputRetroactivelyAccepted: false };
}
