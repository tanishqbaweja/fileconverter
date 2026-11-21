// Historical-only comparison. No production module imports this adapter.
// Both complete current and archived identities are checked; unknown edits do
// not inherit old qualification. New hyperlink behavior needs its own receipt.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { preDocxColors } from "./reviewed-docx-colors.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const pins = {
  "lib/capability-registry.ts": ["3be48c5f6b0fcbd49233d1b84eb9bceca38620468005f90e27cda963141b0340", "8441cf882fe64a188928ac6f6672d2a1f38cbd963bc98de3d8e9fb45263a8798"],
  "workers/docx-html-conversion.ts": ["1178dbe546b7ec55a099652c15f19269d7ab058a42eee5e8b8be6e57b1d50413", "0f00ecbe348a782ba2388543c5d67f9e4524c7707f78b880861a211cc9e48d4c"],
};
export function preDocxHyperlinks(file, bytes) {
  assert.ok(Object.hasOwn(pins, file));
  bytes = preDocxColors(file, bytes);
  const [before, after] = pins[file];
  if (sha(bytes) !== after) return bytes;
  const archived = execFileSync("git", ["show", `6b8aefe3:${file}`], { windowsHide: true, maxBuffer: 1048576 });
  assert.equal(sha(archived), before); return archived;
}
