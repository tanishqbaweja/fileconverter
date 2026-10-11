import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { validateBitrateReceipt } from "../scripts/compare-encoder-plane-bitrate.mjs";
import { compareBitrateDiagnostics } from "../scripts/lib/encoder-plane-bitrate-browser-recipe.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("actual browser receipts verify identical inputs and native bitrate-only quality improvement with no acceptance substitution", async () => {
  const control = await validateBitrateReceipt("evidence/2026-10-11T07-35-02-447Z-encoder-plane-bitrate-2000000-diagnostic.json", 2000000);
  const candidate = await validateBitrateReceipt("evidence/2026-10-11T07-36-13-517Z-encoder-plane-bitrate-4000000-diagnostic.json", 4000000);
  const compared = compareBitrateDiagnostics(control.analysis, candidate.analysis);
  assert.equal(compared.control.caseStatus, "failed"); assert.equal(compared.control.ssim, 0.972072);
  assert.equal(compared.candidate.caseStatus, "passed"); assert.equal(compared.candidate.ssim, 0.983095);
  assert.equal(compared.identicalInputBytesVerified, true); assert.equal(compared.onlyNativeBitrateDiffers, true);
  assert.equal(compared.retainedForFullQualification, true); assert.equal(compared.speedImprovementProven, false);
  assert.equal(compared.publicAcceptance, false); assert.equal(compared.fullOriginalAcceptance, false);
});

test("comparison receipt is hash-bound to both actual sources and duplicate raw reports are absent and recoverable", async () => {
  const receipt = JSON.parse(await readFile(path.join(root, "evidence/2026-10-11T07-38-57-951Z-encoder-plane-bitrate-comparison.json")));
  assert.equal(receipt.proofs.length, 2); assert.equal(receipt.rawCleanup.length, 2);
  const values = [];
  for (let i = 0; i < 2; i++) {
    const record = receipt.proofs[i]; assert.equal(sha(await readFile(path.join(root, record.path))), record.sha256);
    const value = await validateBitrateReceipt(record.path, i === 0 ? 2000000 : 4000000); values.push(value);
    assert.equal(record.measuredSourceCount, value.measuredSourceCount);
    const cleanup = receipt.rawCleanup[i]; assert.equal(cleanup.path, value.proof.report.path);
    assert.equal(cleanup.bytes, value.reportBytes.length); assert.equal(cleanup.sha256, sha(value.reportBytes));
    assert.equal(cleanup.recoverableFrom, value.proof.report.archive.path);
    assert.equal(cleanup.removedAfterLosslessArchiveVerification, true);
    await assert.rejects(access(path.join(root, cleanup.path)), { code: "ENOENT" });
  }
  assert.deepEqual(receipt.comparison, compareBitrateDiagnostics(values[0].analysis, values[1].analysis));
  for (const field of ["fullOriginalAcceptance", "completeChromiumMemoryAcceptance", "publicAcceptance"]) assert.equal(receipt[field], false);
});
