import assert from "node:assert/strict";
import { lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { finishOwnedCleanupPhases } from "../scripts/lib/phased-owned-cleanup.mjs";

test("observer timeout still closes owned processes and removes real scratch, while remaining a failure", async () => {
  const scratch = await createOwnedRuntimeScratch("phase-unit-"), reports = [], calls = [];
  let browserClosed = false, serverClosed = false;
  try {
    await writeFile(path.join(scratch.directory, "disposable-output"), "owned test data");
    await assert.rejects(finishOwnedCleanupPhases([
      { name: "observers", actions: [() => { calls.push("observer"); throw new Error("Native observer response timed out"); }] },
      { name: "processes", actions: [() => { browserClosed = true; calls.push("browser"); }, () => { serverClosed = true; calls.push("server"); }] },
      { name: "verification", actions: [() => { calls.push("pins"); throw new Error("pin mismatch"); }] },
      { name: "disposable-files", actions: [async () => { assert.ok(browserClosed && serverClosed); await scratch.close(); calls.push("files"); }] },
    ], reports), error => error instanceof AggregateError && error.errors.length === 2);
    assert.deepEqual(calls, ["observer", "browser", "server", "pins", "files"]);
    assert.deepEqual(reports.map(row => row.status), ["failed", "passed", "failed", "passed"]);
    assert.match(JSON.stringify(reports[0].error), /Native observer response timed out/);
    await assert.rejects(lstat(scratch.directory), { code: "ENOENT" });
  } finally { await scratch.close(); }
});

test("failed process closure cannot authorize profile deletion but does not skip other independent cleanup", async () => {
  const calls = [], reports = []; let browserClosed = false;
  await assert.rejects(finishOwnedCleanupPhases([
    { name: "processes", actions: [() => { throw new Error("browser close failed"); }, () => calls.push("server closed")] },
    { name: "disposable-files", actions: [() => { assert.ok(browserClosed, "Keep profile while browser closure is unverified"); calls.push("profile deleted"); },
      () => calls.push("independent asset removed")] },
  ], reports), error => error instanceof AggregateError && error.errors.length === 2);
  assert.deepEqual(calls, ["server closed", "independent asset removed"]);
  assert.deepEqual(reports.map(row => row.status), ["failed", "failed"]);
  browserClosed = true;
});

test("successful cleanup phases finish in order and reject malformed plans before any action", async () => {
  const calls = [];
  assert.deepEqual(await finishOwnedCleanupPhases([
    { name: "processes", actions: [async () => calls.push("processes")] },
    { name: "disposable-files", actions: [() => calls.push("files")] },
  ]), [{ name: "processes", status: "passed" }, { name: "disposable-files", status: "passed" }]);
  assert.deepEqual(calls, ["processes", "files"]);
  await assert.rejects(finishOwnedCleanupPhases([
    { name: "processes", actions: [() => calls.push("must not run")] },
    { name: "processes", actions: [] },
  ]));
  assert.deepEqual(calls, ["processes", "files"]);
});
