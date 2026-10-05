import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const workflow = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
const historicalSha = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
const readerOnlyRetentionSha = "8442e48304e6ba448cad205f1e6dfd5757a41e25f6b20be4a50c611957a1f767";
const retentionLines = ["            work/mpeg2-candidate-output/refstruct-diagnostic-smoke.json\n",
  "            work/mpeg2-candidate-output/mpeg2-accessory-smoke.json\n"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Older compiled proofs predate two additional retained unit JSON files. Do
// not refresh their hashes: reversing exactly those lines must recover every
// byte of the workflow actually used. All other files remain byte-exact.
export function provenSourceSha(file, bytes, expected) {
  if (file !== workflow || ![historicalSha, readerOnlyRetentionSha].includes(expected) || sha(bytes) === expected)
    return sha(bytes);
  let text = bytes.toString("utf8");
  for (const line of expected === historicalSha ? retentionLines : retentionLines.slice(1)) {
    assert.equal(text.split(line).length, 2, "Exactly one of each additional smoke artifact path");
    text = text.replace(line, "");
  }
  const recovered = sha(text);
  assert.equal(recovered, expected, "No other historical workflow bytes may change");
  return recovered;
}
