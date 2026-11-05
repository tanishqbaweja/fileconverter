// Mock worker lifecycle/protocol tests; not native conversion acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const compiled = await build({ entryPoints: ["workers/webcodecs-vp9-isolated.ts"], bundle: true, format: "esm", platform: "node", write: false });
const { runIsolatedWebCodecsVp9 } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
function request(overrides = {}) { return { file: new File(["tiny"], "mock.mkv"), output: { kind: "file" }, cancellation: new SharedArrayBuffer(4),
  nativeProfile: 10, video: { codec: "vp9", quality: "automatic", bitRateBps: 600000, maxWidth: 320, frameRateFps: 24 },
  implementation: "automatic", fallbackCore: "single-thread", ...overrides }; }
function result(overrides = {}) { return { type: "complete", elapsedMs: 1, metrics: { activeWorkerCount: 1, outputBytes: 3 },
  warnings: [], encoder: { frames: 48, packets: 48, closed: true }, cleanupComplete: true, writeAttempts: 1, ...overrides }; }
const unsupported = overrides => result({ type: "error", errorName: "NotSupportedError", message: "unsupported exact configuration",
  errorStage: "conversion",
  writeAttempts: 0, encoder: { frames: 0, packets: 0, closed: true, currentPackedBytes: 0, pendingPacketBytes: 0 }, ...overrides });
function workers(answers) {
  const events = [], children = [], requests = [];
  return { events, children, requests, createChild() {
    const index = children.length, child = { onmessage: null, onerror: null, onmessageerror: null,
      postMessage(data) {
        requests.push(data); events.push("post" + index);
        queueMicrotask(() => { const answer = answers[index];
          if (typeof answer === "function") answer(child, data); else child.onmessage?.({ data: answer }); });
      }, terminate() { events.push("terminate" + index); } };
    events.push("create" + index); children.push(child); return child;
  } };
}
test("successful candidate terminates its one child and never loads CPU fallback", async () => {
  const fake = workers([result()]), output = await runIsolatedWebCodecsVp9(request(), fake);
  assert.equal(output.type, "complete"); assert.equal(output.selection.backend, "webcodecs");
  assert.equal(fake.children.length, 1); assert.deepEqual(fake.events, ["create0", "post0", "terminate0"]);
  assert.equal(output.metrics.activeWorkerCount, 2); assert.equal(output.isolation.synchronousTerminationConfirmed, false);
  assert.equal(output.isolation.terminationRequests, 1);
});
test("typed pre-write rejection terminates candidate BEFORE identical-input/settings fresh CPU worker", async () => {
  const input = request(), fake = workers([unsupported(), result({ encoder: null })]);
  const output = await runIsolatedWebCodecsVp9(input, fake);
  assert.equal(output.type, "complete"); assert.equal(output.selection.backend, "wasm");
  assert.equal(output.selection.wasmFallbackCore, "single-thread"); assert.equal(output.encoder.frames, 0);
  assert.deepEqual(fake.events, ["create0", "post0", "terminate0", "create1", "post1", "terminate1"]);
  assert.deepEqual(fake.requests.map(x => x.implementation), ["candidate", "wasm-baseline"]);
  for (const child of fake.requests) {
    for (const key of ["file", "output", "cancellation", "video"]) assert.equal(child[key], input[key]);
    assert.equal(child.nativeProfile, 10); assert.equal(child.fallbackCore, "single-thread"); assert.equal(child.diagnosticCheckpoints, false);
  }
  assert.equal(output.isolation.childrenStarted, 2); assert.equal(output.isolation.terminationRequests, 2);
  assert.equal(output.isolation.maximumOwnedChildHandles, 1); assert.equal(output.isolation.candidateTerminationRequestedBeforeFallback, true);
  assert.ok(fake.children.every(x => !x.onmessage && !x.onerror && !x.onmessageerror));
});
for (const [label, first] of [
  ["write failure even before recorded bytes", unsupported({ writeAttempts: 1 })],
  ["incomplete abort", unsupported({ cleanupComplete: false })],
  ["abort error", unsupported({ cleanupError: "permission lost" })],
  ["corrupt source", unsupported({ errorName: "Error" })],
  ["revoked permission", unsupported({ errorName: "NotAllowedError" })],
  ["cancellation result", unsupported({ errorName: "AbortError" })],
  ["unsupported destination API", unsupported({ errorStage: "destination-open" })],
  ["unsupported output close", unsupported({ errorStage: "output-close" })],
]) test(`isolated route never retries ${label}`, async () => {
  const fake = workers([first]), output = await runIsolatedWebCodecsVp9(request(), fake);
  assert.equal(output.type, "error"); assert.equal(fake.children.length, 1); assert.equal(fake.events.at(-1), "terminate0");
});
test("CPU error is final, never a third attempt", async () => {
  const fake = workers([unsupported(), result({ type: "error", errorName: "Error", errorStage: "conversion", message: "CPU failed" })]);
  const output = await runIsolatedWebCodecsVp9(request(), fake); assert.equal(output.type, "error"); assert.equal(output.message, "CPU failed");
  assert.equal(fake.children.length, 2); assert.equal(output.isolation.terminationRequests, 2);
});
test("cancellation between candidate and fallback terminates candidate and starts no CPU", async () => {
  const input = request(), fake = workers([(child) => { Atomics.store(new Int32Array(input.cancellation), 0, 1); child.onmessage({ data: unsupported() }); }]);
  const output = await runIsolatedWebCodecsVp9(input, fake); assert.equal(output.type, "error"); assert.equal(output.errorName, "AbortError");
  assert.equal(output.cleanupComplete, true); assert.equal(fake.children.length, 1);
  assert.equal(fake.events.at(-1), "terminate0");
});
test("real CPU cancellation result retains write/cleanup evidence and never starts a third worker", async () => {
  const input = request({ qualificationFault: "cancel-after-write" }), fake = workers([unsupported(), (child) => {
    Atomics.store(new Int32Array(input.cancellation), 0, 1);
    child.onmessage({ data: result({ type: "error", errorName: "Error", errorStage: "conversion", message: "native cancellation",
      writeAttempts: 1, qualificationFaultTriggered: true }) });
  }]);
  const output = await runIsolatedWebCodecsVp9(input, fake); assert.equal(output.errorName, "AbortError");
  assert.equal(output.writeAttempts, 1); assert.equal(output.cleanupComplete, true); assert.equal(output.qualificationFaultTriggered, true);
  assert.equal(output.isolation.childrenStarted, 2); assert.equal(output.isolation.terminationRequests, 2);
  assert.deepEqual(fake.requests.map(row => row.qualificationFault), ["cancel-after-write", "cancel-after-write"]);
});
test("already cancelled request starts no workers", async () => {
  const input = request(); Atomics.store(new Int32Array(input.cancellation), 0, 1); const fake = workers([]);
  await assert.rejects(runIsolatedWebCodecsVp9(input, fake), { name: "AbortError" }); assert.equal(fake.children.length, 0);
});
test("progress counts coordinator and child without retaining a progress history", async () => {
  const updates = [], fake = workers([(child) => {
    child.onmessage({ data: { type: "progress", phase: "real native work", metrics: { activeWorkerCount: 1 } } });
    child.onmessage({ data: result() });
  }]);
  const output = await runIsolatedWebCodecsVp9(request(), { ...fake, progress: event => updates.push(event) });
  assert.equal(updates[0].metrics.activeWorkerCount, 2); assert.equal(updates[0].phase, "real native work"); assert.equal(output.progressHistory, undefined);
});
for (const failure of ["error", "messageerror", "deadline", "post"]) test(`isolated ${failure} path terminates its owned worker`, async () => {
  const fake = workers([child => {
    if (failure === "error") child.onerror({ message: "worker crashed" });
    if (failure === "messageerror") child.onmessageerror();
  }]);
  if (failure === "post") {
    const create = fake.createChild; fake.createChild = () => { const child = create(); child.postMessage = () => { throw new Error("clone failed"); }; return child; };
  }
  await assert.rejects(runIsolatedWebCodecsVp9(request(), { ...fake, deadlineMs: 15 }));
  assert.equal(fake.events.at(-1), "terminate0"); assert.ok(fake.children.every(x => !x.onmessage && !x.onerror && !x.onmessageerror));
});
test("invalid terminal metadata cannot trigger CPU fallback", async () => {
  for (const mutation of [{ writeAttempts: undefined }, { writeAttempts: -1 }, { warnings: Array(33).fill("x") }, { type: "complete", cleanupComplete: false }]) {
    const fake = workers([unsupported(mutation)]);
    await assert.rejects(runIsolatedWebCodecsVp9(request(), fake), /Invalid bounded/); assert.equal(fake.children.length, 1);
  }
});
test("unknown settings, diagnostic blocking and unsupported implementation fail before child creation", async () => {
  for (const mutation of [{ fallbackCore: "unknown" }, { diagnosticCheckpoints: true }, { qualificationFault: "unknown" }, { implementation: "candidate" }, { cancellation: new SharedArrayBuffer(8) }]) {
    const fake = workers([]); await assert.rejects(runIsolatedWebCodecsVp9(request(mutation), fake), /Invalid private isolated/);
    assert.equal(fake.children.length, 0);
  }
});
