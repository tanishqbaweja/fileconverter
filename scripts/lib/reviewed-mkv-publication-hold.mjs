// Historical evidence adapters only. Production never restores a held route.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import patch from "../../fixtures/source/mkv-publication-hold-reviewed-2026-11-16.json" with { type: "json" };
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function preMkvPublicationHoldRegistry(bytes) {
  if (sha(bytes) !== patch.afterSha256) return bytes; // Unknown edits still fail the caller's historical pins.
  assert.equal(patch.beforeSha256, "d133f2b4ce071996ef183e476f4310ccb868248f7f950f9ec7ee13cd92043f3d");
  assert.equal(patch.afterSha256, "2cf533d4ad37fd8da578b0332c4ee69bc036af4a650f5a32f655c0306d5911b6");
  assert.equal(patch.edits.length, 4);
  const source = bytes.toString("utf8"); let restored = source;
  for (const e of patch.edits.toReversed()) { assert.equal(restored.split(e.after).length, 2); restored = restored.replace(e.after, e.before); }
  let reapplied = restored;
  for (const e of patch.edits) { assert.equal(reapplied.split(e.before).length, 2); reapplied = reapplied.replace(e.before, e.after); }
  assert.equal(reapplied, source); const before = Buffer.from(restored); assert.equal(sha(before), patch.beforeSha256); return before;
}
