import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPcmPrefixDiagnostic } from "../scripts/lib/pcm-prefix-diagnostic.mjs";
import { makeAacSourceDiagnosisWorkflow } from "../scripts/lib/aac-source-diagnosis-workflow.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
test("diagnostic hashes complete PCM and exactly the declared prefix across arbitrary sample/chunk boundaries", () => {
  const bytes = Uint8Array.from({ length: 400 }, (_, i) => i % 251);
  for (const channels of [1, 2]) for (const skip of [0, 1, 23]) {
    const digest = createPcmPrefixDiagnostic({ channels, declaredLeadingSamples: skip });
    for (let i = 0; i < bytes.length; i += 7) digest.update(bytes.subarray(i, i + 7));
    const result = digest.finish(); assert.equal(result.rawSha256, sha(bytes));
    assert.equal(result.afterDeclaredPrefixSha256, sha(bytes.subarray(skip * channels * 2)));
    assert.equal(result.decodedSamplesPerChannel, 400 / (channels * 2)); assert.equal(result.retainedPcmBytes, 0);
    assert.equal(result.largestChunkBytes, 7); assert.throws(() => digest.finish()); assert.throws(() => digest.update(new Uint8Array()));
  }
});
test("diagnostic refuses malformed layouts, unbounded chunks, sample fragments, short samples or cap overflow", () => {
  for (const options of [{ channels: 0 }, { channels: 9 }, { channels: 1, declaredLeadingSamples: -1 }, { channels: 1, declaredLeadingSamples: 0, bytesPerSample: 3 }])
    assert.throws(() => createPcmPrefixDiagnostic(options));
  let digest = createPcmPrefixDiagnostic({ channels: 1, declaredLeadingSamples: 0 });
  assert.throws(() => digest.update(new Uint8Array(262145))); digest.update(new Uint8Array(1)); assert.throws(() => digest.finish());
  digest = createPcmPrefixDiagnostic({ channels: 1, declaredLeadingSamples: 4 }); digest.update(new Uint8Array(2)); assert.throws(() => digest.finish());
  digest = createPcmPrefixDiagnostic({ channels: 1, declaredLeadingSamples: 0, maximumBytes: 4 }); assert.throws(() => digest.update(new Uint8Array(5)));
});
test("hosted source diagnosis changes only the private job and cannot claim a browser or rebuild execution", async () => {
  const source = await readFile(".github/workflows/ci.yml", "utf8"), workflow = makeAacSourceDiagnosisWorkflow(source);
  assert.equal(workflow.edits.length, 1); assert.equal(workflow.publicAcceptance, false); assert.equal(workflow.browserConversionClaim, false);
  const job = workflow.edits[0][1]; assert.doesNotMatch(job, /playwright|npm ci|reproduce-nondocker|docker run/);
  assert.match(job, /run-repository-owned-node.mjs scripts\/diagnose-aac-source-priming.mjs/);
  assert.match(job, /retention-days: 1/);
  assert.throws(() => makeAacSourceDiagnosisWorkflow(source + "\n"));
});
