import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { compareJspiLtoScreen } from "../scripts/lib/jspi-lto-speed-screen.mjs";
const state = JSON.parse(await readFile("evidence/2026-10-19T17-19-25-399Z-jspi-lto-speed-screen.json"));
test("actual ABBA rules out accepting unchanged library LTO as a repeatable small-fixture speed improvement", () => {
  assert.equal(state.status, "finished-order-balanced-screen-not-public-acceptance");
  assert.equal(state.failure, null); assert.deepEqual(state.cleanupErrors, []); assert.equal(state.active, null);
  const result = compareJspiLtoScreen(state.blocks); assert.deepEqual(result, state.comparison);
  assert.equal(result.screenPassed, false); assert.equal(result.status, "lto-not-accepted-as-speed-optimization");
  assert.ok(Math.abs(result.reductionFraction - 0.00176853631248719) < 1e-12);
  assert.ok(result.pairs[0].reductionFraction > 0 && result.pairs[1].reductionFraction < 0);
  assert.equal(result.generalSpeedGainProven, false); assert.equal(result.publicAcceptance, false);
  assert.deepEqual(state.blocks.map(row => row.analysis.peakIncrementalPrivateMiB), [231.84375, 227.6171875, 225.1640625, 236.49609375]);
});
test("all eleven as-executed experiment source preimages still match current bytes", async () => {
  assert.equal(Object.keys(state.ownSources).length, 11);
  for (const [file, row] of Object.entries(state.ownSources)) {
    assert.equal(sha(Buffer.from(row.preimage, "base64")), row.sha256); assert.equal(sha(await readFile(file)), row.sha256);
  }
});
test("all four native checkpoint compactions validate and disposable owned traces/raw checkpoints are absent", async () => {
  for (const block of state.blocks) {
    assert.equal(block.audit.complete, true); assert.equal(block.audit.allRecordedBirthsRecheckedAbsent, true);
    const record = block.compaction.checkpoint, zipped = await readFile(record.path);
    assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
    const raw = gunzipSync(zipped, { maxOutputLength: 1048576 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
    assert.equal(block.compaction.disposableSuccessTrace.removed, true);
    await assert.rejects(access(block.checkpoint.file), { code: "ENOENT" });
    await assert.rejects(access(block.compaction.disposableSuccessTrace.path), { code: "ENOENT" });
    for (const directory of block.audit.disposablePathsAbsent) {
      assert.equal(path.dirname(directory), path.join(process.cwd(), "work")); await assert.rejects(access(directory), { code: "ENOENT" });
    }
  }
});
