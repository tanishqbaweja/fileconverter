import assert from "node:assert/strict";
import test from "node:test";
import { joinStartupChildMetadata, STARTUP_CHILD_LIMITS } from "../scripts/lib/chromium-startup-child-capture.mjs";
const rootBirth = "134371258785916119", childBirth = "134371260589478319";
const child = () => ({ event: "child", pid: 2, parentPid: 1, creationFileTime: childBirth,
  type: "utility", utilitySubtype: "example.Test", sandboxType: "service", commandLine: "chrome.exe --type=utility --utility-sub-type=example.Test" });
const sample = (birth = childBirth) => ({ sequence: 1, timestamp: "2026-10-22T07:00:59Z", processes: [
  { pid: 1, parentPid: 10, creationFileTime: rootBirth, privateBytes: 100 },
  { pid: 2, parentPid: 1, creationFileTime: birth, privateBytes: 200 },
] });
test("startup metadata joins exact child birth without changing any native memory or unknown process", () => {
  const samples = [sample()], before = structuredClone(samples), result = joinStartupChildMetadata(samples, [child()], 1, rootBirth);
  assert.equal(result[0].nativeIdentityMatched, true); assert.equal(result[0].peakNativePrivateBytes, 200);
  assert.equal(result[0].observedSamples, 1); assert.deepEqual(samples, before);
});
test("reused PID, missing sample and unavailable readings never fabricate child attribution or zero", () => {
  for (const samples of [[sample("134371260589478320")], [{ sequence: 1, processes: null }], []]) {
    const row = joinStartupChildMetadata(samples, [child()], 1, rootBirth)[0];
    assert.equal(row.nativeIdentityMatched, false); assert.equal(row.peakNativePrivateBytes, null);
  }
});
test("startup capture refuses unrelated parents, duplicate identities and unbounded metadata", () => {
  const entry = child(); entry.parentPid = 9; assert.throws(() => joinStartupChildMetadata([], [entry], 1, rootBirth));
  assert.throws(() => joinStartupChildMetadata([], [child(), child()], 1, rootBirth));
  entry.parentPid = 1; entry.commandLine = "x".repeat(16385); assert.throws(() => joinStartupChildMetadata([], [entry], 1, rootBirth));
  assert.throws(() => joinStartupChildMetadata(Array(2201), [], 1, rootBirth));
  assert.deepEqual([STARTUP_CHILD_LIMITS.beginMs, STARTUP_CHILD_LIMITS.endMs, STARTUP_CHILD_LIMITS.maximumQueries], [178000, 188000, 32]);
});
