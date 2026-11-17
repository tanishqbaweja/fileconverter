import assert from "node:assert/strict";
import test from "node:test";
import { reconcileNativeBirthRole as reconcile } from "../scripts/lib/native-birth-role.mjs";
const birth = { pid: 32416, parentPid: 21976, createdAt: "2026-11-16T13:07:05.2747657Z", creationFileTime: "134393080252747657" };
const witness = { ...birth, status: "classified", attempts: 1, error: null, type: "utility",
  utilitySubtype: "on_device_model.mojom.OnDeviceModelService", sandboxType: "on_device_model_execution" };
const capture = () => ({ globalError: null, classificationPrecisionNanoseconds: 1000, acceptanceMetric: false,
  memoryFormulaChanged: false, processesExcluded: false, primarySamplesMutated: false, records: [structuredClone(witness)] });
test("unique complete birth witness supplies role without mutating inputs", () => {
  const c = capture(), before = JSON.stringify(c), b = { ...birth };
  assert.equal(reconcile(b, c).utilitySubtype, witness.utilitySubtype);
  assert.deepEqual(b, birth); assert.equal(JSON.stringify(c), before);
});
test("PID reuse, different parent, full timestamp or FILETIME cannot supply another birth's role", () => {
  for (const key of Object.keys(birth)) {
    const c = capture(); c.records[0][key] = typeof birth[key] === "number" ? birth[key] + 1 : birth[key] + "0";
    assert.equal(reconcile(birth, c).status, "unavailable", key);
  }
});
test("duplicates and coarser-precision collisions remain unknown", () => {
  for (const extra of [witness, { ...witness, createdAt: "2026-11-16T13:07:05.2747658Z", creationFileTime: "134393080252747658" }]) {
    const c = capture(); c.records.push(extra); assert.equal(reconcile(birth, c).status, "unavailable");
  }
});
test("missing/error/ambiguous/unqueried witnesses and unsafe labels never become classified", () => {
  for (const patch of [{ status: "not-in-matching-census" }, { status: "ambiguous-birth-at-cim-precision" }, { attempts: 0 },
    { error: "failed" }, { utilitySubtype: "<script>" }, { sandboxType: "x\ny" }, { type: "unknown" }]) {
    const c = capture(); Object.assign(c.records[0], patch); assert.equal(reconcile(birth, c).status, "unavailable");
  }
  for (const c of [null, {}, { ...capture(), records: [] }, { ...capture(), globalError: "failed" },
    { ...capture(), records: [null] }, { ...capture(), records: [witness, { ...witness, createdAt: 2 }] },
    { ...capture(), records: Array(513).fill(witness) }, { ...capture(), classificationPrecisionNanoseconds: 100 }])
    assert.equal(reconcile(birth, c).status, "unavailable");
});
test("a capture that mutates the metric or excludes a process cannot supply diagnostic attribution", () => {
  for (const key of ["acceptanceMetric", "memoryFormulaChanged", "processesExcluded", "primarySamplesMutated"])
    assert.equal(reconcile(birth, { ...capture(), [key]: true }).status, "unavailable");
  assert.equal(reconcile({ ...birth, creationFileTime: "" }, capture()).status, "unavailable");
});
