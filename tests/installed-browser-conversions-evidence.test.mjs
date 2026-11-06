import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const receipts = [
  ["2026-11-06T19-50-09-397Z", "5e3e977c1e5fd6cec0a60d9e72c2c52c4d4882267f96cbc32b71a6297c74029b"],
  ["2026-11-06T19-52-33-748Z", "74200140d4669795a0479e7b5496200b42f0f6bc40c133fb74e8511b304f4d52"],
  ["2026-11-06T19-56-35-166Z", "ba0297683df9ed65949e26fd29a0da64908411069ededac565038ccf736b8b67"],
];
const rows = await Promise.all(receipts.map(async ([stamp, digest]) => {
  const bytes = await readFile(new URL(`../evidence/${stamp}-edge-installed-conversions.json`, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), digest); return JSON.parse(bytes);
}));
const [failed, beforeCopy, final] = rows;
test("missing-python attempt remains failed; repaired environment and later real UI-change smoke are distinct actual executions", () => {
  assert.equal(failed.status, "failed-not-acceptance"); assert.equal(failed.stats.unexpected, 1);
  assert.match(failed.runnerLog, /spawn python ENOENT/); assert.equal(failed.stats.expected, 0);
  assert.equal(final.executedHead, "be3cf45893ade085813723771cf16d56443575bb");
  assert.equal(final.browserBefore.version, "156.0.4314.58");
  assert.equal(final.stats.duration, 8984.636);
  for (const r of [beforeCopy, final]) {
    assert.equal(r.status, "passed-five-representative-headless-conversions");
    assert.equal(r.stats.expected, 1); assert.equal(r.stats.unexpected, 0); assert.equal(r.stats.skipped, 0); assert.equal(r.stats.flaky, 0);
    assert.deepEqual(r.matrix.routes.map(x => x.profileId).sort(), ["csv-to-tsv", "mkv-to-mp4", "png-to-webp", "tar-to-zip", "txt-to-docx"]);
    assert.ok(r.validators.python[0].endsWith("python.exe"));
    for (const x of r.matrix.routes) {
      assert.ok(x.inputBytes > 0 && x.inputBytes <= 936003); assert.ok(x.outputBytes > 0);
      assert.ok(x.maxReadChunkBytes <= 262144 && x.maxWriteChunkBytes <= 262144 && x.peakQueuedBytes <= 262144);
      assert.equal(x.peakPendingOperations, 1); assert.ok(x.validator.length > 20);
    }
    assert.equal(r.matrix.routes.find(x => x.profileId === "png-to-webp").validator, "FFprobe codec/dimensions, full decode, and SSIM 0.988655");
    assert.match(r.matrix.routes.find(x => x.profileId === "mkv-to-mp4").validator, /exact H.264\/AAC packet hashes, and full decode/);
  }
  assert.deepEqual(final.matrix.routes.map(x => x.outputSha256), beforeCopy.matrix.routes.map(x => x.outputSha256));
});
test("both actual Edge passes retain private bounded production output and recovery without extending memory/stress/native-picker scope", () => {
  for (const r of [beforeCopy, final]) {
    assert.equal(r.headed, false); assert.equal(r.matrix.headed, false);
    for (const field of ["osNativePickerVerified", "conversionMemoryAcceptance", "stressAcceptance", "publicPromotion"]) assert.equal(r[field], false);
    assert.match(r.browserLaunchPolicy, /not normal-profile\/service parity or memory acceptance/);
    assert.equal(r.matrix.directDestination.outputBytes, 90); assert.equal(r.matrix.directDestination.profileId, "csv-to-tsv");
    assert.match(r.matrix.failureRecovery.error, /Unsafe TAR entry/); assert.deepEqual(r.matrix.failureRecovery.leftoverOutputNames, []);
    assert.deepEqual(r.matrix.network.methods, ["GET"]); assert.equal(r.matrix.network.origins.length, 1);
    assert.match(r.matrix.network.origins[0], /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(r.matrix.network.requestBodies, 0); assert.deepEqual(r.matrix.network.privateTokensObserved, []);
    assert.deepEqual(r.matrix.diagnostics, []);
  }
});
test("every actual attempt removed converted copies/profiles/runtime and owned roots, preserving exact original and browser binaries", () => {
  for (const r of rows) {
    assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.convertedOutputsAndProfilesRemoved, true);
    assert.equal(r.serverCleanup.ownedRootAbsent, true); assert.equal(r.runnerCleanup.status, "owned-identity-absent");
    assert.deepEqual(r.browserBefore, r.browserAfter); assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter);
    assert.deepEqual(r.protectedOriginalAfter, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  }
});
