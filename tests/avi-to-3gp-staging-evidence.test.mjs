import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles, publicProfilesFor } from "../lib/capability-registry.ts";

const source = (path) => readFileSync(path, "utf8");
const evidence = JSON.parse(
  source("evidence/avi-to-3gp-staged-current-chrome-2026-09-23.json"),
);
const manifest = JSON.parse(source("evidence/public-profile-evidence.json"));
const app = source("app/converter/ConverterApp.tsx");
const worker = source("workers/conversion.worker.ts");
const profiler = source("scripts/memory-profile.mjs");

test("AVI-to-3GP is public only with genuine bounded current-browser evidence", () => {
  const profile = conversionProfiles.find(({ id }) => id === "avi-to-3gp");
  assert.ok(profile?.public);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.maxTestedBytes, evidence.source.bytes);
  assert.ok(publicProfilesFor("avi").some(({ id }) => id === "avi-to-3gp"));
  assert.equal(evidence.status, "accepted");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.output.majorBrand, "3gp4");
  assert.equal(evidence.output.videoPackets, 1543);
  assert.equal(evidence.output.repeatableAcrossAllTwelveAcceptedRuns, true);
  assert.match(evidence.output.sha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.output.fullyDecodedVideoStreamHash, /SHA256=/);
});

test("worst direct route remains below the unchanged process-tree cap", () => {
  assert.equal(evidence.browser.limitMiB, 250);
  assert.equal(evidence.directSaveSessions.length, 3);
  assert.equal(
    evidence.directSaveSessions.reduce(
      (runs, session) => runs + session.elapsedMs.length,
      0,
    ),
    9,
  );
  assert.equal(evidence.directSaveWorstIncrementalPrivateMiB, 244);
  assert.equal(evidence.directSaveHeadroomMiB, 6);
  assert.equal(evidence.opfsSession.elapsedMs.length, 3);
  assert.ok(Math.max(...evidence.opfsSession.incrementalPrivateMiB) <= 250);
  for (const session of evidence.directSaveSessions) {
    assert.equal(session.elapsedMs.length, 3);
    assert.equal(session.incrementalPrivateMiB.length, 3);
    assert.ok(Math.max(...session.incrementalPrivateMiB) <= 250);
    assert.match(session.reportSha256, /^[a-f0-9]{64}$/);
  }
  const publicEntry = manifest.profiles.find(
    ({ profileId }) => profileId === "avi-to-3gp",
  );
  assert.equal(publicEntry?.repeatableEvidence.incrementalPrivateMiB, 244);
  assert.equal(publicEntry?.maximumSizeEvidence.sourceBytes, evidence.source.bytes);
});

test("staging, final-copy cancellation, failure, and cleanup remain scoped", () => {
  assert.match(app, /batch\.profile\.id !== "avi-to-3gp"/);
  assert.match(worker, /profileId !== "avi-to-3gp"/);
  assert.match(worker, /Copying staged 3GP to selected destination/);
  assert.match(profiler, /activeProfileId === "avi-to-3gp"[\s\S]*Copying staged 3GP to selected destination/);
  assert.equal(evidence.acceptedTopology.maximumReadBytes, 262144);
  assert.equal(evidence.acceptedTopology.maximumWriteBytes, 262144);
  assert.equal(evidence.acceptedTopology.maximumPendingOperations, 1);
  assert.match(evidence.directSaveSessions[1].cancellation, /final-copy cancellation/);
  assert.match(evidence.adverseBrowserChecks.injectedFinalCopyWriteFailure, /partial selected destination was removed/);
  assert.match(evidence.adverseBrowserChecks.workerCrash, /worker restarted to ready/);
  assert.ok(Object.values(evidence.cleanup).every(Boolean));
});
