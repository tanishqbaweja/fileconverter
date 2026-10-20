import assert from "node:assert/strict";
import { inspectThreeFullJspiRuns } from "./jspi-three-full-observation.mjs";
import { inspectColdFullJspiRuns } from "./jspi-cold-full-observation.mjs";
export function inspectJspiColdRepeat(previousTerminal, previousReport, terminal, report) {
  const before = inspectThreeFullJspiRuns(previousTerminal, previousReport), after = inspectColdFullJspiRuns(terminal, report);
  assert.deepEqual(terminal.sourcePins, previousTerminal.sourcePins);
  assert.deepEqual(terminal.sourcePins, terminal.postSourcePins); assert.deepEqual(previousTerminal.sourcePins, previousTerminal.postSourcePins);
  assert.deepEqual(report.sourceHashes, previousReport.sourceHashes); assert.deepEqual(report.manifest, previousReport.manifest);
  assert.deepEqual(terminal.browserPinBefore, previousTerminal.browserPinBefore);
  assert.deepEqual(terminal.browserPinAfter, previousTerminal.browserPinAfter); assert.equal(report.browserVersion, previousReport.browserVersion);
  assert.deepEqual(terminal.protectedBefore, previousTerminal.protectedBefore); assert.deepEqual(terminal.protectedAfter, previousTerminal.protectedAfter);
  const browserRoot = value => {
    const identity = value.cleanup.chromeRootExitObservation.identity;
    assert.equal(identity.type, "browser");
    const matches = value.nativeMemory.identities.filter(row => row.pid === identity.pid && Date.parse(row.createdAt) === Date.parse(identity.createdAt));
    assert.equal(matches.length, 1); assert.match(matches[0].creationFileTime, /^\d+$/);
    return { ...identity, creationFileTime: matches[0].creationFileTime };
  };
  const previousRoot = browserRoot(previousReport), currentRoot = browserRoot(report);
  assert.ok(BigInt(currentRoot.creationFileTime) > BigInt(previousRoot.creationFileTime));
  assert.ok(Date.parse(currentRoot.createdAt) > Date.parse(previousTerminal.finishedAt), "Cold browser must start after prior session was completely finished");
  for (const field of ["wrapper", "candidateDirectory", "callerRuntimeDirectory"]) assert.notEqual(terminal[field], previousTerminal[field]);
  assert.notEqual(report.runtimeDirectory, previousReport.runtimeDirectory, "Fresh owned profile, not a page reload in the old profile");
  assert.deepEqual(report.formula, previousReport.formula); assert.equal(report.limitMiB, 250);
  for (const row of after.rows) assert.equal(row.outputSha256, before.rows[0].outputSha256);
  return { status: "two-independent-clean-three-run-full-original-sessions-verified",
    previousBrowserRoot: previousRoot, currentBrowserRoot: currentRoot,
    previousSessionFinishedBeforeNewBrowserCreated: true, freshProfileAndOwnedHarnessDirectories: true,
    same868SourcesNativeManifestBrowserAndProtectedOriginal: true,
    priorSession: before.rows, coldSession: after.rows, completeFullOutputs: 6,
    outputBytesEach: after.rows[0].outputBytes, outputSha256: after.rows[0].outputSha256,
    currentWorstIncrementalPrivateMiB: after.worstIncrementalPrivateMiB, priorWorstIncrementalPrivateMiB: before.worstIncrementalPrivateMiB,
    sameSessionThreeRunsVerifiedInEachSession: true, independentColdSessionRepeatVerified: true,
    nativeAvailability: after.nativeAvailability,
    cleanupRecoveryGuardPassed: true, zeroRetainedGrowthProven: false, generalSpeedGainProven: false,
    scalingAcceptance: false, publicAcceptance: false, fullProjectAcceptance: false };
}
