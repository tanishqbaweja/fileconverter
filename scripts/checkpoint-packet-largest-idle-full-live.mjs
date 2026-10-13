// One real native-birth checkpoint, then the user's ETA-length wait; no polling.
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { queryProcessIdentity } from "./lib/owned-process-exit-observation.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/packet-largest-idle-full-sources.mjs";
assert.equal(process.argv.length, 3);
const supervisorPath = process.argv[2];
assert.match(supervisorPath, /^evidence\/\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-packet-largest-idle-supervisor-full\.json$/);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
assert.equal(supervisor.status, "running"); assert.equal(supervisor.childExit, null);
const matches = [];
for (const name of (await readdir(path.join(root, "evidence"))).filter(name => /-packet-largest-idle-full-live\.json$/.test(name))) {
  const bytes = await read("evidence/" + name), live = JSON.parse(bytes);
  if (live.driverIdentity?.parentPid === supervisor.childIdentity.pid && Date.parse(live.driverIdentity.createdAt) >= Date.parse(supervisor.startedAt))
    matches.push({ live, path: "evidence/" + name, bytes });
}
assert.equal(matches.length, 1, "Identify exact launch; missing/stale JSON is never restart authority");
const { live, path: livePath, bytes: liveBytes } = matches[0], stamp = path.basename(livePath).slice(0, 24);
assert.equal(live.executions, 1); assert.equal(Object.keys(live.sourcePins).length, 439); assert.equal(live.requestedRuns, 3);
assert.equal(live.qualifiedMedia.sourceCount, 210); assert.equal(live.composition.manifest.aggregateWasmMemoryBytes, 50331648);
const restored = await materializeLayeredFullSourceArchive(root, live.sourceArchive); assert.deepEqual(restored.sourcePins, live.sourcePins);
const checkpoints = [];
for (const name of (await readdir(path.join(root, "outputs/reports"))).filter(name => /-private-mpeg2-packet-largest-idle-full-native-100ms-native-checkpoint\.json$/.test(name))) {
  const bytes = await read("outputs/reports/" + name), value = JSON.parse(bytes);
  if (value.identities?.root?.parentPid === live.driverIdentity.pid && Date.parse(value.identities.root.createdAt) >= Date.parse(live.driverIdentity.createdAt))
    checkpoints.push({ path: "outputs/reports/" + name, bytes, value });
}
assert.equal(checkpoints.length, 1, "Actual driver's Chromium/sampler checkpoint required");
const checkpoint = checkpoints[0];
const roles = [["supervisor", supervisor.supervisorIdentity], ["parent", supervisor.childIdentity], ["driver", live.driverIdentity],
  ["headless-chromium", checkpoint.value.identities.root], ["native-sampler", checkpoint.value.identities.monitor]];
const observations = await Promise.all(roles.map(async ([role, expected]) => {
  const current = await queryProcessIdentity(expected.pid);
  assert.ok(current && current.parentPid === expected.parentPid && Math.abs(Date.parse(current.createdAt) - Date.parse(expected.createdAt)) < 1,
    `${role}: exact native birth must be live now`);
  return { role, expected, current, acquiredAt: new Date().toISOString(), sameNativeBirth: true };
}));
for (const [file, hash] of Object.entries(live.sourcePins)) assert.equal(sha(await read(file)), hash, file);
const waitMs = 14400000, recordedAt = new Date().toISOString(), own = "scripts/checkpoint-packet-largest-idle-full-live.mjs", ownBytes = await read(own);
const output = `evidence/${stamp}-packet-largest-idle-full-wait-plan.json`;
const proof = { recordedAt, status: "actual-changed-full-driver-browser-sampler-native-birth-qualified-live-not-acceptance",
  live: { path: livePath, sha256: sha(liveBytes) }, supervisor: { path: supervisorPath, sha256: sha(supervisorBytes) }, observations,
  sourceCount: 439, sourceArchive: live.sourceArchive, allPreimagesRecovered: restored.allPreimagesRecovered,
  checkpointAtObservation: { path: checkpoint.path, bytes: checkpoint.bytes.length, sha256: sha(checkpoint.bytes), baseline: checkpoint.value.baseline,
    coverageThroughSequence: checkpoint.value.coverageThroughSequence, conversionAcceptance: checkpoint.value.conversionAcceptance,
    completeRunCoverageProven: checkpoint.value.completeRunCoverageProven },
  hostPreflight: live.launchHostPreflight, protectedBefore: live.protectedBefore, requestedRuns: 3,
  estimatedFirstConversionHours: [3.4,4.5], estimateBasis: "Previous full250053 frames/10430.703055s =>296160 original frames about3.43h; older slower attempts about4-4.25h. Changed short timing mixed; no proven speed gain. Validation/three repeats add time.",
  waitMs, plannedObservationAfter: new Date(Date.parse(recordedAt) + waitMs).toISOString(),
  waitMechanism: "one interruptible ETA-length clock sleep, no rapid agent polling", noDuplicateOrRestart: true,
  fullOriginalAcceptance: false, publicAcceptance: false, completeChromiumMemoryAcceptance: false, controlledSpeedGainProven: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, waitMs, plannedObservationAfter: proof.plannedObservationAfter, liveNativeIdentities: observations.length, sourceCount: 439 }));
