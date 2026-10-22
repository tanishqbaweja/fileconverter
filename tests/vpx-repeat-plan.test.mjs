import assert from "node:assert/strict";
import test from "node:test";
import { makeVpxRepeatPlan } from "../scripts/lib/vpx-repeat-plan.mjs";
test("private repeat gate selects exactly3 of each original codec/settings variant", () => {
  const plan = makeVpxRepeatPlan("1"); assert.equal(plan.length, 12);
  for (const codec of ["vp8", "vp9"]) for (const settings of ["default", "controls"]) {
    assert.deepEqual(plan.filter(x => x.codec === codec && x.settings === settings).map(x => x.repetition), [1, 2, 3]);
  }
  assert.ok(plan.every(Object.isFrozen));
});
test("repeat qualification is opt-in and cannot create arbitrary loops", () => {
  assert.deepEqual(makeVpxRepeatPlan(undefined), []); assert.deepEqual(makeVpxRepeatPlan("0"), []);
  for (const value of ["", "3", "12", "true", 1, null]) assert.throws(() => makeVpxRepeatPlan(value));
});
