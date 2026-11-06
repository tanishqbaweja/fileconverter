import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createRealmSampler } from "../scripts/lib/cdp-realm-memory.mjs";
const origin = "http://127.0.0.1:3000", worker = { targetId: "worker", type: "worker", url: origin + "/worker.js" };
const tick = () => new Promise(resolve => setImmediate(resolve));
function delayedAttachFixture() {
  let targets = [worker], finish, heaps = 0, closed = 0;
  const detached = [], transport = { close() { closed++; }, async send(method, params) {
    if (method === "Target.getTargets") return { targetInfos: targets };
    if (method === "Target.attachToTarget") return new Promise(resolve => { finish = resolve; });
    if (method === "Target.detachFromTarget") { detached.push(params.sessionId); return {}; }
    assert.equal(method, "Runtime.getHeapUsage"); heaps++; return { usedSize: 123, totalSize: 456 };
  } };
  return { transport, detached, disappear() { targets = []; }, finish() { finish({ sessionId: "late-session" }); },
    get heaps() { return heaps; }, get closed() { return closed; } };
}
test("exact archived sampler reproduces lost late attachment after target retirement; old result is not relabelled repaired", async () => {
  const pin = JSON.parse(await readFile(new URL("../fixtures/source/pre-cdp-lease-lifecycle-2026-11-07.json", import.meta.url)));
  assert.equal(pin.sourceCommit, "3c16d0e0457c2ab7f06a31d91272361ddf19683f");
  const bytes = gunzipSync(Buffer.from(pin.gzipBase64, "base64"), { maxOutputLength: 16384 });
  assert.equal(bytes.length, pin.bytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256);
  const old = await import("data:text/javascript;base64," + bytes.toString("base64")), f = delayedAttachFixture();
  const sampler = old.createRealmSampler(f.transport, origin, 2);
  try {
    assert.equal((await sampler.sample()).targets[0].usedJSHeapBytes, null);
    f.disappear(); assert.deepEqual((await sampler.sample()).targets, []);
    f.finish(); await tick(); assert.deepEqual(f.detached, []); assert.equal(f.heaps, 1);
  } finally { sampler.close(); }
});
test("retired target's late attachment is detached exactly once without issuing a heap command", async () => {
  const f = delayedAttachFixture(), sampler = createRealmSampler(f.transport, origin, 2);
  try {
    assert.equal((await sampler.sample()).targets[0].usedJSHeapBytes, null);
    f.disappear(); assert.deepEqual((await sampler.sample()).targets, []);
    f.finish(); await tick(); assert.deepEqual(f.detached, ["late-session"]); assert.equal(f.heaps, 0);
    assert.equal(sampler.ownershipSummary().leasedEntries, 0);
  } finally { sampler.close(); }
});
test("retired in-flight heap reply is discarded and detach uses the captured session identity", async () => {
  let targets = [worker], finish, attached;
  const detached = [], sampler = createRealmSampler({ close() {}, async send(method, params) {
    if (method === "Target.getTargets") return { targetInfos: targets };
    if (method === "Target.attachToTarget") return { sessionId: "live-session" };
    if (method === "Target.detachFromTarget") { detached.push(params.sessionId); return {}; }
    attached(); return new Promise(resolve => { finish = resolve; });
  } }, origin, 200);
  const entered = new Promise(resolve => { attached = resolve; }), first = sampler.sample();
  try {
    await entered; targets = []; await sampler.sample(); finish({ usedSize: 123, totalSize: 456 });
    const result = await first; assert.equal(result.targets[0].usedJSHeapBytes, null);
    assert.match(result.targets[0].error, /retired/); assert.deepEqual(detached, ["live-session"]);
    assert.equal(sampler.ownershipSummary().leasedEntries, 0);
  } finally { sampler.close(); }
});
test("late attachments after close cannot start heap work, discovery or another close", async () => {
  const f = delayedAttachFixture(), sampler = createRealmSampler(f.transport, origin, 2);
  await sampler.sample(); sampler.close(); sampler.close(); f.finish(); await tick();
  assert.equal(f.heaps, 0); assert.equal(f.closed, 1); assert.deepEqual(f.detached, []);
  assert.deepEqual(await sampler.sample(), { targetsAvailable: false, targets: null });
  assert.equal(sampler.ownershipSummary().leasedEntries, 0); assert.equal(sampler.ownershipSummary().closed, true);
});
test("closing while discovery is pending never creates an attachment when its reply finally arrives", async () => {
  let finish, attachments = 0, discoveries = 0;
  const sampler = createRealmSampler({ close() {}, async send(method) {
    if (method === "Target.getTargets") { discoveries++; return new Promise(resolve => { finish = resolve; }); }
    attachments++; throw new Error("No attachment allowed after close");
  } }, origin, 2);
  const first = sampler.sample(); sampler.close(); finish({ targetInfos: [worker] });
  assert.deepEqual(await first, { targetsAvailable: false, targets: null });
  assert.deepEqual(await sampler.sample(), { targetsAvailable: false, targets: null });
  assert.equal(attachments, 0); assert.equal(discoveries, 1);
});
test("pending retired attachments share the16-lease cap with live targets; timeout/churn never requeues work", async () => {
  let targets = Array.from({ length: 16 }, (_, n) => ({ ...worker, targetId: "old-" + n })), attachments = 0, heaps = 0;
  const replies = [], detached = [], sampler = createRealmSampler({ close() {}, async send(method, params) {
    if (method === "Target.getTargets") return { targetInfos: targets };
    if (method === "Target.attachToTarget") { attachments++; return new Promise(resolve => { replies.push(() => resolve({ sessionId: params.targetId })); }); }
    if (method === "Target.detachFromTarget") { detached.push(params.sessionId); return {}; }
    heaps++; return {};
  } }, origin, 2);
  try {
    await sampler.sample(); assert.equal(attachments, 16);
    targets = Array.from({ length: 16 }, (_, n) => ({ ...worker, targetId: "new-" + n }));
    for (let n = 0; n < 4; n++) {
      const result = await sampler.sample(); assert.equal(result.targets.length, 16);
      assert.ok(result.targets.every(row => row.usedJSHeapBytes === null && /lease cap/.test(row.error)));
    }
    assert.equal(attachments, 16); assert.equal(sampler.ownershipSummary().retiringEntries, 16);
    replies.forEach(finish => finish()); await tick(); assert.equal(detached.length, 16); assert.equal(heaps, 0);
    assert.equal(sampler.ownershipSummary().leasedEntries, 0); assert.equal(sampler.ownershipSummary().peakLeasedEntries, 16);
    assert.equal(sampler.ownershipSummary().queuedRequests, 0);
  } finally { sampler.close(); }
});
test("failed retirement remains counted and unavailable, bounded without detach retries or unbounded replacement sessions", async () => {
  let targets = Array.from({ length: 16 }, (_, n) => ({ ...worker, targetId: "old-" + n })), attachments = 0, detaches = 0;
  const sampler = createRealmSampler({ close() {}, async send(method, params) {
    if (method === "Target.getTargets") return { targetInfos: targets };
    if (method === "Target.attachToTarget") { attachments++; return { sessionId: params.targetId }; }
    if (method === "Target.detachFromTarget") { detaches++; throw new Error("Synthetic detach refusal"); }
    return { usedSize: 1, totalSize: 2 };
  } }, origin, 10);
  try {
    await sampler.sample(); targets = [{ ...worker, targetId: "replacement" }];
    await sampler.sample(); await tick();
    for (let n = 0; n < 3; n++) {
      const result = await sampler.sample(); assert.equal(result.targets[0].usedJSHeapBytes, null);
      assert.match(result.targets[0].error, /lease cap/);
    }
    assert.equal(attachments, 16); assert.equal(detaches, 16);
    const report = sampler.ownershipSummary(); assert.equal(report.leasedEntries, 16); assert.equal(report.retirementFailures, 16);
    assert.match(report.lastRetirementError, /detach refusal/); assert.equal(report.acceptanceMetric, false);
  } finally { sampler.close(); }
});
test("unanswered detach retains its lease until the real reply, then frees capacity on a later scheduled sample", async () => {
  let targets = [worker], finish, detaches = 0;
  const sampler = createRealmSampler({ close() {}, async send(method) {
    if (method === "Target.getTargets") return { targetInfos: targets };
    if (method === "Target.attachToTarget") return { sessionId: "session" };
    if (method === "Target.detachFromTarget") { detaches++; return new Promise(resolve => { finish = resolve; }); }
    return { usedSize: 1, totalSize: 2 };
  } }, origin, 2);
  try {
    await sampler.sample(); targets = []; await sampler.sample(); await tick();
    assert.equal(sampler.ownershipSummary().leasedEntries, 1);
    for (let n = 0; n < 3; n++) await sampler.sample(); assert.equal(detaches, 1);
    finish({}); await tick(); assert.equal(sampler.ownershipSummary().leasedEntries, 0);
  } finally { sampler.close(); }
});
