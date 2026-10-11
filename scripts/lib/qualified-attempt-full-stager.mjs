// Reuse the EXACT actually executed media stager, changing only its owned slot.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { inspectAttemptMediaReport } from "./allocation-attempt-media-recipe.mjs";
export async function loadQualifiedAttemptMediaSources(root) {
  const read = file => readFile(path.join(root, file));
  const proofPath = "evidence/2026-10-11T13-23-21-737Z-allocation-attempt-media.json", proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
  assert.equal(sha(proofBytes), "b0f8fe797130a82f0b53444aa901c6cc07dc080e6c1e2b4f30d29decef20bc3b");
  assert.equal(proof.failure, null); assert.equal(proof.analysis.genuineValidatedConversions, 3);
  assert.equal(proof.status, "three-headless-attempt-core-conversions-and-recovery-passed-not-full-acceptance");
  assert.equal(Object.keys(proof.sourcePins).length, 136); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  const restore = async (record, maximum) => {
    const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
    const bytes = gunzipSync(zipped, { maxOutputLength: maximum }); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
    return JSON.parse(bytes);
  };
  const archive = await restore(proof.generatedArchive, 8388608); assert.deepEqual(archive.sourcePins, proof.sourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) { assert.equal(sha(await read(file)), hash, file); assert.equal(sha(archive.sources[file]), hash, file); }
  const report = await restore(proof.report.archive, 2097152);
  const buildBytes = await read(proof.build.path); assert.equal(sha(buildBytes), proof.build.sha256);
  const baselineBytes = await read(proof.baseline.path); assert.equal(sha(baselineBytes), proof.baseline.sha256);
  assert.deepEqual(inspectAttemptMediaReport(report, JSON.parse(baselineBytes).reports[0].report, JSON.parse(buildBytes)), proof.analysis);
  const generated = archive.generated;
  assert.equal(sha(generated.stage), generated.integrationRecipes.stage.generatedSha256);
  assert.equal(generated.compositeAdapter.bytes < 32768, true);
  assert.deepEqual(generated.composition.manifest, report.manifest);
  return { proof, archive, report, reference: { path: proofPath, sha256: sha(proofBytes), sourceCount: 136 } };
}
export async function makeQualifiedAttemptFullStager(root, candidateName) {
  assert.match(candidateName ?? "", /^allocation-attempt-media-[A-Za-z0-9]+$/);
  const qualified = await loadQualifiedAttemptMediaSources(root), prior = qualified.archive.generated.stage, oldName = qualified.archive.generated.candidateName;
  const edits = [[JSON.stringify(oldName), JSON.stringify(candidateName)], [`/^${oldName}$/`, `/^${candidateName}$/`]];
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, prior, "Only owned candidate name/default and exact path guard change; real tested adapter/encoder/AVIO/restore bytes unchanged");
  return { generated, generatedSha256: sha(generated), edits, previousStagerSha256: sha(prior), qualifiedMedia: qualified.reference,
    manifest: qualified.report.manifest, adapter: qualified.archive.generated.compositeAdapter, publicAcceptance: false, fullOriginalAcceptance: false };
}
