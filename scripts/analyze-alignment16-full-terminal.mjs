// Failure-only audit: preserve the failed receipt; late absence is a new fact.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/layered-full-source-archive.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
export async function alignment16FailureInspectorRecipe() {
  const prior = await readFile(path.join(root, "scripts/analyze-allocation-attempt-full-terminal.mjs"), "utf8");
  assert.equal(sha(prior), "ffa67e0e605a0bd04fced94043679276ce8d2944650df0b25e86c6551f92f0cc");
  const edits = [];
  for (const match of prior.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    const relative = match[1] === "./lib/composite-allocation-failure-record.mjs" ? "./lib/alignment16-full-recipe.mjs" : match[1];
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", relative)).href)}`)]);
  }
  edits.push(["9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039", "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014"],
    ["actual-original-alignment-fallback-failure-not-acceptance", "actual-original-alignment16-first-malloc-failure-not-acceptance"],
    ["Audit exact compiled upstream alignment allocator/request arithmetic before any changed allocation fix or expensive original retry",
      "Audit actual alignment16 first-malloc capacity and allocation lifetimes; do not repeat this failed configuration"]);
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, prior);
  return { generated, edits, previousSha256: sha(prior), generatedSha256: sha(generated) };
}
export async function inspectFailedAlignment16Full(raw) {
  const recipe = await alignment16FailureInspectorRecipe();
  const inspectorModule = await import(`data:text/javascript;base64,${Buffer.from(recipe.generated).toString("base64")}`);
  return inspectorModule.inspectFailedAllocationAttemptFull(raw);
}
async function main(file) {
  assert.equal(file, "evidence/2026-10-11T18-50-12-867Z-alignment16-original-full-terminal.json");
  const ownFiles = ["scripts/analyze-alignment16-full-terminal.mjs", "tests/alignment16-full-terminal.test.mjs"];
  const sourcePins = {}, sourcePreimages = {};
  for (const name of ownFiles) { const bytes = await read(name); sourcePins[name] = sha(bytes); sourcePreimages[name] = { encoding: "base64", data: bytes.toString("base64") }; }
  const terminalBytes = await read(file), terminal = JSON.parse(terminalBytes);
  assert.equal(terminal.status, "failed-or-incomplete"); assert.equal(terminal.executions, 1); assert.deepEqual(terminal.cleanupErrors, []);
  assert.equal(typeof terminal.failure, "string"); assert.ok(terminal.failure.includes("false !== true"));
  const archive = terminal.candidate.compressedReport, zipped = await read(archive.path);
  assert.equal(zipped.length, archive.bytes); assert.equal(sha(zipped), archive.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(bytes.length, archive.restoredBytes); assert.equal(sha(bytes), archive.restoredSha256);
  const raw = JSON.parse(bytes), sources = await materializeLayeredFullSourceArchive(root, terminal.sourceArchive);
  assert.equal(Object.keys(sources.sourcePins).length, 326);
  assert.deepEqual(sources.sourcePins, terminal.sourcePins); assert.deepEqual(raw.sourceHashes, terminal.sourcePins); assert.deepEqual(terminal.postSourcePins, terminal.sourcePins);
  assert.deepEqual(raw.manifest, terminal.composition.manifest); assert.equal(terminal.candidate.actualExitCode, 1);
  const result = await inspectFailedAlignment16Full(raw);
  assert.equal(result.failedAllocation.phase, "fast-malloc-pending"); assert.equal(result.failedAllocation.failedIndividualAllocationBytes, 399383);
  // Do not rewrite the historical timeout as a successful cleanup.
  assert.equal(raw.cleanup.sampledChromeRootStopped, false); assert.equal(raw.cleanup.errors.length, 1);
  assert.equal(raw.cleanup.chromeRootExitObservation.status, "owned-identity-not-proven-absent");
  const identities = [terminal.driverIdentity, ...raw.ownedLaunches.map(row => row.identity), ...raw.nativeMemory.identities];
  const absence = [];
  for (const identity of identities) {
    const observed = await observeOwnedProcessExit(identity); assert.equal(observed.status, "owned-identity-absent"); absence.push(observed);
  }
  for (const directory of [terminal.wrapper, terminal.candidateDirectory, raw.runtimeDirectory]) {
    assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" });
  }
  assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter); assert.equal(terminal.protectedAfter.bytes, 2958573265);
  assert.equal(terminal.protectedAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
  for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped"]) assert.equal(raw.cleanup[field], true);
  const postSourcePins = {}; for (const name of ownFiles) postSourcePins[name] = sha(await read(name)); assert.deepEqual(postSourcePins, sourcePins);
  const proof = { recordedAt: new Date().toISOString(), terminal: { path: file, sha256: sha(terminalBytes) }, rawArchive: archive,
    sourceArchive: terminal.sourceArchive, all326CurrentPrePostPreimageJoins: true, sourcePins, postSourcePins, sourcePreimages,
    inspectorRecipe: await alignment16FailureInspectorRecipe(), result, originalCallerFailure: terminal.failure,
    historicalCleanup: raw.cleanup, lateIndependentlyObservedOwnedAbsence: absence,
    historicalCleanupTimeoutNotRewritten: true, ownedScratchAbsentNow: true, stockUiRestored: true,
    protectedBefore: terminal.protectedBefore, protectedAfter: terminal.protectedAfter,
    redundantRawDeletedAfterByteExactArchive: terminal.candidate.rawRemovedAfterLosslessArchive, failure: null };
  const output = file.replace("-terminal.json", "-terminal-analysis.json");
  await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, status: result.status, elapsedMs: result.elapsedMs, frames: result.frames,
    outputBytes: result.generatedPartialOutputBytes, observedIncrementalPrivateMiB: result.native.observedIncrementalPrivateMiB, identitiesAbsentNow: absence.length }));
}
if (path.resolve(process.argv[1] ?? "") === import.meta.filename) { assert.equal(process.argv.length, 3); await main(process.argv[2]); }
