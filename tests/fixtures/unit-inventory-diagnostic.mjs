// Invoked explicitly by the reporter's own negative test, not the unit glob.
import assert from "node:assert/strict";
import test from "node:test";
test("diagnostic pass", () => assert.equal(1, 1));
test("diagnostic intentional failure", () => { throw Object.assign(new Error("Expected reporter smoke failure"), { code: "DIAGNOSTIC_EXPECTED" }); });
test("diagnostic explicit skip", { skip: "Reporter must not relabel this as passed" }, () => assert.fail());
