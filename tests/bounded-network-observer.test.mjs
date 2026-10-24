import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installBoundedNetworkObserver, NETWORK_OBSERVER_LIMITS } from "../scripts/lib/bounded-network-observer.mjs";
test("only outgoing Network.enable gains bounded body limits; metadata events and other commands are untouched", () => {
  const seen = [], forwarded = [], prototype = { launch(progress, options, logger) { seen.push({ self: this, progress, options }); return logger; } };
  const original = Object.getOwnPropertyDescriptor(prototype, "launch"), observer = installBoundedNetworkObserver(prototype);
  try {
    const instance = Object.create(prototype), options = { headless: true }, progress = {};
    const logger = instance.launch(progress, options, (...args) => forwarded.push(args));
    assert.deepEqual(seen, [{ self: instance, progress, options }]);
    const enable = { id: 1, sessionId: "worker", method: "Network.enable", params: { maxPostDataSize: 123 } };
    logger("send", enable);
    assert.deepEqual(enable.params, { maxPostDataSize: 123, ...NETWORK_OBSERVER_LIMITS });
    for (const message of [{ method: "Runtime.evaluate", params: { expression: "canary" } },
      { method: "Network.requestWillBeSent", params: { request: { url: "canary" } } }]) {
      const before = structuredClone(message); logger("receive", message); assert.deepEqual(message, before);
      logger("send", message); assert.deepEqual(message, before);
    }
    assert.equal(forwarded.length, 5); assert.equal(observer.summary().networkEnables, 1);
    assert.doesNotMatch(JSON.stringify(observer.summary()), /canary/);
    assert.throws(() => instance.launch({}, {}), /exactly one/);
  } finally { observer.close(); observer.close(); }
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, "launch"), original);
});
test("invalid launch surfaces are rejected, and network target cap fails explicitly", () => {
  assert.throws(() => installBoundedNetworkObserver({}));
  const prototype = { launch(p, o, log) { return log; } }, observer = installBoundedNetworkObserver(prototype);
  try {
    const log = prototype.launch({}, {});
    for (let i = 0; i < 32; i++) log("send", { method: "Network.enable" });
    assert.throws(() => log("send", { method: "Network.enable" }), /target bound/);
  } finally { observer.close(); }
});
test("installed Playwright preserves protocol callback before transport send and forwards the launch callback", async () => {
  const source = await readFile(new URL("../node_modules/playwright-core/lib/coreBundle.js", import.meta.url), "utf8");
  assert.match(source, /this\._protocolLogger\("send", message\);\s+this\._transport\.send\(message\);/);
  assert.match(source, /launch\(progress2, launchOptions, toProtocolLogger\(options\.logger\)\)/);
  assert.match(source, /helper\.debugProtocolLogger\(protocolLogger\)/);
  const harness = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(harness, /!flags\.has\("--bounded-network-observer"\) \|\| nativeProfile/);
});
