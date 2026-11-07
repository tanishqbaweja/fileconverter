// Exact reviewed source integration for immutable historical comparisons and
// SVG overlays. Unknown edits still fail; production imports no such adapter.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import patch from "../../fixtures/source/docx-html-reviewed-integration-2026-11-07.json" with { type: "json" };
const pins = Object.freeze({
  "workers/conversion.worker.ts": ["fbdbd631d791420f6af3a8dcaa9871fb367a04dbeb456999441b6f9c2a7ae833", "f5aeec0add0e600e5c5577ed6d02ea0880737b51d9d1238e20a3a4a3a847e021"],
  "lib/capability-registry.ts": ["acc1c6cb5104f329eec92f37b31754e7842f24bb174e703cf741b11379403781", "f270c6faf6ad2b09e5e67d3381c8c45ec83d04f87d72109e6ea197d0562a8de5"],
});
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function reviewDocxHtmlIntegration(file, bytes) {
  assert.ok(Object.hasOwn(pins, file)); assert.equal(patch.sourceCommit, "edd56842b13aef554bf3283c967c1cbef3871350");
  const [beforeSha256, afterSha256] = pins[file], digest = sha(bytes);
  if (digest === beforeSha256) return { historicalBytes: bytes, currentSha256: digest, historicalSha256: beforeSha256, reviewedDocxHtmlChange: false };
  assert.equal(digest, afterSha256, "Only the exact reviewed private DOCX HTML integration is accepted");
  const edit = patch.entries[file]; assert.equal(edit.beforeSha256, beforeSha256); assert.equal(edit.afterSha256, afterSha256);
  const current = bytes.toString("utf8"); assert.equal(current.split(edit.after).length, 2);
  const restored = current.replace(edit.after, edit.before); assert.equal(restored.split(edit.before).length, 2);
  assert.equal(restored.replace(edit.before, edit.after), current, "Complete current source must round-trip exactly");
  const historicalBytes = Buffer.from(restored); assert.equal(sha(historicalBytes), beforeSha256);
  return { historicalBytes, currentSha256: digest, historicalSha256: beforeSha256, reviewedDocxHtmlChange: true };
}
