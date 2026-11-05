import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { finishPrivateVp9Integrity } from "../scripts/lib/private-vp9-finalization.mjs";

function setup(overrides = {}) {
  const calls = [], report = { failures: ["original failure"], sourcePins: {} };
  return { calls, report, args: { report, runtime: undefined, runtimeRemovalAllowed: true,
    original: async () => { calls.push("original"); return { bytes: 10, sha256: "expected" }; },
    expectedOriginal: { bytes: 10, sha256: "expected" }, assertEqual: assert.deepEqual,
    inspectBrowserPin: async () => { calls.push("pin"); return { version: "same" }; },
    assertBrowserPinsEqual: assert.deepEqual, verifySources: async () => { calls.push("sources"); }, ...overrides } };
}
test("host preflight exit checks original/sources without inspecting an unacquired browser pin", async () => {
  const { args, report, calls } = setup(); await finishPrivateVp9Integrity(args);
  assert.deepEqual(calls, ["original", "sources"]); assert.deepEqual(report.failures, ["original failure"]);
  assert.equal(report.runtimeCleanupStatus, "not-created"); assert.equal(report.ownedRuntimeRemoved, false);
  assert.equal(report.browserPinFinalCheck, "not-acquired"); assert.deepEqual(report.originalAfter, args.expectedOriginal);
});
test("normal finally closes owned runtime and checks the acquired pin", async () => {
  let closed = 0;
  const { args, report, calls } = setup({ runtime: { close: async () => { closed++; } } });
  report.browserPin = { version: "same" }; await finishPrivateVp9Integrity(args);
  assert.equal(closed, 1); assert.equal(report.runtimeCleanupStatus, "removed"); assert.equal(report.ownedRuntimeRemoved, true);
  assert.equal(report.browserPinFinalCheck, "verified"); assert.deepEqual(calls, ["original", "pin", "sources"]);
});
test("runtime cleanup failure never suppresses independent original, browser and source checks", async () => {
  const { args, report, calls } = setup({ runtime: { close: async () => { throw new Error("close failed"); } } });
  report.browserPin = { version: "changed" }; await finishPrivateVp9Integrity(args);
  assert.deepEqual(calls, ["original", "pin", "sources"]); assert.equal(report.ownedRuntimeRemoved, false);
  assert.equal(report.runtimeCleanupStatus, "removal-failed");
  assert.equal(report.browserPinFinalCheck, "failed"); assert.equal(report.failures.length, 3);
  assert.ok(report.failures.some(x => x.includes("close failed"))); assert.ok(report.failures.some(x => x.includes("Browser pin integrity")));
});
test("unverified process exit retains runtime but still runs integrity checks", async () => {
  const { args, report, calls } = setup({ runtimeRemovalAllowed: false,
    runtime: { close: async () => { assert.fail("Must not remove potentially live runtime"); } } });
  await finishPrivateVp9Integrity(args); assert.deepEqual(calls, ["original", "sources"]);
  assert.equal(report.runtimeCleanupStatus, "retained-unverified-process-exit"); assert.equal(report.ownedRuntimeRemoved, false);
  assert.match(report.failures[1], /Owned process exit must be verified/);
});
test("original and source integrity errors are both retained", async () => {
  const { args, report } = setup({ original: async () => ({ bytes: 9 }), verifySources: async () => { throw new Error("source changed"); } });
  await finishPrivateVp9Integrity(args); assert.equal(report.failures.length, 3);
  assert.match(report.failures[1], /Original integrity/); assert.match(report.failures[2], /source changed/);
});
for (const mode of ["--fallback-realms", "--fallback-native-allocation", "--compare-default-core", "--compare-single-core", "--compare-single-core-preflight-recovery"]) {
  test(`offline derivative ${mode} is reversible and parses without launching or overwriting evidence`, async () => {
    const { stdout } = await promisify(execFile)(process.execPath,
      ["scripts/test-webcodecs-vp9-functional-diagnostic.mjs", mode, "--check-only"],
      { cwd: new URL("../", import.meta.url), windowsHide: true, timeout: 30000, maxBuffer: 65536 });
    const result = JSON.parse(stdout); assert.equal(result.checkOnly, true); assert.equal(result.reversible, true);
    assert.equal(result.browserLaunched, false); assert.equal(result.recipeWritten, false);
    assert.match(result.generatedSha256, /^[a-f0-9]{64}$/);
  });
}
