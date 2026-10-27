import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const json = async file => JSON.parse(await readFile(file, "utf8"));
const evidence = stamp => json(`evidence/${stamp}-static-shell-build.json`);

test("two rejected prototype assertions stay failed and never imply browser or conversion coverage", async () => {
  const minimum = await evidence("2026-10-27T10-36-17-016Z"), landmark = await evidence("2026-10-27T10-36-42-905Z");
  assert.equal(minimum.status, "failed-private-build-feasibility"); assert.match(minimum.failures[0], /10000/);
  assert.equal(landmark.status, "failed-private-build-feasibility"); assert.match(landmark.failures[0], /convert-button/);
  assert.equal(landmark.prerenderedApplication.bytes, 9069);
  for (const value of [minimum, landmark]) {
    assert.equal(value.browserLaunched, false); assert.equal(value.ownedRuntimeRemoved, true);
    assert.equal(value.publicPromotion, false); assert.equal(value.conversionAcceptance, false);
  }
});

test("private static build uses actual Home/ConverterApp and unchanged CSS; fewer bytes are not memory or speed proof", async () => {
  const value = await evidence("2026-10-27T10-37-06-668Z");
  assert.equal(value.status, "completed-private-build-feasibility-not-acceptance");
  assert.equal(value.prerenderedApplication.actualHomeAndConverterComponent, true);
  assert.equal(value.prerenderedApplication.generatedProgressOrConversionData, false);
  assert.equal(value.baselineBootstrap.javascriptBytes, 610537); assert.equal(value.candidateBootstrap.javascriptBytes, 529619);
  assert.equal(value.comparison.rawJavascriptBytesSaved, 80918); assert.equal(value.comparison.gzipJavascriptBytesSaved, 24668);
  const css = result => result.assets.find(asset => asset.pathname.endsWith(".css"));
  assert.equal(css(value.baselineBootstrap).sha256, css(value.candidateBootstrap).sha256);
  assert.equal(value.publicAssets.filesPresentAtMatchingSize, 102); assert.equal(value.publicAssets.bytes, 92254308);
  assert.equal(value.publicAssets.byteIdentityIndependentlyValidated, false, "Presence/size was not a complete content validation");
  assert.equal(value.browserLaunched, false); assert.equal(value.memoryAcceptance, false);
  assert.equal(value.productionReplacement, false); assert.equal(value.publicPromotion, false); assert.equal(value.ownedRuntimeRemoved, true);
});

test("real first browser failure remains partial; compact trace evidence proves the private adapter MIME error", async () => {
  const value = await evidence("2026-10-27T10-41-05-002Z"), compact = await json("evidence/2026-10-27-static-shell-mime-failure.json");
  assert.equal(value.status, "failed-private-build-feasibility"); assert.equal(value.privacy.stats.expected, 5);
  assert.equal(value.privacy.stats.unexpected, 1); assert.equal(value.privacy.stats.skipped, 13);
  assert.equal(value.privacy.retainedTrace.bytes, compact.sourceTrace.bytes); assert.equal(value.privacy.retainedTrace.sha256, compact.sourceTrace.sha256);
  assert.equal(compact.matchingNetworkEntries.length, 2);
  assert.ok(compact.matchingNetworkEntries.every(row => row.status === 200 && row.contentType === "application/octet-stream" && row.xContentTypeOptions === "nosniff"));
  const trace = await readFile(compact.sourceTrace.path); assert.equal(trace.length, compact.sourceTrace.bytes);
  assert.equal(createHash("sha256").update(trace).digest("hex"), compact.sourceTrace.sha256);
  const requireFromFont = createRequire(path.resolve("node_modules/@shuding/opentype.js/package.json"));
  const files = requireFromFont("fflate").unzipSync(trace);
  const matches = Object.entries(files).filter(([name]) => name.endsWith(".network")).flatMap(([, bytes]) =>
    Buffer.from(bytes).toString().split("\n").filter(line => line.trim()).map(line => JSON.parse(line).snapshot))
    .filter(row => /jxl-inspector.*\.mjs/.test(row?.request?.url ?? ""));
  assert.equal(matches.length, 2); assert.ok(matches.every(row => row.response.status === 200 && row.response.content.mimeType === "application/octet-stream"));
  assert.equal(value.privacy.processCleanup.status, "owned-identity-absent"); assert.equal(value.privacy.serverClosed, true);
  assert.equal(value.ownedRuntimeRemoved, true); assert.deepEqual(value.privacy.protectedOriginalAfter, value.privacy.protectedOriginalBefore);
});

test("corrected private candidate passes all unchanged privacy cases and exact original/owned-cleanup guards, without promotion", async () => {
  const value = await evidence("2026-10-27T10-43-53-069Z");
  const baseline = await json("evidence/2026-10-27T10-21-32-023Z-owned-privacy-offline.json");
  assert.equal(value.status, "completed-private-build-feasibility-not-acceptance");
  assert.equal(value.browserLaunched, true); assert.equal(value.privacy.status, "passed-unchanged-private-candidate-privacy-offline-specs");
  assert.equal(value.privacy.stats.expected, 19); assert.equal(value.privacy.stats.unexpected, 0);
  assert.equal(value.privacy.stats.skipped, 0); assert.equal(value.privacy.stats.flaky, 0);
  assert.equal(value.privacy.moduleMimePreflight.length, 19);
  assert.ok(value.privacy.moduleMimePreflight.every(row => row.status === 200 && row.contentType === "text/javascript"));
  assert.equal(value.privacy.processCleanup.status, "owned-identity-absent"); assert.equal(value.privacy.serverClosed, true);
  assert.equal(value.privacy.safeToRemoveRuntime, true); assert.equal(value.ownedRuntimeRemoved, true);
  assert.deepEqual(value.privacy.protectedOriginalAfter, value.privacy.protectedOriginalBefore);
  assert.equal(value.privacy.protectedOriginalAfter.bytes, 2958573265);
  assert.equal(value.privacy.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for (const file of ["package.json", "package-lock.json", "vite.config.ts", "worker/index.ts", "app/converter/ConverterApp.tsx", "lib/capability-registry.ts",
    "tests/browser/privacy-offline.spec.ts", "tests/browser/static-host-policy.spec.ts", ".openai/hosting.json"])
    assert.equal(value.sourcePins[file], baseline.sourcePins[file], `Existing production source/identity preserved: ${file}`);
  assert.equal(value.memoryAcceptance, false); assert.equal(value.conversionAcceptance, false); assert.equal(value.publicPromotion, false);
  assert.equal(value.knownOpenGates.includes("whole-Chromium memory A/B"), true);
});

test("candidate harness is private, finite, static-only, hidden, source-pinned and finally-owned", async () => {
  const source = await readFile("scripts/build-static-shell-candidate.mjs", "utf8");
  const helper = await readFile("scripts/lib/static-shell-candidate-privacy.mjs", "utf8");
  assert.match(source, /createOwnedRuntimeScratch\("static-shell-candidate-"\)/);
  assert.match(source, /productionReplacement: false/); assert.match(source, /finally \{/); assert.match(source, /await runtime.close\(\)/);
  assert.match(source, /safeToRemoveRuntime !== false/); assert.match(source, /Production\/source pin changed/);
  assert.match(helper, /rejectNonStaticRequest/); assert.match(helper, /"\.mjs": "text\/javascript"/);
  assert.match(helper, /await pipeline\(createReadStream\(filename, \{ highWaterMark: 65536/);
  assert.match(helper, /await realpath\(filename\) !== filename/); assert.match(helper, /headless:true/);
  assert.match(helper, /windowsHide: true/); assert.match(helper, /queryReliableProcessIdentity\(runner.pid\), birth/);
  assert.match(helper, /observeOwnedProcessExit\(birth\)/); assert.match(helper, /300000/);
  assert.doesNotMatch(helper, /--headed|headless: false|--grep|ffmpeg|\.readFile\(original\)/);
  const value = await evidence("2026-10-27T10-43-53-069Z");
  for (const file of ["scripts/build-static-shell-candidate.mjs", "scripts/lib/static-shell-candidate-privacy.mjs", "scripts/static-shell-candidate/client.tsx", "scripts/static-shell-candidate/prerender.tsx"])
    assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), value.sourcePins[file]);
});
