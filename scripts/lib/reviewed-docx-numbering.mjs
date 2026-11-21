// Read-only historical comparison: never imported by browser production code.
import assert from "node:assert/strict";
import { preDocxHyperlinks } from "./reviewed-docx-hyperlinks.mjs";
import { preDocxColors } from "./reviewed-docx-colors.mjs";
import { createHash } from "node:crypto";
import patch from "../../fixtures/source/docx-numbering-reviewed-2026-11-16.json" with { type: "json" };
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const beforePins = { "lib/capability-registry.ts": "2cf533d4ad37fd8da578b0332c4ee69bc036af4a650f5a32f655c0306d5911b6",
  "workers/docx-outline.ts": "ad239ccea7a3527b4e4cf7aaa2aeb3d9dd972920d5cd425b23be230ad1dd20e6" };
export function preDocxNumbering(file, bytes) {
  if (file === "lib/capability-registry.ts") bytes = preDocxHyperlinks(file, bytes);
  else bytes = preDocxColors(file, bytes);
  const entry = patch.entries[file]; assert.ok(entry && Object.hasOwn(beforePins,file));
  assert.equal(entry.beforeSha256, beforePins[file]);
  if (sha(bytes) !== entry.afterSha256) return bytes;
  assert.ok(entry.edits.length >= 1 && entry.edits.length <= 16);
  const source = bytes.toString("utf8"); let restored = source;
  for (const e of entry.edits.toReversed()) { assert.equal(restored.split(e.after).length, 2); restored = restored.replace(e.after,e.before); }
  let reapplied = restored;
  for (const e of entry.edits) { assert.equal(reapplied.split(e.before).length, 2); reapplied = reapplied.replace(e.before,e.after); }
  assert.equal(reapplied, source); const result = Buffer.from(restored); assert.equal(sha(result),entry.beforeSha256); return result;
}
