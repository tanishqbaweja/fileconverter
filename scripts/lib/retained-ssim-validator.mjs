// Independent validator evidence only; never alters a browser codec or pixel.
import assert from "node:assert/strict";
import { readFile, open } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { inspectSsimSummary } from "./cr-aware-ssim-summary.mjs";
export async function inspectAndRetainSsim({ root, reportBase, number, stderr, output }) {
  assert.equal(path.dirname(reportBase), path.join(root, "outputs/reports"));
  assert.ok(Number.isInteger(number) && number >= 1 && number <= 3);
  const diagnostic = inspectSsimSummary(stderr); // Original32MiB cap, raw-byte hash.
  assert.ok(Number.isSafeInteger(output.outputBytes) && output.outputBytes > 0); assert.match(output.sha256, /^[a-f0-9]{64}$/);
  const raw = Buffer.from(stderr), zip = gzipSync(raw, { level: 9 }), file = reportBase + `-ssim-${number}.stderr.gz`;
  const handle = await open(file, "wx");
  try { await handle.writeFile(zip); await handle.sync(); } finally { await handle.close(); }
  assert.deepEqual(gunzipSync(await readFile(file)), raw);
  return { ...diagnostic, recordFraming: "CR-or-LF-original-score-guards-unchanged", output,
    archive: { path: path.relative(root, file).replaceAll(path.sep, "/"), bytes: zip.length, sha256: sha(zip),
      restoredBytes: raw.length, restoredSha256: sha(raw) } };
}
