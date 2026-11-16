import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { conversionProfiles, publicProfilesFor, isPublishedProfile, temporarilyWithheldProfilesFor } from "../lib/capability-registry.ts";
import { preMkvPublicationHoldRegistry } from "../scripts/lib/reviewed-mkv-publication-hold.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const profile = conversionProfiles.find(p => p.id === "mkv-to-mp4");
const gate = JSON.parse(await readFile("evidence/2026-11-16-mkv-publication-hold.json"));
test("timestamp-defective MKV copy route is withheld but remains available to explicit private qualification", () => {
  assert.equal(profile.public, false); assert.equal(profile.automatedTestStatus, "failed");
  assert.equal(profile.maxTestedBytes, gate.historicalPublicEvidence.maxTestedBytes);
  assert.equal(publicProfilesFor("mkv").some(p => p.id === profile.id), false);
  assert.equal(publicProfilesFor("mkv", true).some(p => p.id === profile.id), true);
  assert.deepEqual(temporarilyWithheldProfilesFor("mkv").map(p => p.id), [profile.id]);
  assert.match(profile.publicationHold.reason, /250 MiB.*repeat-memory/);
  assert.match(profile.publicationHold.reason, /remains planned/);
  assert.equal(isPublishedProfile({ ...profile, public: true, automatedTestStatus: "passed" }), false,
    "Hold must be explicitly resolved, not bypassed by toggling pass/public flags");
  assert.equal(isPublishedProfile({ ...profile, public: true, automatedTestStatus: "passed", publicationHold: undefined }), true);
});
test("hold is supported by exact retained failure receipts and unchanged shipping binary", async () => {
  for (const item of gate.evidence) assert.equal(sha(await readFile(item.path)), item.sha256);
  const binary = await readFile("public/engines/remux/within-direct.wasm");
  assert.equal(binary.length, 1197888); assert.equal(sha(binary), "306d44ccae312668190f6e43c6e51867981e75868c6c45a7267f1b24e3ce30d0");
  assert.deepEqual(profile.publicationHold.evidenceFiles, gate.evidence.map(item => item.path));
  assert.equal(gate.qualifiedLosslessMkvMp4StillRequiredByGoal, true);
  for (const key of ["wholeGoalComplete", "publicEngineReplacement", "fidelityMemoryPrivacyOrCleanupThresholdsWeakened", "otherPublicProfilesOrNativeEnginesChanged"]) assert.equal(gate[key], false);
});
test("active evidence changes only by removing held route; full historical entry remains recoverable", async () => {
  const beforeBytes = execFileSync("git", ["show", "149e6241be68dbd8dbfdff25627c14ebb99f302f:evidence/public-profile-evidence.json"], { windowsHide: true });
  assert.equal(sha(beforeBytes), gate.historicalPublicManifestSha256);
  const before = JSON.parse(beforeBytes), current = JSON.parse(await readFile("evidence/public-profile-evidence.json"));
  assert.deepEqual(gate.historicalPublicEvidence, before.profiles.find(p => p.profileId === profile.id));
  assert.deepEqual(current, { ...before, profiles: before.profiles.filter(p => p.profileId !== profile.id) });
  assert.equal(before.profiles.length, 403); assert.equal(current.profiles.length, 402);
  assert.equal(conversionProfiles.filter(isPublishedProfile).length, 402);
});

test("historical registry adapter reverses only exact reviewed hold; unrelated mutations remain rejected", async () => {
  const current = await readFile("lib/capability-registry.ts");
  const before = execFileSync("git", ["show", "149e6241:lib/capability-registry.ts"], { windowsHide: true });
  assert.deepEqual(preMkvPublicationHoldRegistry(current), before);
  const unrelated = Buffer.concat([current, Buffer.from("\n// unrelated edit\n")]);
  assert.equal(preMkvPublicationHoldRegistry(unrelated), unrelated);
  const runner = await readFile("scripts/qualify-installed-compatibility.mjs", "utf8");
  assert.ok(runner.indexOf("Compatibility plan needs a newly validated public replacement") < runner.indexOf("const id = process.argv[2]"));
});
