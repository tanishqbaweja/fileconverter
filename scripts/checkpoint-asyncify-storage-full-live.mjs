// One native-birth-qualified observation before an ETA-length interruptible wait.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { queryProcessIdentity } from "./lib/owned-process-exit-observation.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = "2026-10-12T14-43-54-627Z", read = file => readFile(path.join(root, file));
const livePath = `evidence/${stamp}-asyncify-storage-full-live.json`, liveBytes = await read(livePath), live = JSON.parse(liveBytes);
const supervisorPath = "evidence/2026-10-12T14-43-53-794Z-asyncify-storage-supervisor-full.json", supervisor = JSON.parse(await read(supervisorPath));
const checkpointPath = "outputs/reports/2026-10-12T14-44-52-473Z-private-mpeg2-asyncify-storage-full-native-100ms-native-checkpoint.json";
const checkpointBytes = await read(checkpointPath), checkpoint = JSON.parse(checkpointBytes);
assert.equal(supervisor.status, "running"); assert.equal(supervisor.childExit, null); assert.equal(live.executions, 1);
assert.equal(Object.keys(live.sourcePins).length, 365); assert.equal(live.composition.manifest.asyncifyStorage.reservationBytes, 262156);
assert.equal(live.composition.manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(live.requestedRuns, 3);
const rows = [["supervisor", supervisor.supervisorIdentity], ["parent", supervisor.childIdentity], ["driver", live.driverIdentity],
  ["headless-chromium", checkpoint.identities.root], ["native-sampler", checkpoint.identities.monitor]];
const observations = await Promise.all(rows.map(async ([role, expected]) => {
  const current = await queryProcessIdentity(expected.pid);
  assert.ok(current && current.parentPid === expected.parentPid && Math.abs(Date.parse(current.createdAt) - Date.parse(expected.createdAt)) < 1,
    `${role}: actual native birth must match, never infer live from status/lock`);
  return { role, expected, current, acquiredAt: new Date().toISOString(), sameNativeBirth: true };
}));
for (const [file, hash] of Object.entries(live.sourcePins)) assert.equal(sha(await read(file)), hash, file);
const own = "scripts/checkpoint-asyncify-storage-full-live.mjs", ownBytes = await read(own);
const waitMs = 15600000, recordedAt = new Date().toISOString();
const proof = { recordedAt, status: "actual-changed-full-driver-chromium-and-sampler-native-birth-qualified-live-not-acceptance",
  live: { path: livePath, sha256: sha(liveBytes) }, supervisorPath, observations,
  sourceCount: 365, sourceArchive: live.sourceArchive, allActualSourcePinsMatchCurrent: true,
  checkpointAtObservation: { path: checkpointPath, bytes: checkpointBytes.length, sha256: sha(checkpointBytes),
    baseline: checkpoint.baseline, coverageThroughSequence: checkpoint.coverageThroughSequence,
    conversionAcceptance: checkpoint.conversionAcceptance, completeRunCoverageProven: checkpoint.completeRunCoverageProven },
  hostPreflight: live.launchHostPreflight, protectedBefore: live.protectedBefore, requestedRuns: 3,
  estimatedFirstConversionHours: [4, 4.5], estimateBasis: "Last actual full attempt processed244859 frames in12628.74561s; original296160 frames imply about4.24h, not a speed guarantee",
  waitMs, plannedObservationAfter: new Date(Date.parse(recordedAt) + waitMs).toISOString(), waitMechanism: "interruptible clock sleep, not rapid polling or unavailable app scheduler",
  noDuplicateOrRestart: true, disposableDataStillOwnedByLiveFinally: true,
  fullOriginalAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false, controlledSpeedGainProven: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
const output = `evidence/${stamp}-asyncify-storage-full-wait-plan.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, waitMs, plannedObservationAfter: proof.plannedObservationAfter, liveNativeIdentities: observations.length }));
