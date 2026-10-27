// One explicit private dependency repair, not a compiler-feature or quality waiver.
import assert from "node:assert/strict";
import { compileContract, verifyCompileLock } from "./compile-contract.mjs";
import { sha, inspectCandidateLock } from "./source-pins.mjs";
export const pathfinderRepair = Object.freeze({
  package: "pathfinder_simd", from: "0.5.6", to: "0.5.2",
  oldChecksum: "4500030c302e4af1d423f36f3b958d1aecb6c04184356ed5a833bf6b60435777",
  newChecksum: "0444332826c70dc47be74a7c6a5fc44e23a7905ad6858d4162b658320455ef93",
  repairedLockSha256: "09c8cea801f0433b757c5b612c96b598faf6f911ddcc665f1fad34dc000d2c6a",
  repairedManifestSha256: "a7f6f21e8f1d31c6717b77367ddd4a02e597aed45a2f0c6629806efe2f772a8e",
  reason: "Measured E0658:0.5.6 uses round_ties_even unavailable in recorded nightly;0.5.2 is the original manifest's declared version and uses round",
  candidateOnly: true, identicalRenderingClaim: false, historicalGraphRecovered: false,
});
export function makePathfinderLock(bytes) {
  verifyCompileLock(bytes);
  const old = `name = "pathfinder_simd"\nversion = "${pathfinderRepair.from}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "${pathfinderRepair.oldChecksum}"`;
  const next = old.replace(`version = "${pathfinderRepair.from}"`, `version = "${pathfinderRepair.to}"`)
    .replace(pathfinderRepair.oldChecksum, pathfinderRepair.newChecksum);
  const text = bytes.toString(); assert.equal(text.split(old).length, 2, "Exactly the failed package record");
  const result = text.replace(old, next); assert.equal(result.replace(next, old), text, "No other locked package changed");
  const summary = inspectCandidateLock(result); assert.equal(summary.packages, 158);
  assert.notEqual(summary.sha256, compileContract.lockSha256);
  assert.equal(summary.sha256, pathfinderRepair.repairedLockSha256);
  return Buffer.from(result);
}
export function pinPathfinderManifest(bytes) {
  assert.equal(sha(bytes), "6a743ccc3685714a83ecb3dfa8b8facdb55596482880eb8f2f01887a2d845496", "Exact previously resolved manifest");
  const source = bytes.toString(), before = 'pathfinder_simd = { version = "0.5.2", features = ["pf-no-simd"] }';
  assert.equal(source.split(before).length, 2);
  const result = source.replace(before, before.replace('"0.5.2"', '"=0.5.2"'));
  assert.equal(sha(result), pathfinderRepair.repairedManifestSha256); return result;
}
