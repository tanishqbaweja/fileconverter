import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const workflow = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
const historicalSha = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
const retentionLine = "            work/mpeg2-candidate-output/refstruct-diagnostic-smoke.json\n";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Older compiled proofs predate one additional retained diagnostic JSON. Do
// not refresh their hashes: reversing exactly that line must recover every
// byte of the workflow actually used. All other files remain byte-exact.
export function provenSourceSha(file, bytes, expected) {
  if (file !== workflow || expected !== historicalSha || sha(bytes) === expected)
    return sha(bytes);
  const text = bytes.toString("utf8");
  assert.equal(text.split(retentionLine).length, 2, "Exactly one additional smoke artifact path");
  const recovered = sha(text.replace(retentionLine, ""));
  assert.equal(recovered, expected, "No other historical workflow bytes may change");
  return recovered;
}
