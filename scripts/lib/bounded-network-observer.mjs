// Limit automation-only CDP response-body retention, not website/network data.
// This uses the source-pinned owned Playwright server launch callback BEFORE
// CRConnection sends a message. No vendor file, browser flag or app is changed.
import assert from "node:assert/strict";
export const NETWORK_OBSERVER_LIMITS = Object.freeze({ maxTotalBufferSize: 1048576, maxResourceBufferSize: 131072 });
export function installBoundedNetworkObserver(launchPrototype) {
  const descriptor = Object.getOwnPropertyDescriptor(launchPrototype, "launch");
  assert.equal(typeof descriptor?.value, "function", "Expected pinned owned Chromium launch method");
  const original = descriptor.value;
  let launches = 0, enables = 0, disables = 0, bodyRequests = 0, closed = false;
  const hook = function(progress, options, protocolLogger) {
    assert.equal(++launches, 1, "This observer owns exactly one browser launch");
    return original.call(this, progress, options, (direction, message) => {
      if (direction === "send" && message.method === "Network.disable") disables++;
      if (direction === "send" && ["Network.getResponseBody", "Debugger.getScriptSource", "Debugger.getWasmBytecode"].includes(message.method)) bodyRequests++;
      if (direction === "send" && message.method === "Network.enable") {
        assert.ok(!closed, "Network observer closed while owned browser is live");
        assert.ok(++enables <= 32, "Network target bound exceeded");
        message.params = { ...message.params, ...NETWORK_OBSERVER_LIMITS };
      }
      protocolLogger?.(direction, message);
    });
  };
  Object.defineProperty(launchPrototype, "launch", { ...descriptor, value: hook });
  return {
    summary: () => ({ scope: "automation-only response-body buffer limits; request/response events remain enabled",
      launches, networkEnables: enables, limits: NETWORK_OBSERVER_LIMITS, vendorFilesModified: false,
      browserFlagsChanged: false, networkDisabled: disables > 0, networkDisables: disables,
      bodyRequestsMade: bodyRequests, acceptanceMetric: false }),
    close() {
      if (closed) return;
      assert.equal(launchPrototype.launch, hook, "Owned launch hook unexpectedly replaced");
      Object.defineProperty(launchPrototype, "launch", descriptor); closed = true;
    },
  };
}
