import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyHostedAudioScopeProof } from "../scripts/lib/hosted-audio-scope-proof.mjs";
const proof = JSON.parse(await readFile(new URL("../evidence/audio-destination-scopes-hosted-2026-10-08.json", import.meta.url), "utf8"));
const verified = JSON.parse(await readFile(new URL("../evidence/audio-destination-scopes-hosted-verification-2026-10-08.json", import.meta.url), "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("actual eight hosted outputs preserve all 56 fields in selected stream scope with negative controls", () => {
  const result = verifyHostedAudioScopeProof(proof);
  for (const [key, value] of Object.entries(result)) assert.deepEqual(verified[key], value);
  assert.equal(result.browser, "151.0.7922.34"); assert.equal(result.preservedFields, 56);
  assert.equal(result.changedTitleControls + result.wrongScopeControls, 16);
  assert.equal(result.fullIndependentDecodes, 8);
  assert.equal(result.currentStableChromeAcceptance, false); assert.equal(result.completeChromiumMemoryAcceptance, false);
});
test("executed source/engine pins and retained raw report bytes are exact, not repinned claims", async () => {
  for (const [file, hash] of Object.entries(verified.cases[0].sourcePins))
    assert.equal(sha(await readFile(new URL(`../${file}`, import.meta.url))), hash, file);
  for (const [file, hash] of Object.entries(verified.sourcePins))
    assert.equal(sha(await readFile(new URL(`../${file}`, import.meta.url))), hash, file);
  const bytes = await readFile(new URL(`../${verified.input.path}`, import.meta.url));
  assert.equal(bytes.length, verified.input.bytes); assert.equal(sha(bytes), verified.input.sha256);
});
test("missing samples/metadata, changed fields, false cleanup and duplicate route substitutions cannot pass", () => {
  const mutations = [row => delete row.browserState.metrics.maxReadChunkBytes,
    row => row.output.probe.streams[0].tags.title = "Changed",
    row => row.output.probe.format.tags = row.output.probe.streams[0].tags,
    row => row.remainingOpfsEntries = ["leftover"], row => row.sourcePinsUnchanged = false,
    row => row.fullIndependentDecode = "unavailable", row => row.completeChromiumMemoryAcceptance = true];
  for (const mutate of mutations) {
    const changed = structuredClone(proof), row = JSON.parse(changed.reports[0].rawJson); mutate(row);
    const raw = JSON.stringify(row); changed.reports[0] = { ...changed.reports[0], rawJson: raw,
      bytes: Buffer.byteLength(raw), sha256: sha(raw) };
    assert.throws(() => verifyHostedAudioScopeProof(changed));
  }
  const changed = structuredClone(proof); changed.reports[1] = changed.reports[0];
  assert.throws(() => verifyHostedAudioScopeProof(changed));
});
test("actual cleanup removes only the now-redundant generated JSON artifact and retains recoverable local evidence", async () => {
  const cleanup = JSON.parse(await readFile(new URL("../evidence/audio-destination-scopes-hosted-cleanup-2026-10-08.json", import.meta.url), "utf8"));
  assert.equal(cleanup.status, "verified-owned-hosted-json-artifact-deleted");
  assert.equal(cleanup.runId, proof.run.databaseId); assert.equal(cleanup.artifactId, proof.artifact.id);
  assert.equal(cleanup.before.total_count, 1); assert.equal(cleanup.before.artifacts[0].id, cleanup.artifactId);
  assert.equal(cleanup.before.artifacts[0].name, "audio-destination-scopes-37684741516");
  assert.equal(cleanup.after.total_count, 0); assert.deepEqual(cleanup.after.artifacts, []);
  assert.equal(cleanup.localCompactReportsRetained, true);
  assert.equal(cleanup.deletionTargetWasGeneratedJsonOnly, true);
  assert.equal(cleanup.deletionCanBeRecoveredFromLocalRetainedRawReports, true);
  assert.equal(cleanup.noOtherArtifactsOrUserFilesDeleted, true); assert.equal(cleanup.ownedRuntimeRemoved, true);
  assert.equal(cleanup.protectedOriginalRead, false);
  const bytes = await readFile(new URL(`../${cleanup.verificationProof.path}`, import.meta.url));
  assert.equal(bytes.length, cleanup.verificationProof.bytes); assert.equal(sha(bytes), cleanup.verificationProof.sha256);
});
