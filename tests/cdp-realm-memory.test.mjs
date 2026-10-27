import assert from "node:assert/strict";
import test from "node:test";
import { createRealmSampler, normalizeHeapUsage } from "../scripts/lib/cdp-realm-memory.mjs";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

test("archived executed sampler reproduces sticky dead-session cache instead of pretending an old unavailable sample recovered", async () => {
  const archive = JSON.parse(await readFile(new URL("../fixtures/source/svg-snapshot-dc9dbff6.json", import.meta.url)));
  const row = archive.files["scripts/lib/cdp-realm-memory.mjs"], bytes = gunzipSync(Buffer.from(row.gzipBase64, "base64"), { maxOutputLength: 16384 });
  assert.equal(bytes.length, row.bytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256);
  const old = await import("data:text/javascript;base64," + bytes.toString("base64"));
  let attachments = 0;
  const sampler = old.createRealmSampler({ close() {}, async send(method) {
    if (method === "Target.getTargets") return { targetInfos: [{ targetId: "worker", type: "worker", url: "http://127.0.0.1:3000/worker.js" }] };
    if (method === "Target.attachToTarget") { attachments++; return { sessionId: "expired" }; }
    throw new Error("Session with given id not found.");
  } }, "http://127.0.0.1:3000", 20);
  assert.equal((await sampler.sample()).targets[0].usedJSHeapBytes, null);
  assert.equal((await sampler.sample()).targets[0].usedJSHeapBytes, null);
  assert.equal(attachments, 1, "Historical dead session was reused forever; the current repair is separately tested"); sampler.close();
});

test("CDP heap diagnostics retain unavailable fields as null, separate from OS memory", () => {
  assert.deepEqual(normalizeHeapUsage({ usedSize: 12, totalSize: 34, backingStorageSize: 56 }), {
    usedJSHeapBytes: 12, allocatedJSHeapBytes: 34, embedderHeapUsedBytes: null, backingStorageBytes: 56,
  });
  assert.equal(normalizeHeapUsage({ usedSize: NaN }).usedJSHeapBytes, null);
  assert.equal(normalizeHeapUsage({ usedSize: -1 }).usedJSHeapBytes, null);
});
test("busy worker heap queries remain single-flight across observation timeouts", async () => {
  let queries = 0, finish;
  const target = { targetId: "worker", type: "worker", url: "http://127.0.0.1:3000/assets/worker.js" };
  const transport = { close() {}, async send(method) {
    if (method === "Target.getTargets") return { targetInfos: [target, { ...target, targetId: "extension", url: "chrome-extension://other/background.js" }] };
    if (method === "Target.attachToTarget") return { sessionId: "session" };
    queries++;
    return new Promise((resolve) => { finish = resolve; });
  } };
  const sampler = createRealmSampler(transport, "http://127.0.0.1:3000", 5);
  const first = await sampler.sample(), second = await sampler.sample();
  assert.equal(first.targets.length, 1);
  assert.equal(first.targets[0].usedJSHeapBytes, null);
  assert.equal(second.targets[0].usedJSHeapBytes, null);
  assert.equal(queries, 1);
  finish({ usedSize: 123, totalSize: 456 });
  await new Promise((resolve) => setImmediate(resolve));
  sampler.close();
});
for (const message of ["Session with given id not found.", "cdpSession.send: Protocol error (Target.sendMessageToTarget): No session with given id", "Realm target detached"])
  test(`completed stale-session error stays null, then retries one fresh worker session: ${message}`, async () => {
    let attachments = 0, queries = 0;
    const worker = { targetId: "worker", type: "worker", url: "http://127.0.0.1:3000/assets/worker.js" };
    const sampler = createRealmSampler({ close() {}, async send(method, params, sessionId) {
      if (method === "Target.getTargets") return { targetInfos: [worker] };
      if (method === "Target.attachToTarget") return { sessionId: "session-" + ++attachments };
      assert.equal(method, "Runtime.getHeapUsage"); queries++;
      if (sessionId === "session-1") throw new Error(message);
      assert.equal(sessionId, "session-2"); return { usedSize: 123, totalSize: 456 };
    } }, "http://127.0.0.1:3000", 20);
    const first = await sampler.sample(); assert.equal(first.targets[0].usedJSHeapBytes, null);
    assert.ok(first.targets[0].error.includes(message)); assert.equal(attachments, 1); assert.equal(queries, 1);
    const next = await sampler.sample(); assert.equal(next.targets[0].usedJSHeapBytes, 123);
    assert.equal(next.targets[0].allocatedJSHeapBytes, 456); assert.equal(next.targets[0].error, null);
    assert.equal(attachments, 2); assert.equal(queries, 2); sampler.close();
  });
test("ordinary unsupported heap replies stay unavailable without gratuitous reattachment", async () => {
  let attachments = 0;
  const sampler = createRealmSampler({ close() {}, async send(method) {
    if (method === "Target.getTargets") return { targetInfos: [{ targetId: "page", type: "page", url: "about:blank" }] };
    if (method === "Target.attachToTarget") { attachments++; return { sessionId: "alive" }; }
    throw new Error("Heap usage unavailable in this realm");
  } }, "http://127.0.0.1:3000", 20);
  assert.equal((await sampler.sample()).targets[0].usedJSHeapBytes, null);
  assert.equal((await sampler.sample()).targets[0].usedJSHeapBytes, null);
  assert.equal(attachments, 1); sampler.close();
});
