// Node-side diagnostic only. Count method names; never retain protocol params,
// response bodies, file data, URLs, source strings or incoming payloads.
import assert from "node:assert/strict";
export function installProtocolMethodCounts(logger) {
  assert.equal(typeof logger?.log, "function"); assert.equal(typeof logger?.isEnabled, "function");
  const oldLog = logger.log, oldEnabled = logger.isEnabled, methods = new Map();
  let sends = 0, unavailableMethodNames = 0, closed = false;
  const enabled = function(name) { return name === "protocol" || oldEnabled.call(logger, name); };
  const log = function(name, message) {
    if (name !== "protocol") return oldLog.call(logger, name, message);
    if (typeof message !== "string" || !message.startsWith("SEND ")) return;
    sends++;
    const match = /"method":"([A-Za-z0-9_.]{1,96})"/.exec(message.slice(0, 256));
    if (!match) { unavailableMethodNames++; return; }
    if (!methods.has(match[1]) && methods.size >= 128) { unavailableMethodNames++; return; }
    methods.set(match[1], (methods.get(match[1]) ?? 0) + 1);
  };
  logger.isEnabled = enabled; logger.log = log;
  return {
    summary: () => ({ scope: "Node-side owned Playwright/CDP method names only; not browser memory acceptance", sends,
      methods: Object.fromEntries(methods), unavailableMethodNames, maximumMethodNames: 128,
      requestParamsRetained: 0, responseBodiesRetained: 0, incomingPayloadsRetained: 0, perturbsNodeRuntime: true, acceptanceMetric: false }),
    close() {
      if (closed) return; closed = true;
      assert.equal(logger.log, log); assert.equal(logger.isEnabled, enabled);
      logger.log = oldLog; logger.isEnabled = oldEnabled;
    },
  };
}
