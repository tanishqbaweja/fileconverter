import assert from "node:assert/strict";

// The existing linker emits `modules`, not `cores`. Keep its actual dependency
// identities, but never advertise the other modules/profiles in a private build.
export function makeAiffId3BuildManifest(previous, { compiledSourceSha256,
  publishedSourceRecoveredSha256, generatedRecipeSha256, sources, artifacts }) {
  assert.ok(Array.isArray(previous.modules));
  const matches = previous.modules.filter(row => row.name === "within-aiff");
  assert.equal(matches.length, 1);
  const core = matches[0];
  assert.equal(core.initialWasmMemoryBytes, 16777216);
  assert.equal(core.maximumWasmMemoryBytes, 33554432);
  assert.equal(core.entrypoint, "within_aiff");
  assert.equal(core.wasmPthreadPoolSize, 0);
  assert.equal(core.videoCodecThreads, 1);
  const { cores: ignoredCores, ...base } = previous;
  void ignoredCores;
  return { ...base, engine: "within-aiff-private-id3-specialist",
    scope: "private-changed-source-build-not-browser-or-public-acceptance",
    initialWasmMemoryBytes: core.initialWasmMemoryBytes,
    maximumWasmMemoryBytes: core.maximumWasmMemoryBytes,
    modules: [{ ...core, sourceSha256: compiledSourceSha256 }],
    profiles: ["m4a-to-aiff"], sources, artifacts,
    metadataCandidate: { allowedSourceEdits: 5, publishedSourceRecoveredSha256,
      compiledSourceSha256, generatedRecipeSha256, actualWasmMemoryLimitsVerified: true,
      codecSettingsChanged: false, ioBoundsChanged: false, memoryLimitsRaised: false,
      reproductionOfPublishedBinaryAttempted: false, actualBrowserConversionVerified: false,
      completeChromiumMemoryAcceptance: false, audioFidelityAcceptance: false,
      speedImprovementProven: false, publicAcceptance: false } };
}
