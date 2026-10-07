import assert from "node:assert/strict";
import test from "node:test";
import { createIndependentBlinkSessions } from "../scripts/lib/independent-blink-sessions.mjs";
test("single-session tracing drains and detaches before admitting another, including stop while pending", async () => {
  const events = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const helper = createIndependentBlinkSessions({ realms: {},
    createSession: async () => ({ detach: async () => { events.push("detach"); } }),
    startAttribution: async () => ({ dump: async () => { events.push("dump"); await gate; return { success: true, dumpGuid: "0x1" }; },
      stop: async () => { events.push("drain"); return { status: "completed-diagnostic", dumps: [], allocatorSummary: [] }; } }) });
  const requested = helper.dump("conversion-native", []);
  await assert.rejects(helper.dump("no-queue"), /concurrent/);
  const stopped = helper.stop(); await assert.rejects(helper.dump("closing"), /closing/);
  release(); assert.equal((await requested).success, true);
  const report = await stopped; assert.equal(report.status, "completed-diagnostic");
  assert.deepEqual(events, ["dump", "drain", "detach"]); assert.equal(report.maximumPendingSessions, 1);
});
test("failed dump/drain is retained and detached; independently closed sessions are capped at seven", async () => {
  let count = 0;
  const helper = createIndependentBlinkSessions({ realms: {},
    createSession: async () => ({ detach: async () => {} }),
    startAttribution: async () => ({ dump: async () => { count++; if (count === 1) throw new Error("unavailable"); return { success: true, dumpGuid: String(count) }; },
      stop: async () => ({ status: "completed-diagnostic", dumps: [], allocatorSummary: [] }) }) });
  assert.equal((await helper.dump("first")).success, false);
  for (let i = 1; i < 7; i++) assert.equal((await helper.dump(`next-${i}`)).success, true);
  await assert.rejects(helper.dump("overflow"), /session cap/);
  const report = await helper.stop(); assert.equal(report.status, "failed-diagnostic");
  assert.equal(report.sessions.length, 7); assert.match(report.sessions[0].error, /unavailable/);
  assert.ok(report.sessions.every(row => row.sessionDetached));
});
test("failed trace completeness is not a successful dump callback", async () => {
  const helper = createIndependentBlinkSessions({ realms: {}, createSession: async () => ({ detach: async () => {} }),
    startAttribution: async () => ({ dump: async () => ({ success: true, dumpGuid: "0x2" }),
      stop: async () => ({ status: "failed-diagnostic", trace: { dataLossOccurred: true }, dumps: [], allocatorSummary: [] }) }) });
  assert.equal((await helper.dump("lost-trace")).success, false);
  assert.equal((await helper.stop()).sessions[0].trace.trace.dataLossOccurred, true);
});
