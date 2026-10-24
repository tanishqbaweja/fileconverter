import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
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
    logger("send", { method: "Network.getResponseBody", params: { requestId: "canary" } });
    logger("send", { method: "Network.disable" });
    assert.equal(observer.summary().bodyRequestsMade, 1); assert.equal(observer.summary().networkDisabled, true);
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
test("persistent launch hook preserves all five launch arguments and exact prototype identity on close", () => {
  const prototype = { _innerLaunchWithRetries(progress, options, persistent, logger, directory) {
    assert.equal(directory, "owned-profile"); assert.deepEqual(persistent, { serviceWorkers: "block" });
    const message = { method: "Network.enable", params: {} }; logger("send", message); return message;
  } }, descriptor = Object.getOwnPropertyDescriptor(prototype, "_innerLaunchWithRetries");
  const child = Object.create(prototype), observer = installBoundedNetworkObserver(child, "_innerLaunchWithRetries");
  try { assert.deepEqual(child._innerLaunchWithRetries({}, {}, { serviceWorkers: "block" }, undefined, "owned-profile").params, NETWORK_OBSERVER_LIMITS); }
  finally { observer.close(); }
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, "_innerLaunchWithRetries"), descriptor);
  assert.equal(Object.hasOwn(child, "_innerLaunchWithRetries"), false);
});
test("installed Playwright preserves protocol callback before transport send and forwards the launch callback", async () => {
  const source = await readFile(new URL("../node_modules/playwright-core/lib/coreBundle.js", import.meta.url), "utf8");
  assert.match(source, /this\._protocolLogger\("send", message\);\s+this\._transport\.send\(message\);/);
  assert.match(source, /launch\(progress2, launchOptions, toProtocolLogger\(options\.logger\)\)/);
  assert.match(source, /helper\.debugProtocolLogger\(protocolLogger\)/);
  const harness = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(harness, /!flags\.has\("--bounded-network-observer"\) \|\| fullOriginal/);
  assert.match(harness, /diagnosticOnly: nativeProfile/);
  assert.match(harness, /networkEnables >= 3/);
});
test("actual bounded inspector run loses both Base64-sized samples, not raw code, and is not full-file acceptance", async () => {
  const root = new URL("../", import.meta.url), sha = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T08-08-38.405Z-mpeg2-original-result.json", root)));
  const archive = receipt.nativeAllocationArchive, packed = await readFile(new URL(archive.path, root));
  assert.equal(sha(packed), archive.sha256); const bytes = gunzipSync(packed); assert.equal(sha(bytes), archive.restoredSha256);
  const p = JSON.parse(bytes).profile;
  assert.equal(p.samples.length, 16);
  for (const size of [5716027, 675411]) assert.ok(p.samples.some(s => s.size === size));
  for (const size of [7621384, 900560]) assert.ok(!p.samples.some(s => s.size === size));
  assert.equal(receipt.boundedNetworkObserver.launches, 1); assert.equal(receipt.boundedNetworkObserver.networkEnables, 3);
  assert.equal(receipt.protocolMethodCounts.methods["Network.enable"], 3);
  assert.equal(receipt.protocolMethodCounts.unavailableMethodNames, 0);
  assert.equal(receipt.boundedNetworkObserver.vendorFilesModified, false);
  assert.equal(receipt.boundedNetworkObserver.networkDisabled, false);
  assert.equal(receipt.overallGatePassed, false); assert.equal(receipt.completedCases.length, 0);
  assert.equal(receipt.nativeProfileDiagnosticOnly, true); assert.equal(receipt.nativeProfileFiniteStop.cancellation.requested, true);
  assert.equal(receipt.memory.incrementalPrivateMiB, 247.5703125);
  assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
});
test("subsequent unprofiled original failure remains failed with full native peak and live privacy events", async () => {
  const root = new URL("../", import.meta.url), sha = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T08-14-29.695Z-mpeg2-original-result.json", root)));
  const packed = await readFile(new URL(receipt.archive.path, root)); assert.equal(sha(packed), receipt.archive.sha256);
  const bytes = gunzipSync(packed); assert.equal(sha(bytes), receipt.archive.restoredSha256); const r = JSON.parse(bytes);
  const journal = await readFile(new URL("output/playwright/2026-10-24T08-14-29.695Z-mpeg2-original-memory.ndjson.gz", root));
  assert.equal(sha(journal), receipt.losslessMemoryJournal.archiveSha256);
  const records = gunzipSync(journal); assert.equal(sha(records), receipt.losslessMemoryJournal.sha256);
  const samples = records.toString().trim().split("\n").map(row => JSON.parse(row).sample);
  assert.equal(samples.length, 911); assert.ok(samples.every((s, i) => s.sequence === i + 1 && s.privateBytes !== null));
  for (const s of samples) assert.equal(s.privateBytes, s.processes.reduce((n, p) => n + p.privateBytes, 0));
  const peak = samples.filter(s => s.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
  assert.equal(peak.sequence, 906); assert.equal((peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, 301.6640625);
  assert.equal(receipt.memory.incrementalPrivateMiB, 301.6640625); assert.equal(receipt.memory.unavailableSampleCount, 0);
  assert.equal(receipt.nativeAllocationProfile, null); assert.equal(receipt.nativeProfileDiagnosticOnly, false);
  assert.equal(receipt.boundedNetworkObserverBinding.diagnosticOnly, false);
  assert.equal(receipt.boundedNetworkObserver.networkEnables, 3); assert.equal(receipt.boundedNetworkObserver.networkDisables, 0);
  assert.equal(receipt.boundedNetworkObserver.bodyRequestsMade, 0);
  assert.equal(receipt.networkObservation.requestsObserved, 17); assert.deepEqual(receipt.networkObservation.forbiddenRequests, []);
  assert.equal(receipt.networkObservation.sameOriginGetOnly, true);
  assert.equal(r.earlyMemoryFailure.cancellation.requested, true); assert.ok(r.earlyMemoryFailure.cancellation.outputBytes > 32 * 1000000);
  assert.equal(receipt.completedCases.length, 0); assert.equal(receipt.overallGatePassed, false);
  assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
});
