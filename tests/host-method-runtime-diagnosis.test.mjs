import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const json = async file => JSON.parse(await readFile(file, "utf8"));
const report = stamp => json(`evidence/${stamp}-host-method-runtime.json`);
const alternating = [405, 500, 405, 500, 405, 500, 405, 500, 405];
const sha = value => createHash("sha256").update(value).digest("hex");
const assertScoped = value => {
  assert.equal(value.browserLaunched, false); assert.equal(value.userFilesRead, false);
  assert.equal(value.conversionAcceptance, false); assert.equal(value.publicPromotion, false);
  assert.equal(value.ownedRuntimeRemoved, true);
  for (const row of value.controls) assert.equal(row.cleanup.status, "owned-identity-absent");
};

test("hosted CI is terminal success, not Windows/stress/native or full-goal acceptance", async () => {
  const value = await json("evidence/2026-10-26-compatible-tooling-ci-result.json");
  assert.equal(value.runId, 40355630340); assert.equal(value.executedHead, "fe97640c1798d288c9a1cd384cdfe75dc40dd019");
  assert.equal(value.status, "completed"); assert.equal(value.conclusion, "success");
  assert.deepEqual(value.portableUnits, { total: 1768, passed: 1767, failed: 0, skipped: 1 });
  assert.deepEqual(value.networkPrivacyOfflineBrowser, { passed: 19, durationSeconds: 42.6 });
  for (const key of ["windowsLocalCompletePrivacyAccepted", "nativeReproductionExecuted", "privateStressExecuted", "publicPromotion", "originalScopeComplete", "duplicateDispatchUsed"])
    assert.equal(value[key], false);
});

test("first comparison preserves the production failure and does not infer async alone from bundled controls", async () => {
  const first = await report("2026-10-26T16-21-24-109Z"), async = await report("2026-10-26T16-26-52-490Z");
  assertScoped(first); assertScoped(async);
  assert.equal(first.status, "failed-diagnosis"); assert.equal(first.controls.length, 3);
  assert.deepEqual(first.controls[0].cases.map(row => row.status), alternating);
  assert.equal(first.controls[0].healthAfter.status, 500);
  for (const row of [...first.controls.slice(1), ...async.controls]) {
    assert.equal(row.cases.length, 9); assert.equal(row.healthAfter.status, 200);
    assert.ok(row.cases.every(value => value.status === 405 && value.bodyUsed === "false"));
  }
  assert.equal(async.status, "completed-http-diagnosis-not-acceptance");
});

test("invalid watcher-loop control has zero observations, retained failure and exact owned-scratch cleanup proof", async () => {
  const invalid = await report("2026-10-26T16-42-06-029Z");
  const cleanup = await json("evidence/2026-10-26T16-50-32-682Z-host-method-scratch-cleanup.json");
  assert.equal(invalid.status, "failed-diagnosis"); assert.equal(invalid.controls.length, 1);
  assert.equal(invalid.controls[0].cases.length, 0); assert.notEqual(invalid.ownedRuntimeRemoved, true);
  assert.equal(cleanup.removed, true); assert.equal(cleanup.noLiveReferences, true);
  assert.ok(cleanup.directory.endsWith("method-runtime-cEMWRl"));
  assert.equal(cleanup.bytes, 3140861); assert.equal(cleanup.files.length, 9);
  assert.equal(cleanup.files.reduce((total, file) => total + file.bytes, 0), cleanup.bytes);
  assert.ok(cleanup.processObservations.every(row => row.current === null));
});

test("identical async fixture without SDK bundling reproduces failure with and without assets", async () => {
  const bundled = await report("2026-10-26T16-26-52-490Z"), raw = await report("2026-10-26T16-54-15-115Z");
  assertScoped(raw); assert.equal(raw.probeSha256, bundled.probeSha256);
  assert.equal(raw.status, "failed-diagnosis"); assert.equal(raw.controls.length, 2);
  assert.deepEqual(raw.controls.map(row => row.config.assets), [false, true]);
  for (const row of raw.controls) {
    assert.equal(row.config.noBundle, true); assert.deepEqual(row.cases.map(value => value.status), alternating);
    assert.equal(row.healthAfter.status, 500); assert.deepEqual(row.failures, []);
  }
});

test("SDK-drain-disabled and explicit-cancel controls remain failed; no app workaround was adopted", async () => {
  const value = await report("2026-10-26T16-59-01-904Z"); assertScoped(value);
  assert.equal(value.status, "failed-diagnosis"); assert.equal(value.controls.length, 4);
  for (const row of value.controls) {
    assert.deepEqual(row.cases.map(entry => entry.status), alternating); assert.equal(row.healthAfter.status, 500);
  }
  assert.ok(value.controls.slice(0, 2).every(row => row.config.sdkBodyDrainDisabled === true));
  assert.ok(value.controls.slice(2).every(row => row.cases.filter(entry => entry.requestBytes > 0 && entry.status === 405)
    .every(entry => entry.bodyCancelled === "true" && entry.bodyUsed === "true")));
  const worker = await readFile("worker/index.ts", "utf8");
  assert.doesNotMatch(worker, /request\.body|request\.(?:text|json|arrayBuffer|formData)\(/);
});

test("direct ingress serves identical production bytes and rejects all nine requests without body middleware", async () => {
  const first = await report("2026-10-26T16-21-24-109Z"), value = await report("2026-10-27T10-03-39-662Z");
  assertScoped(value); assert.equal(value.status, "completed-http-diagnosis-not-acceptance");
  assert.equal(value.controls.length, 1); const row = value.controls[0], runtime = row.directRuntime;
  assert.equal(runtime.modules.find(module => module.name === "index.js").sha256, first.sourcePins["dist/server/index.js"]);
  assert.equal(runtime.modules.length, 12); assert.equal(runtime.workerdVersion, "1.20260515.1");
  assert.equal(runtime.exactBuiltWorker, true); assert.equal(runtime.incomingBodyMiddleware, false);
  assert.equal(runtime.assetService.nonReadRequests, 0); assert.equal(runtime.assetServiceClosed, true);
  assert.equal(row.cases.length, 9); assert.equal(row.healthAfter.status, 200); assert.equal(row.html.status, 200);
  for (const entry of row.cases) {
    assert.equal(entry.status, 405); assert.equal(entry.allow, "GET, HEAD"); assert.equal(entry.responseBytes, 0);
    assert.equal(entry.coop, "same-origin"); assert.equal(entry.coep, "require-corp");
  }
  assert.equal(row.assetPreflight.length, 6); assert.ok(row.assetPreflight.every(asset => asset.status === 200));
  assert.equal(row.optimizerPreflight.length, 4); assert.ok(row.optimizerPreflight.every(entry => entry.status === 404 && entry.responseBytes === 0));
});

test("retained diagnostic driver sources match pins; raw controls isolate watch roots and have absolute deadlines", async () => {
  for (const stamp of ["2026-10-26T16-54-15-115Z", "2026-10-26T16-59-01-904Z", "2026-10-27T10-03-39-662Z"]) {
    const value = await report(stamp);
    assert.equal(sha(value.driverSource), value.sourcePins["scripts/diagnose-host-method-runtime.mjs"]);
    assert.match(value.driverSource, /"probe-source"/); assert.equal(value.probeRelativePath, "probe-source/probe.mjs");
    assert.match(value.driverSource, /HTTP absolute diagnostic deadline/); assert.match(value.driverSource, /startupDeadline = Date.now\(\) \+ 30000/);
    assert.match(value.driverSource, /windowsHide: true/); assert.match(value.driverSource, /queryReliableProcessIdentity\(child.pid\), identity/);
  }
});

test("direct-host adapter is static-only, bounded, loopback-bound, birth-checked, and does not replace app body handling", async () => {
  const source = await readFile("scripts/lib/direct-workerd-host.mjs", "utf8");
  assert.match(source, /dist\/client/); assert.match(source, /req.method !== "GET" && req.method !== "HEAD"/);
  assert.match(source, /highWaterMark: 65536/); assert.match(source, /await pipeline\(createReadStream/);
  assert.match(source, /await realpath\(file\) !== file/); assert.match(source, /info.isSymbolicLink\(\)/);
  assert.match(source, /windowsHide: true/); assert.match(source, /queryReliableProcessIdentity\(child.pid\), identity/);
  assert.match(source, /assetServer.listen\(0, "127.0.0.1"/); assert.match(source, /service = "app"/);
  assert.doesNotMatch(source, /req\.on\("data"|req\.body|readFile\(file\)|ffmpeg|headless: false|cmd\.exe/);
});

test("Windows complete existing browser suite passes only on the explicitly identified direct-runtime path", async () => {
  const value = await json("evidence/2026-10-27T10-04-13-785Z-owned-privacy-offline.json");
  assert.equal(value.status, "passed-complete-headless-privacy-offline-hosting-specs");
  assert.equal(value.hostingRuntime, "direct-workerd-same-built-worker-loopback-static-assets");
  assert.equal(value.stats.expected, 19); assert.equal(value.stats.unexpected, 0);
  assert.equal(value.stats.skipped, 0); assert.equal(value.stats.flaky, 0);
  assert.equal(value.headedCoverage, false); assert.equal(value.conversionMemoryAcceptance, false); assert.equal(value.publicPromotion, false);
  assert.equal(value.ownedRuntimeRemoved, true); assert.ok(value.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(value.directRuntime.assetServiceClosed, true); assert.equal(value.directRuntime.assetService.nonReadRequests, 0);
  assert.equal(value.directRuntime.incomingBodyMiddleware, false);
  assert.deepEqual(value.protectedOriginalBefore, value.protectedOriginalAfter);
  assert.equal(value.protectedOriginalAfter.bytes, 2958573265);
  assert.equal(value.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(value.assetPreflight.length, 6); assert.ok(value.assetPreflight.every(row => row.status === 200));
  assert.equal(value.methodPreflight.length, 5); assert.ok(value.methodPreflight.every(row => row.status === 405));
  for (const file of ["scripts/run-owned-privacy-offline.mjs", "tests/browser/privacy-offline.spec.ts", "tests/browser/static-host-policy.spec.ts"])
    assert.equal(sha(await readFile(file)), value.sourcePins[file]);
  // The sole post-browser helper edit renames a local variable for Next's lint rule.
  // Reconstruct and verify exact executed bytes instead of replaying 19 unchanged cases.
  const helper = await readFile("scripts/lib/direct-workerd-host.mjs", "utf8");
  const executedHelper = helper.replace(
    "for (const entry of modules) assert.equal(await hashFile(entry.file), entry.sha256);",
    "for (const module of modules) assert.equal(await hashFile(module.file), module.sha256);");
  assert.notEqual(helper, executedHelper);
  assert.equal(sha(executedHelper), value.sourcePins["scripts/lib/direct-workerd-host.mjs"]);
});
