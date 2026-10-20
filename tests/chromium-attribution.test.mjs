import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { annotateNativeProcessTypes, connectPlaywrightRealmSampler } from "../scripts/lib/chromium-attribution.mjs";

test("native metadata uses PID/parent/birth microseconds, never guesses or changes totals/unavailable values", () => {
  const process = { pid: 20, parentPid: 10, createdAt: "2026-10-20T19:10:30.1234567Z", type: "unknown", privateBytes: 200, rssBytes: 300 };
  const samples = [{ privateBytes: 300, rssBytes: 500, processes: [{ ...process, pid: 10, type: "browser" }, { ...process }] },
    { privateBytes: null, rssBytes: null, processes: null }];
  const original = structuredClone(samples), ref = { tree: { processes: [{ ...process, createdAt: "2026-10-20T19:10:30.1234560Z", type: "gpu-process" }] } };
  annotateNativeProcessTypes(samples, [ref], 10);
  assert.equal(samples[0].processes[1].type, "gpu-process"); assert.equal(samples[0].processes[0].type, "browser");
  samples[0].processes[1] = { ...samples[0].processes[1], type: "unknown" }; delete samples[0].processes[1].utilitySubtype; delete samples[0].processes[1].sandboxType;
  assert.deepEqual(samples, original);
  for (const change of [p => { p.createdAt = "2026-10-20T19:10:30.1234570Z"; }, p => { p.parentPid = 99; },
    p => { p.type = "browser"; }, p => { p.createdAt = null; }]) {
    const changed = structuredClone(ref); change(changed.tree.processes[0]);
    const actual = annotateNativeProcessTypes(structuredClone(original), [changed], 10);
    assert.deepEqual(actual, original);
  }
});

class Session extends EventEmitter {
  requests = []; detached = false;
  async send(method, params) {
    this.requests.push({ method, params });
    if (method === "Target.getTargets") return { targetInfos: [
      { targetId: "page", type: "page", url: "http://localhost/" },
      { targetId: "worker", type: "worker", url: "http://localhost/worker.js" },
    ] };
    if (method === "Target.attachToTarget") { assert.equal(params.flatten, false); return { sessionId: params.targetId }; }
    if (method === "Target.sendMessageToTarget") {
      const request = JSON.parse(params.message); assert.equal(request.method, "Runtime.getHeapUsage");
      queueMicrotask(() => this.emit("Target.receivedMessageFromTarget", { sessionId: params.sessionId,
        message: JSON.stringify({ id: request.id, result: { usedSize: 1, totalSize: 2, backingStorageSize: 3 } }) }));
      return {};
    }
    if (method === "Target.detachFromTarget") return {};
    throw new Error(method);
  }
  async detach() { this.detached = true; }
}

test("real CDP routing observes both page and worker heaps without evaluating code and releases listeners", async () => {
  const session = new Session(), sampler = await connectPlaywrightRealmSampler({ newBrowserCDPSession: async () => session }, "http://localhost");
  const sample = await sampler.sample(); assert.equal(sample.targetsAvailable, true); assert.equal(sample.targets.length, 2);
  for (const realm of sample.targets) { assert.equal(realm.usedJSHeapBytes, 1); assert.equal(realm.allocatedJSHeapBytes, 2); assert.equal(realm.backingStorageBytes, 3); assert.equal(realm.embedderHeapUsedBytes, null); }
  sampler.close(); assert.equal(session.detached, true); assert.equal(session.listenerCount("Target.receivedMessageFromTarget"), 0);
  assert.equal(session.requests.some(r => /evaluate|garbage|collect/i.test(r.method)), false);
});

test("missing or detached realm replies stay null/unavailable with bounded requests rather than fabricated zero", async () => {
  const session = new Session(), send = session.send.bind(session);
  session.send = async (method, params) => method === "Target.sendMessageToTarget" ? {} : send(method, params);
  const sampler = await connectPlaywrightRealmSampler({ newBrowserCDPSession: async () => session }, "http://localhost", 5);
  for (let i = 0; i < 4; i++) {
    const result = await sampler.sample(); assert.equal(result.targets.length, 2);
    assert.ok(result.targets.every(t => t.usedJSHeapBytes === null && t.error));
  }
  assert.equal(session.requests.filter(r => r.method === "Target.attachToTarget").length, 2);
  session.emit("Target.detachedFromTarget", { sessionId: "worker" });
  sampler.close(); assert.equal(session.detached, true);
});

test("actual smoke labels native snapshots by acquisition time, not a later drain's current phase", async () => {
  const source = await readFile("scripts/test-mpeg2-production-runtime.mjs", "utf8");
  const tree = ts.createSourceFile("smoke.mjs", source, ts.ScriptTarget.Latest, true);
  let initializer;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "snapshot") initializer = node.initializer.getText(tree); ts.forEachChild(node, visit); };
  visit(tree); assert.ok(initializer);
  const at = Date.parse("2026-10-20T00:00:00.000Z"), samples = [];
  const input = [500, 1500, 2500].map(ms => ({ timestamp: new Date(at + ms).toISOString(), privateBytes: 300, rssBytes: 500 }));
  const snapshot = runInNewContext("(" + initializer + ")", { assert, samples, monitor: { drain: async () => ({ samples: input }) },
    phaseChanges: [{ phase: "blank", at }, { phase: "loaded", at: at + 1000 }, { phase: "conversion", at: at + 2000 }],
    report: { startedAt: new Date(at).toISOString() } });
  await snapshot(); assert.deepEqual(samples.map(s => s.phase), ["blank", "loaded", "conversion"]);
  assert.deepEqual(samples.map(s => s.privateBytes), [300, 300, 300]);
  assert.ok(source.indexOf("await monitor.close(); monitor = null;") < source.indexOf("report.postMeasurementAllocators = await captureLiveMemoryInfra"));
  assert.ok(source.indexOf("report.executedSourcesAndBrowserPinsVerified = true") < source.indexOf("assert.ok(report.memory.incrementalPrivateMiB <= 250)"));
});
