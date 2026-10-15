import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectExclusiveCopyComparison } from "../scripts/lib/exclusive-copy-comparison.mjs";
const proof = JSON.parse(await readFile(new URL("../evidence/2026-10-15T16-05-01-937Z-exclusive-staged-copy-phased.json", import.meta.url)));
const record = proof.nativeArchive, zip = await readFile(new URL("../" + record.path, import.meta.url));
assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
const raw = gunzipSync(zip, { maxOutputLength: 8388608 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
const native = JSON.parse(raw);
test("six real full-size exact copies prove correctness but not a consistent exclusive-writer optimization", () => {
  const result = inspectExclusiveCopyComparison(proof, native);
  assert.equal(result.identicalValidatedCopies, 6); assert.equal(result.fixtureBytes, 6414309978);
  assert.equal(result.baselineMedianMs, 61727.869999974966); assert.equal(result.candidateMedianMs, 61481.50999999046);
  assert.equal(result.baselinePeakPrivateMiB, 80.59375); assert.equal(result.candidatePeakPrivateMiB, 86.2109375);
  assert.equal(result.speedGainProven, false); assert.equal(result.lowerCopyMemoryProven, false);
  assert.equal(result.unchangedFullRetryJustified, false); assert.equal(result.publicAcceptance, false);
});
test("truncation, hash mismatch, queue growth, hidden native peaks or unclean abort cannot be called a pass", () => {
  for (const mutate of [p => { p.runs[0].outputBytes--; }, p => { p.runs[0].outputSha256 = "0".repeat(64); },
    p => { p.runs[1].metrics.peakQueuedBytes = 1048576; }, p => { p.runs[1].incrementalTreePrivateMiB = 0; },
    p => { p.runs[1].writer.retainedWriter = true; }, p => { p.adverse[0].cleanup.outputRemoved = false; },
    p => { p.blank.privateBytes += 1048576; }, p => { p.generated.sparse = true; }]) {
    const changed = structuredClone(proof); mutate(changed); assert.throws(() => inspectExclusiveCopyComparison(changed, native));
  }
});
test("retained independent audit binds all23 sources,48 absent births, original checksum and removed diagnostics", async () => {
  const audit = JSON.parse(await readFile(new URL("../evidence/2026-10-15T16-05-01-937Z-exclusive-staged-copy-independent-analysis.json", import.meta.url)));
  for (const [key, value] of Object.entries(inspectExclusiveCopyComparison(proof, native))) assert.deepEqual(audit[key], value, key);
  assert.equal(audit.proof.sha256, sha(await readFile(new URL("../" + audit.proof.path, import.meta.url))));
  assert.equal(audit.all23PreCurrentPostSourcesVerified, true); assert.equal(audit.birthChecks.length, 48);
  assert.ok(audit.birthChecks.every(row => row.ownedBirthAbsent)); assert.equal(audit.allDiagnosticDataAndProfileRemoved, true);
  assert.equal(audit.protectedOriginalSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for (const [file, source] of Object.entries(audit.ownSources)) {
    assert.equal(sha(await readFile(new URL("../" + file, import.meta.url))), source.sha256);
    assert.equal(sha(Buffer.from(source.preimage, "base64")), source.sha256);
  }
  await assert.rejects(access(proof.runtimeDirectory), { code: "ENOENT" });
});
