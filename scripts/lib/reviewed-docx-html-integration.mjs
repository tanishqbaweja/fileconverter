// Exact reviewed source integration for immutable historical comparisons and
// SVG overlays. Unknown edits still fail; production imports no such adapter.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import patch from "../../fixtures/source/docx-html-reviewed-integration-2026-11-07.json" with { type: "json" };
import { postPptxMetricWorkerSha256, prePptxMetricWorker, preDocxRowspanWorker } from "./reviewed-pptx-destination-metrics.mjs";
const pins = Object.freeze({
  "workers/conversion.worker.ts": ["fbdbd631d791420f6af3a8dcaa9871fb367a04dbeb456999441b6f9c2a7ae833", "57b9f4b9edeb981d9d267e8e2892d89007c114fb999708aff2407311b0147ce9"],
  "lib/capability-registry.ts": ["acc1c6cb5104f329eec92f37b31754e7842f24bb174e703cf741b11379403781", "371738c549f0abba5194b25ea3807ebe602cfe1ba9456974e4570639d512b49e"],
});
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function preDocxRowspanRegistry(bytes) {
  if (sha(bytes) !== "d133f2b4ce071996ef183e476f4310ccb868248f7f950f9ec7ee13cd92043f3d") return bytes;
  const old = patch.entries["lib/capability-registry.ts"].after;
  const updated = old.replace("simple table rows/cells", "table rows/cells with horizontal grid spans and standard vertical merges")
    .replace("    \"Only supported outline/emphasis", "    \"Omitted edge grid positions use empty cells; vertical continuations must have matching columns and no visible content. Legacy horizontal merges, cell sizing and exact Word table layout are not reproduced.\",\n    \"Only supported outline/emphasis")
    .replace(", merged-cell geometry", "");
  const source = bytes.toString("utf8");
  assert.equal(source.split(updated).length, 2);
  const previous = Buffer.from(source.replace(updated, old));
  assert.equal(sha(previous), pins["lib/capability-registry.ts"][1]);
  return previous;
}
export function reviewDocxHtmlIntegration(file, bytes) {
  assert.ok(Object.hasOwn(pins, file)); assert.equal(patch.sourceCommit, "edd56842b13aef554bf3283c967c1cbef3871350");
  if (file === "workers/conversion.worker.ts") bytes = preDocxRowspanWorker(bytes);
  else bytes = preDocxRowspanRegistry(bytes);
  const currentDigest = sha(bytes);
  if (file === "workers/conversion.worker.ts" && currentDigest === postPptxMetricWorkerSha256) bytes = prePptxMetricWorker(bytes);
  const [beforeSha256, afterSha256] = pins[file], digest = sha(bytes);
  if (digest === beforeSha256) return { historicalBytes: bytes, currentSha256: digest, historicalSha256: beforeSha256, reviewedDocxHtmlChange: false };
  assert.equal(digest, afterSha256, "Only the exact reviewed private DOCX HTML integration is accepted");
  const edit = patch.entries[file]; assert.equal(edit.beforeSha256, beforeSha256); assert.equal(edit.afterSha256, afterSha256);
  const edits = edit.edits ?? [{ before: edit.before, after: edit.after }];
  assert.ok(edits.length >= 1 && edits.length <= 2);
  const current = bytes.toString("utf8"); let restored = current;
  for (const hunk of edits.toReversed()) {
    assert.equal(restored.split(hunk.after).length, 2);
    restored = restored.replace(hunk.after, hunk.before); assert.equal(restored.split(hunk.before).length, 2);
  }
  let reapplied = restored;
  for (const hunk of edits) { assert.equal(reapplied.split(hunk.before).length, 2); reapplied = reapplied.replace(hunk.before, hunk.after); }
  assert.equal(reapplied, current, "Complete current source must round-trip exactly");
  const historicalBytes = Buffer.from(restored); assert.equal(sha(historicalBytes), beforeSha256);
  let previousReviewedBytes;
  if (edit.previousAfter !== undefined) {
    assert.equal(file, "lib/capability-registry.ts");
    assert.equal(edit.previousAfterSha256, "e04961e2e9cd96bec145a28bb4b35d4c551c433dbd5c58b86fa308bf431357d7");
    assert.equal(current.split(edit.after).length, 2);
    previousReviewedBytes = Buffer.from(current.replace(edit.after, edit.previousAfter));
    assert.equal(sha(previousReviewedBytes), edit.previousAfterSha256, "Exact previous outline-only private registry, not current qualification");
  }
  return { historicalBytes, currentSha256: currentDigest, historicalSha256: beforeSha256, reviewedDocxHtmlChange: true, previousReviewedBytes };
}
