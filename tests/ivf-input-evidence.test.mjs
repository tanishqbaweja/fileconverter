import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceName = "evidence/ivf-input-browser-2026-09-11.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, evidenceName), "utf8"),
);

async function sha256(relativePath) {
  const bytes = await readFile(path.join(projectRoot, relativePath));
  return createHash("sha256").update(bytes).digest("hex");
}

test("IVF input evidence retains every accepted bounded stress route", () => {
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.dockerUsed, false);
  assert.match(evidence.conversionClass, /packet copy/i);
  assert.equal(evidence.sources.vp9.bytes, 169_519_329);
  assert.equal(evidence.acceptedStressReports.length, 6);

  const combinations = new Set();
  for (const report of evidence.acceptedStressReports) {
    combinations.add(
      `${report.sourceCodec}:${report.profileId}:${report.destination}`,
    );
    assert.equal(report.elapsedMs.length, 3);
    assert.equal(report.throughputMiBPerSecond.length, 3);
    assert.ok(report.worstIncrementalPrivateMiB <= 250);
    assert.equal(report.maximumReadBytes, 256 * 1024);
    assert.ok(report.maximumWriteAndQueuedBytes <= 1024 * 1024);
    assert.match(report.reportSha256, /^[a-f0-9]{64}$/);
    assert.match(report.outputSha256, /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(combinations, new Set([
    "vp9:ivf-to-webm:opfs-test",
    "vp9:ivf-to-webm:direct-handle",
    "vp9:ivf-to-mkv:opfs-test",
    "vp9:ivf-to-mkv:direct-handle",
    "av1:ivf-to-webm:opfs-test",
    "av1:ivf-to-mkv:opfs-test",
  ]));
  assert.equal(evidence.sharedRuntimeGates.maximumPendingOperations, 1);
  assert.equal(evidence.sharedRuntimeGates.fixedObservedWasmBytes, 32 * 1024 * 1024);
  assert.equal(evidence.sharedRuntimeGates.completeFrameDecode, true);
  assert.equal(evidence.sharedRuntimeGates.directCancellationDeletesPartialFile, true);
});

test("IVF input publication evidence matches every current FFmpeg Wasm file", async () => {
  assert.equal(evidence.publication.result, "passed");
  assert.equal(evidence.publication.allSixFfmpegModulesByteExact, true);
  assert.equal(evidence.publication.mismatchArtifactUploadSkipped, true);
  assert.equal(evidence.publication.retainedArtifacts, 0);
  assert.equal(evidence.publication.commit, "9af549d2af996b300bbaac559240dae6b19178ec");

  for (const [name, expectedHash] of Object.entries(
    evidence.publishedEngine.wasmSha256,
  )) {
    assert.equal(
      await sha256(path.join("public", "engines", "remux", name)),
      expectedHash,
      name,
    );
  }
});

test("IVF input evidence is linked from every project ledger", async () => {
  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const ledger = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(ledger.includes(evidenceName), relativePath);
  }
  assert.equal(evidence.cleanup.generatedStressFixturesDeleted, true);
  assert.equal(evidence.cleanup.convertedOutputsDeleted, true);
  assert.equal(evidence.cleanup.workDirectoryContainsOnlyGitkeep, true);
  assert.equal(evidence.cleanup.protectedTestMkvBytes, 2_958_573_265);
  assert.equal(
    evidence.cleanup.protectedTestMkvSha256,
    "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34",
  );
});
