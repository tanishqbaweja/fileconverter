import assert from "node:assert/strict";
import test from "node:test";
import { describeOwnedCleanupError, CLEANUP_ERROR_LIMITS } from "../scripts/lib/bounded-cleanup-error.mjs";
import { finishOwnedCleanup } from "../scripts/lib/owned-runtime-scratch.mjs";

test("actual cleanup aggregator retains every nested cause and command failure without excusing cleanup", async () => {
  let attempted = 0;
  const command = Object.assign(new Error("owned taskkill failed"), { code: 128,
    stdout: "command output", stderr: "command failure", cause: new Error("nested cause") });
  let thrown;
  try { await finishOwnedCleanup([
    () => { attempted++; throw command; },
    () => { attempted++; throw new Error("second independent failure"); },
  ]); } catch (error) { thrown = error; }
  assert.equal(attempted, 2);
  assert.ok(thrown instanceof AggregateError);
  assert.ok(!String(thrown).includes("owned taskkill failed"));
  const report = describeOwnedCleanupError(thrown);
  assert.equal(report.truncated, false);
  assert.equal(report.details.name, "AggregateError");
  assert.equal(report.details.errors.length, 2);
  assert.equal(report.details.errors[0].code, "128");
  assert.equal(report.details.errors[0].stderr, "command failure");
  assert.equal(report.details.errors[0].cause.message, "nested cause");
  assert.equal(report.details.errors[1].message, "second independent failure");
});

test("cleanup diagnostics cap cyclic, deep, wide, Unicode and escaped error data", () => {
  const root = new Error("root"); root.cause = root;
  const cyclic = describeOwnedCleanupError(root);
  assert.equal(cyclic.details.cause.circularOrRepeatedReference, true);
  let chain = new Error("leaf");
  for (let i = 0; i < 100; i++) chain = new Error("deep", { cause: chain });
  for (const error of [chain, new AggregateError(Array.from({ length: 1000 }, () =>
    new Error("\u0000音楽".repeat(10000))), "wide"), Object.assign(new Error("large"), {
    stdout: "\u0000".repeat(100000), stderr: "音楽".repeat(100000) })]) {
    const report = describeOwnedCleanupError(error);
    assert.equal(report.truncated, true);
    assert.ok(Buffer.byteLength(JSON.stringify(report)) <= CLEANUP_ERROR_LIMITS.serializedBytes);
  }
});

test("non-Error cleanup failures and throwing diagnostic getters remain reportable", () => {
  for (const error of [undefined, null, 2n, "failure", Symbol("reason")])
    assert.doesNotThrow(() => JSON.stringify(describeOwnedCleanupError(error)));
  const error = new Error("ordinary failure");
  Object.defineProperty(error, "cause", { get() { throw new Error("bad getter"); } });
  const report = describeOwnedCleanupError(error);
  assert.equal(report.details.message, "ordinary failure");
  assert.equal(report.truncated, true);
  const revoked = Proxy.revocable([], {}); revoked.revoke();
  assert.equal(describeOwnedCleanupError({ errors: revoked.proxy }).truncated, true);
  const unreadable = [];
  Object.defineProperty(unreadable, "0", { get() { throw new Error("bad element"); } });
  const aggregate = describeOwnedCleanupError({ errors: unreadable });
  assert.equal(aggregate.truncated, true);
  assert.deepEqual(aggregate.details.errors, [{ unavailable: true }]);
});
