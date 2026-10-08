import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { summarizeJsAllocation } from "../scripts/lib/bounded-js-allocation.mjs";
import { makeUiJsAllocationControl } from "../scripts/lib/ui-js-allocation-recipe.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = JSON.parse(await read("evidence/ui-js-allocation-tooling-2026-10-08.json"));
const compressed = await read(proof.compressedReport.path);
const restored = gunzipSync(compressed, { maxOutputLength: 4 * 1024 ** 2 }), raw = JSON.parse(restored);
test("Actual JS tooling probe retains exact source, generated control and lossless bounded raw evidence", async context => {
  assert.equal(sha(compressed), proof.compressedReport.sha256);
  assert.equal(compressed.length, proof.compressedReport.bytes);
  assert.equal(restored.length, proof.originalReport.bytes); assert.equal(sha(restored), proof.originalReport.sha256);
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  assert.equal(sha(await read(proof.verifier.path)), proof.verifier.sha256);
  assert.equal(sha(await read(proof.verifier.failedOriginalPath)), proof.verifier.failedOriginalSha256);
  assert.equal(sha(await read("scripts/lib/js-probe-identity-cleanup.mjs")), proof.verifier.identityHelperSha256);
  const receiptBytes = await read(proof.receipt.path), receipt = JSON.parse(receiptBytes);
  assert.equal(sha(receiptBytes), proof.receipt.sha256);
  // The retained Windows-generated code is platform-bound, never regenerated with another root.
  if (process.platform === "win32" && path.resolve(import.meta.dirname, "..") === "H:\\Github Repositories\\fileconverter") {
    const generated = makeUiJsAllocationControl((await read("scripts/diagnose-ui-native-allocation.mjs")).toString(),
      "H:\\Github Repositories\\fileconverter");
    assert.equal(sha(generated), receipt.generatedControl.sha256);
  } else context.diagnostic("Historical generated SHA is receipt-bound; byte-exact regeneration requires the original Windows workspace and module paths");
  assert.deepEqual(receipt.generatedControl, proof.generatedControl);
});
test("Actual callframes are available but include collected and automation allocations, not native cause", () => {
  assert.equal(proof.status, "verified-js-callsite-tooling-not-conversion-acceptance");
  assert.equal(raw.profiles.length, 5);
  for (const row of raw.profiles) assert.deepEqual(row.summary, summarizeJsAllocation({ profile: row.profile }));
  assert.deepEqual(proof.profiles.map(row => row.sampleCount), [1, 33, 70, 104, 104]);
  assert.equal(proof.profiles.at(-1).sourceLocatedSelfBytes, 2098788);
  assert.equal(proof.jsSourceLocationsObserved, true); assert.equal(proof.nativeSamplerUsedInThisRun, false);
  assert.ok(proof.topCallsites.some(row => row.callFrame.functionName === "Ci" && row.callFrame.url.includes("ConverterApp-")));
  assert.ok(proof.topCallsites.some(row => row.exampleStackTail.some(frame => frame.functionName === "innerSerialize")));
  assert.ok(Object.values(proof.inspectedBundles).every(bundle => bundle.inspectedAfterRun && !bundle.servedBytesCapturedDuringRun));
  for (const key of ["exactLiveMemory", "nativeAllocationCauseProven", "primaryMemoryAcceptance", "conversionSpeedAcceptance", "publicAcceptance", "forcedGcUsed"])
    assert.equal(proof[key], false);
  assert.equal(proof.conversionsPerformed, 0); assert.equal(proof.generatedMediaCopies, 0);
  assert.equal(proof.includesNaturallyCollectedObjects, true);
  assert.deepEqual(proof.historicalNativeSampling.sampleCounts, [1, 3, 1, 1, 1]);
  assert.equal(proof.historicalNativeSampling.symbolsResolved, false);
});
test("Terminal production probe passed guarded host/privacy/protected-source and exact identity cleanup", () => {
  assert.equal(raw.host.safeToStart, true); assert.ok(raw.host.freePhysicalBytes >= 2147483648 && raw.host.freeVirtualBytes >= 2147483648);
  assert.equal(proof.protectedFixturePrePostVerified, true);
  assert.equal(proof.originalSourceBytes, 2958573265);
  assert.equal(proof.originalSourceSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.observedProcessIdentities.length, 15); assert.equal(proof.identityCleanup.originalIdentitiesAbsent, true);
  assert.equal(proof.nativeIdentityCleanupVerified, true); assert.equal(proof.runtimeDirectoriesAbsent, true);
  assert.ok(Object.values(proof.cleanup).every(value => value === true));
  assert.deepEqual(proof.forbiddenRequests, []); assert.ok(raw.rows.every(row => row.jobState === null || row.jobState === "idle"));
  assert.equal(proof.rawJsonRemovedAfterVerifiedLosslessCompression, true); assert.equal(proof.bytesSaved, 1695167);
});
