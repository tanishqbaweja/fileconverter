// Archived pre-color harness bytes are evidence for the Nov 20 hyperlink runs,
// not proof of the modern color mode. Unknown edits do not match either pin.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function preDocxColorDriver(bytes) {
  if (sha(bytes) !== "063e6fad65c4fcff92cdfb0c10a4f28a96bbfd8d710a9dcc8848f2777b2c95e1") return bytes;
  const archived = execFileSync("git", ["show", "538f66ce71a6a9dc566538cd94cede110fd2bba3:scripts/qualify-docx-html.mjs"],
    { windowsHide: true, maxBuffer: 1048576 });
  assert.equal(sha(archived), "0a2774427d73c81a0193de6027c28485cc58858e1f1b0284bbb05b16b1171473");
  return archived;
}
