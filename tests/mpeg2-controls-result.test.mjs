import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
const root = new URL("../", import.meta.url), sha = bytes => createHash("sha256").update(bytes).digest("hex");
for (const [stamp, outputs] of [["2026-10-23T15-46-35.345Z", 0], ["2026-10-23T15-52-18.420Z", 1]]) {
  test(`actual rejected controls attempt ${stamp} is lossless, source-bound and not accepted`, async () => {
    const receipt = JSON.parse(await readFile(new URL(`evidence/${stamp}-mpeg2-controls-result.json`, root)));
    const archive = await readFile(new URL(receipt.archive.path, root));
    assert.equal(archive.length, receipt.archive.bytes); assert.equal(sha(archive), receipt.archive.sha256);
    const bytes = gunzipSync(archive, { maxOutputLength: 4 * 1048576 });
    assert.equal(bytes.length, receipt.archive.restoredBytes); assert.equal(sha(bytes), receipt.archive.restoredSha256);
    const raw = JSON.parse(bytes);
    assert.equal(receipt.status, "failed"); assert.equal(raw.status, "failed"); assert.equal(receipt.completed, false);
    assert.equal(receipt.completedCases.length, outputs); assert.equal(raw.controlsQualification.cases.length, outputs);
    assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.memory, null); assert.ok(receipt.failures.length > 0);
    assert.deepEqual(receipt.failures, raw.failures); assert.deepEqual(receipt.native, raw.native);
    assert.equal(receipt.sourcePins, Object.keys(raw.sources).length); assert.equal(receipt.recordedSourcesMatchHistoricalGitHead, true);
    assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
    assert.ok(receipt.independentCleanup.every(entry => entry.status === "owned-identity-absent"));
    if (outputs) {
      assert.equal(receipt.completedCases[0].output.frames, 96); assert.ok(receipt.completedCases[0].output.ssim >= 0.98);
      assert.equal(receipt.completedCases[0].output.sha256, "5bb6592e59cca09e455183576de58b267a203af69abca529b1705913d8f1cb46");
      assert.match(receipt.lastTerminal.message, /File too large/);
      assert.deepEqual(receipt.lastTerminal.metrics.mpeg2EncoderSettings, { width: 320, height: 180, frameRateNumerator: 15,
        frameRateDenominator: 1, bitRateBps: 1000000, qmin: 2, qmax: 12 });
    }
  });
}
