// Method-name diagnostics only; no real browser/protocol evidence here.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { installProtocolMethodCounts } from "../scripts/lib/protocol-method-counts.mjs";
test("protocol names are counted without retaining parameters, bodies, URLs or source strings and restore exactly", () => {
  const forwarded = [], logger = { isEnabled: () => false, log: (...args) => forwarded.push(args) }, old = { ...logger };
  const observer = installProtocolMethodCounts(logger);
  assert.equal(logger.isEnabled("protocol"), true); assert.equal(logger.isEnabled("api"), false);
  logger.log("protocol", 'SEND ► {"id":1,"method":"Network.getResponseBody","params":{"requestId":"secret-canary"}}');
  logger.log("protocol", '◀ RECV {"id":1,"result":{"body":"secret-canary"}}');
  logger.log("protocol", 'SEND ► {"id":2,"method":"Runtime.evaluate","params":{"expression":"secret-canary"}}');
  logger.log("protocol", 'SEND ► {"id":3,"method":"Network.getResponseBody","params":{"requestId":"secret-canary"}}');
  logger.log("api", "owned-api-event");
  const report = observer.summary(); assert.deepEqual(report.methods, { "Network.getResponseBody": 2, "Runtime.evaluate": 1 });
  assert.equal(report.sends, 3); assert.doesNotMatch(JSON.stringify(report), /secret-canary/); assert.equal(report.responseBodiesRetained, 0);
  assert.deepEqual(forwarded, [["api", "owned-api-event"]]); observer.close(); observer.close();
  assert.equal(logger.log, old.log); assert.equal(logger.isEnabled, old.isEnabled);
});
test("method caps and unavailable names are explicit rather than silently called complete", () => {
  const observer = installProtocolMethodCounts({ isEnabled: () => false, log() {} });
  // Access the logger through an explicit owned fixture, never browser state.
  observer.close();
  const logger = { isEnabled: () => false, log() {} }, actual = installProtocolMethodCounts(logger);
  for (let i = 0; i < 130; i++) logger.log("protocol", `SEND ► {"id":${i},"method":"Domain.method${i}","params":{}}`);
  logger.log("protocol", "SEND malformed");
  assert.equal(Object.keys(actual.summary().methods).length, 128); assert.equal(actual.summary().unavailableMethodNames, 3);
  actual.close();
});
test("actual finite observer rejects explicit body-fetch hypothesis only after complete method-name coverage", async () => {
  const receipt = JSON.parse(await readFile(new URL("../evidence/2026-10-24T07-59-01.635Z-mpeg2-original-result.json", import.meta.url)));
  const counts = receipt.protocolMethodCounts;
  assert.equal(counts.sends, 1090); assert.equal(counts.unavailableMethodNames, 0);
  assert.equal(Object.values(counts.methods).reduce((a, b) => a + b, 0), counts.sends);
  assert.equal(counts.methods["Network.enable"], 3);
  for (const method of ["Network.getResponseBody", "Debugger.getScriptSource", "Debugger.getWasmBytecode"])
    assert.equal(counts.methods[method] ?? 0, 0);
  assert.equal(receipt.overallGatePassed, false); assert.equal(receipt.completedCases.length, 0);
  assert.equal(receipt.nativeAllocationProfile.samples, 19);
  assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
});
