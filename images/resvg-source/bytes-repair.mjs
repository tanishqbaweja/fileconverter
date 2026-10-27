// The published binary supplies the exact version witness; no dependency sweep.
import assert from "node:assert/strict";
import { sha, inspectCandidateLock } from "./source-pins.mjs";
import { pathfinderRepair } from "./pathfinder-repair.mjs";
export const bytesRepair = Object.freeze({
  package: "bytes", from: "1.12.1", to: "1.6.0",
  oldChecksum: "fc652a48c352aef3ea3aed32080501cf3ef6ed5da78602a020c991775b0aff04",
  newChecksum: "514de17de45fdb8dc022b1a7975556c53c86f9f0aa5f534b98977b171857c2c9",
  repairedLockSha256: "7bf87e7ccbd783700754844a8357a20b7b097c2c69e31476d9f44ba19ff886bc",
  publishedVersionWitness: "bytes-1.6.0", candidateOnly: true, securityOrRenderingQualification: false,
  reason: "Measured WOFF2 SafeBuf/Buf try_get method collision in newer bytes; inspected official1.6.0 source lacks those new methods and matches actual published Wasm path witness",
});
export function makePublishedBytesLock(bytes) {
  assert.equal(sha(bytes), pathfinderRepair.repairedLockSha256, "Only exact measured Pathfinder candidate may receive this repair");
  const before = `name = "bytes"\nversion = "${bytesRepair.from}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "${bytesRepair.oldChecksum}"`;
  const after = before.replace(`version = "${bytesRepair.from}"`, `version = "${bytesRepair.to}"`).replace(bytesRepair.oldChecksum, bytesRepair.newChecksum);
  const source = bytes.toString(); assert.equal(source.split(before).length, 2);
  const result = source.replace(before, after); assert.equal(result.replace(after, before), source, "All other package records remain identical");
  const summary = inspectCandidateLock(result); assert.equal(summary.packages, 158);
  assert.equal(summary.sha256, bytesRepair.repairedLockSha256);
  return Buffer.from(result);
}
