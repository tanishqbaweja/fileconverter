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

export function prePptxMetricWorker(bytes) {
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
