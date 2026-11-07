// Only for historical evidence: reverse the exact reporting-only PPTX hunk.
// Unknown edits still fail closed; this helper never enters the application.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const prePptxMetricWorkerSha256 = "57b9f4b9edeb981d9d267e8e2892d89007c114fb999708aff2407311b0147ce9";
export const postPptxMetricWorkerSha256 = "b1043f246fb570c84f50f21fa1b5b6a4a6dd23a7240ee0c6fe2f0ab866825dd0";
const before = `    } else if (profileId === "pptx-to-txt") {
      const presentationDestination = destination.writable;
      await runPptxToText({`;
const after = before.replace("      await runPptxToText({", `      metrics.activeWorkerCount = 1 + (presentationDestination.additionalWorkerCount ?? 0);
      metrics.sharedArrayBufferBytes = (cancellationSignal?.byteLength ?? 0) +
        (presentationDestination.sharedBufferBytes ?? 0);
      await runPptxToText({`);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

// Reverse only the reviewed DOCX HTML positioned append and patch hunk.
// Old receipts continue to bind to their executed worker rather than a new hash.
const docxAnchor = "      const documentDestination = destination.writable;\n";
const docxAppend = `      // A row-span patch moves the underlying writer's cursor. Append from
      // the acknowledged output extent so the next chunk cannot overwrite it.
      const documentAppendDestination: RandomAccessDestination = profileId === "docx-to-html" ? {
        ...documentDestination,
        write: (data) => documentDestination.write(data instanceof Uint8Array
          ? { type: "write", position: metrics.outputBytes, data } : data),
      } : documentDestination;
`;
const docxPatch = `        patch: (position, chunk, phase) =>
          patchBounded(documentDestination, position, chunk, jobId, phase, metrics, startedAt),
`;
export function preDocxRowspanWorker(bytes) {
  if (sha(bytes) !== "893908859d5098d7e2078d2ae8e4231e1b6b7ba199dac9126d8cf8a5c761dbe5") return bytes;
  const current = bytes.toString("utf8");
  let old = current;
  for (const [after, before] of [[docxAnchor + docxAppend, docxAnchor],
    ["            documentAppendDestination,\n", "            documentDestination,\n"], [docxPatch, ""]]) {
    assert.equal(old.split(after).length, 2);
    old = old.replace(after, before);
  }
  assert.equal(sha(old), postPptxMetricWorkerSha256);
  return Buffer.from(old);
}

export function prePptxMetricWorker(bytes) {
  bytes = preDocxRowspanWorker(bytes);
  const digest = sha(bytes);
  if (digest === prePptxMetricWorkerSha256) return bytes;
  assert.equal(digest, postPptxMetricWorkerSha256, "Only the exact PPTX destination metrics edit can be reversed");
  const current = bytes.toString("utf8");
  assert.equal(current.split(after).length, 2);
  const previous = current.replace(after, before);
  assert.equal(previous.split(before).length, 2);
  assert.equal(previous.replace(before, after), current);
  assert.equal(sha(previous), prePptxMetricWorkerSha256);
  return Buffer.from(previous);
}
