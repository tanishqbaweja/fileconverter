import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { headerStagedReference, readHeaderStagedReference } from "../scripts/lib/mkv-header-staged-reference.mjs";
import { reconcileChromiumBirths } from "../scripts/lib/reconcile-chromium-births.mjs";
const read = f => readFile(new URL(`../${f}`, import.meta.url)), sha = b => createHash("sha256").update(b).digest("hex");
test("actual unmodified production-staged success/startup-cancel/copy-write-failure/recovery binds full output content to current core with no JS/media/writer overlay", async () => {
  const bytes = await read(headerStagedReference.file); assert.equal(sha(bytes), headerStagedReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms, ref = readHeaderStagedReference(bytes, r.candidateBuild, a.releaseWorker.sha256);
  assert.equal(a.releaseWorker.sha256, "9935a1ff6ee00c14197da2dabf0a36b81e893d379601a6ccaaf1e4372521c9cf");
  assert.equal(a.productionWorkerBinding.bytes, 424331); assert.equal(a.productionWorkerBinding.maximumReadBytes, 16384);
  assert.equal(a.releaseWorker.requests, 6); assert.equal(a.workerResponses, 0);
  assert.equal(ref.cancellationScope, "startup-before-first-media-read"); assert.equal(ref.largeFileAcceptance, false);
  assert.equal(r.qualifiedCodeDelivery.remoteAvailabilityClaimed, false); assert.equal(r.qualifiedCodeDelivery.freshBuildClaimed, false);
  assert.equal(a.browserCleanup.observedPids.length, 42); assert.equal(a.browserCleanup.status, "owned-observed-pids-not-proven-absent");
  assert.equal(a.birthCleanup.allObservedBirthsAbsent, true); assert.equal(a.birthCleanup.noProcessesKilled, true);
  assert.deepEqual(a.birthCleanup.reused.map(p => p.pid), [29668]); assert.deepEqual(a.birthCleanup.unresolved, []);
  assert.throws(() => readHeaderStagedReference(Buffer.from("wrong receipt"), r.candidateBuild, a.releaseWorker.sha256));
  assert.throws(() => readHeaderStagedReference(bytes, r.candidateBuild, "0".repeat(64)));
});
test("actual production-staged complete Chrome tree peak rederived from every retained native row and SAME original blank, cleanup remains separately measured", async () => {
  const r = JSON.parse(await read(headerStagedReference.file)), [a] = r.arms, packed = await read(a.archive.file);
  assert.equal(sha(packed), "5cdf8135711f4f1b5a55b8d6e36cd153e40e3e8c5c59acd80d47ad793ad29ec8"); assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 16 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
  const samples = JSON.parse(raw), selected = samples.filter(s => Date.parse(s.timestamp) >= a.memory.start && Date.parse(s.timestamp) <= a.memory.end);
  const valid = selected.filter(s => s.sampleError === null && Number.isFinite(s.privateBytes));
  assert.equal(valid.length, 196); assert.equal(selected.length - valid.length, 0);
  for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  assert.equal((Math.max(...valid.map(s => s.privateBytes)) - a.blank.privateBytes) / 1048576, 163.72265625);
  assert.equal(a.memory.incrementalPrivateMiB, 163.72265625); assert.equal(a.memory.cleanupAboveIdleMiB, 59.41015625);
  const current = a.browserCleanup.observations.at(-1).current;
  const proof = reconcileChromiumBirths({ identity: a.identity, observedPids: a.browserCleanup.observedPids, samples, current });
  assert.deepEqual(proof, a.birthCleanup); // whole native birth history, not PID existence alone
  const stale = structuredClone(current); stale[0].createdAt = a.birthCleanup.reused[0].observedBirths[0];
  assert.equal(reconcileChromiumBirths({ identity: a.identity, observedPids: a.browserCleanup.observedPids, samples, current: stale }).allObservedBirthsAbsent, false);
});
test("UNIT ONLY: distinct original production-staged3+1 gate inherits content only through whole-output/current-core identity, keeps original fixture and real scratch accounting", async () => {
  const source = (await read("scripts/qualify-mkv-direct-reuse.mjs")).toString();
  assert.match(source, /headerStagedOriginalRepeats = process.argv\[2\] === "--hevc-header-parser-production-staged-original-repeats-cache"/);
  assert.match(source, /\(headerStagedIntegration && !headerStagedOriginalRepeats\) \|\| largeScaling/);
  assert.match(source, /readHeaderStagedReference\(bytes, candidate.proof, baseline.productionWorkerSha256\)/);
  assert.match(source, /await arm\(headerStagedOriginalRepeats \? "edit-list" : "reuse", protectedPath, null, baseline, count\)/);
  assert.match(source, /headerProtectedRetention \? \[MKV_RETENTION_LIMITS.jobs\] : \[3, 1\]/);
  assert.match(source, /headerStagedOriginalRepeats \? row.metrics.outputBytes : 0/);
  assert.match(source, /protectedMode \? 8192/); // original8GiB preflight covers stage+one final output, not accumulation
  assert.match(source, /assert.equal\(row.validation.fullVideoDecode, false\)/);
  assert.match(source, /row.validation.fullVideoDecodeInheritedThroughWholeOutputIdentity = true/);
  assert.match(source, /passed-unmodified-production-staged-original-repeats-not-public-acceptance/);
});
