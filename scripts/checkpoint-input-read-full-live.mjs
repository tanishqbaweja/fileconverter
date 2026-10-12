// One read-only native-birth checkpoint, then ETA-length interruptible wait.
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { queryProcessIdentity } from "./lib/owned-process-exit-observation.mjs";
assert.equal(process.argv.length, 3);
const supervisorPath = process.argv[2];
assert.match(supervisorPath, /^evidence\/\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-input-read-supervisor-full\.json$/);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
assert.equal(supervisor.status, "running"); assert.equal(supervisor.childExit, null);
const paths = (await readdir(path.join(root, "evidence"))).filter(name => /-input-read-full-live\.json$/.test(name));
const matches = [];
for (const name of paths) {
  const bytes = await read("evidence/" + name), live = JSON.parse(bytes);
  if (live.driverIdentity?.parentPid === supervisor.childIdentity.pid && Date.parse(live.driverIdentity.createdAt) >= Date.parse(supervisor.startedAt))
    matches.push({ live, path: "evidence/" + name, bytes });
}
assert.equal(matches.length, 1, "One exact driver's launch only, never infer liveness or restart from a missing status");
const { live, path: livePath, bytes: liveBytes } = matches[0], stamp = path.basename(livePath).slice(0, 24);
assert.equal(live.executions, 1); assert.equal(Object.keys(live.sourcePins).length, 380); assert.equal(live.requestedRuns, 3);
assert.equal(live.qualifiedMedia.sourceCount, 162); assert.equal(live.composition.manifest.aggregateWasmMemoryBytes, 50331648);
const names = (await readdir(path.join(root, "outputs/reports"))).filter(name => /-private-mpeg2-input-read-full-native-100ms-native-checkpoint\.json$/.test(name));
const checkpoints = [];
for (const name of names) {
  const bytes = await read("outputs/reports/" + name), value = JSON.parse(bytes);
  if (value.identities?.root?.parentPid === live.driverIdentity.pid && Date.parse(value.identities.root.createdAt) >= Date.parse(live.driverIdentity.createdAt))
    checkpoints.push({ path: "outputs/reports/" + name, bytes, value });
}
assert.equal(checkpoints.length, 1, "Exact actual driver's Chromium and original sampler checkpoint required");
const checkpoint = checkpoints[0];
const roles = [["supervisor", supervisor.supervisorIdentity], ["parent", supervisor.childIdentity], ["driver", live.driverIdentity],
  ["headless-chromium", checkpoint.value.identities.root], ["native-sampler", checkpoint.value.identities.monitor]];
const observations = await Promise.all(roles.map(async ([role, expected]) => {
  const current = await queryProcessIdentity(expected.pid);
  assert.ok(current && current.parentPid === expected.parentPid && Math.abs(Date.parse(current.createdAt) - Date.parse(expected.createdAt)) < 1,
    `${role}: exact native birth must be live now, not status/lock inference`);
  return { role, expected, current, acquiredAt: new Date().toISOString(), sameNativeBirth: true };
}));
for (const [file, hash] of Object.entries(live.sourcePins)) assert.equal(sha(await read(file)), hash, file);
const waitMs = 15600000, recordedAt = new Date().toISOString(), own = "scripts/checkpoint-input-read-full-live.mjs", ownBytes = await read(own);
const output = `evidence/${stamp}-input-read-full-wait-plan.json`;
const proof = { recordedAt, status: "actual-full-input-diagnostic-driver-browser-sampler-native-birth-qualified-live-not-acceptance",
  live: { path: livePath, sha256: sha(liveBytes) }, supervisor: { path: supervisorPath, sha256: sha(supervisorBytes) }, observations,
  sourceCount: 380, sourceArchive: live.sourceArchive, allActualSourcePinsMatchCurrent: true,
  checkpointAtObservation: { path: checkpoint.path, bytes: checkpoint.bytes.length, sha256: sha(checkpoint.bytes),
    baseline: checkpoint.value.baseline, coverageThroughSequence: checkpoint.value.coverageThroughSequence,
    conversionAcceptance: checkpoint.value.conversionAcceptance, completeRunCoverageProven: checkpoint.value.completeRunCoverageProven },
  hostPreflight: live.launchHostPreflight, protectedBefore: live.protectedBefore, requestedRuns: 3,
  estimatedFirstConversionHours: [4, 4.5], estimateBasis: "Previous full attempts218892 frames/10609.542385s and244859/12628.74561s; original296160 frames imply approximately4-4.25h, not a speed guarantee or three-run ETA",
  waitMs, plannedObservationAfter: new Date(Date.parse(recordedAt) + waitMs).toISOString(),
  waitMechanism: "one interruptible ETA-length clock sleep, no rapid agent polling", noDuplicateOrRestart: true,
  inputReaderRetriesAdded: false, originalLongLivedCauseProven: false, fullOriginalAcceptance: false, publicAcceptance: false,
  completeChromiumMemoryAcceptance: false, controlledSpeedGainProven: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, waitMs, plannedObservationAfter: proof.plannedObservationAfter, liveNativeIdentities: observations.length, sourceCount: 380 }));
