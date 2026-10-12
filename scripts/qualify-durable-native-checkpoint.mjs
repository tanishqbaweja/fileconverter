// Real Windows observer + separately labelled synthetic abrupt-exit control.
// No browser conversion, fixture media, native converter or acceptance shortcut.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startClockFencedNativeBudgetFailureObserver } from "./lib/durable-native-failure-observer.mjs";
import { boundedTail } from "./lib/bounded-supervisor-journal.mjs";

assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const prefix = `outputs/reports/${stamp}-durable-control`, read = file => readFile(path.join(root, file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const sources = ["scripts/qualify-durable-native-checkpoint.mjs", "scripts/lib/durable-native-memory-journal.mjs",
  "scripts/lib/durable-native-failure-observer.mjs", "scripts/lib/native-memory-peaks.mjs", "scripts/lib/persistent-chromium-memory.mjs",
  "scripts/lib/chromium-private-memory.mjs", "scripts/lib/clock-fenced-native-failure-observer.mjs",
  "scripts/lib/native-budget-failure-observer.mjs", "scripts/lib/parallel-memory-observer.mjs", "scripts/lib/native-memory-bursts.mjs",
  "scripts/lib/native-receipt-clock-fence.mjs", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/owned-process-exit-observation.mjs",
  "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/windows-tree-monitor.cs", "scripts/lib/bounded-supervisor-journal.mjs", "tests/durable-native-memory-journal.test.mjs"];
const sourcePreimages = Object.fromEntries(await Promise.all(sources.map(async file => {
  const bytes = await read(file); assert.ok(bytes.length <= 131072); return [file, { bytes: bytes.length, sha256: sha(bytes), data: bytes.toString("base64") }];
})));
const runtime = await createOwnedRuntimeScratch("durable-checkpoint-control-");
const proof = { recordedAt: null, status: "durable-checkpoint-control-incomplete", failure: null,
  sourcePreimages, postSourcePins: null, nativeControl: null, abruptControl: null, cleanup: {},
  conversionAcceptance: false, chromiumBlankBaselineMeasured: false, appOrWindowsJobAbortSurvivalVerified: false,
  noBrowserConversionPerformed: true, noNativeConverterUsed: true, noOriginalVideoRead: true, noProcessesKilled: true };
const files = [], owned = [];
let observer = null, child = null, childClosed = null, nativeReport = null;
const launch = args => {
  const stderr = boundedTail(8192);
  const processChild = spawn(process.execPath, args, { cwd: root, env: runtime.env, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
  processChild.stderr.on("data", bytes => stderr.append(bytes));
  const closed = new Promise(resolve => { processChild.once("error", error => resolve({ code: null, signal: null, error: String(error) }));
    processChild.once("close", (code, signal) => resolve({ code, signal, error: null })); });
  return { child: processChild, closed, stderr };
};
const retain = async (file, label) => {
  const bytes = await readFile(file); assert.ok(bytes.length <= 2097152); const value = JSON.parse(bytes), compressed = gzipSync(bytes, { level: 9 });
  assert.deepEqual(gunzipSync(compressed), bytes); const output = prefix + `-${label}-native-checkpoint.json.gz`;
  await writeFile(path.join(root, output), compressed, { flag: "wx" });
  return { value, archive: { path: output, bytes: compressed.length, sha256: sha(compressed), restoredBytes: bytes.length, restoredSha256: sha(bytes) } };
};
try {
  const running = launch(["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0));setTimeout(()=>process.exit(0),30000)"]);
  child = running.child; childClosed = running.closed;
  const identity = await queryProcessIdentity(child.pid); assert.ok(identity && identity.parentPid === process.pid); owned.push(identity);
  const file = path.join(root, prefix + "-windows-native-checkpoint.json"); files.push(file);
  observer = await startClockFencedNativeBudgetFailureObserver(child.pid, runtime.directory, {
    checkpointPath: file, getBlankBaseline: () => null, onFailure: async () => { throw new Error("No fabricated baseline or conversion phase allowed"); },
  });
  observer.setPhase("owned-node-os-acquisition-control"); await wait(3000); await observer.flushCheckpoint(); observer.healthy();
  observer.setPhase("finally-cleanup"); await observer.stop(); nativeReport = observer.report(); observer = null;
  const retained = await retain(file, "windows");
  assert.equal(retained.value.baseline, null); assert.equal(retained.value.status, "observer-closed-not-conversion-acceptance");
  assert.equal(retained.value.coverageThroughSequence, nativeReport.sequence); assert.ok(nativeReport.sequence >= 20);
  assert.equal(nativeReport.error, null); assert.equal(retained.value.conversionAcceptance, false);
  for (const phase of nativeReport.phases) {
    const persisted = retained.value.native.phases.find(row => row.phase === phase.phase);
    assert.ok(persisted); assert.equal(persisted.validSamples, phase.validSamples); assert.equal(persisted.unavailableSamples, phase.unavailableSamples);
    assert.deepEqual(persisted.peak, phase.peak); assert.deepEqual(persisted.rssPeak, phase.rssPeak);
  }
  owned.push(retained.value.identities.monitor);
  proof.nativeControl = { rootIsOwnedNodeNotChromium: true, rootIdentity: identity, monitorIdentity: retained.value.identities.monitor,
    observedSamples: nativeReport.sequence, error: nativeReport.error, everyPhasePeakMatchesOriginalObserver: true,
    baseline: null, archived: retained.archive, nativeReceiptFenceUnchanged: true, primaryAcceptance: false };
  child.stdin.end(); assert.deepEqual(await childClosed, { code: 0, signal: null, error: null }); child = null; childClosed = null;

  const abruptFile = path.join(root, prefix + "-abrupt-native-checkpoint.json"); files.push(abruptFile);
  const fixture = `import {createDurableNativeMemoryJournal} from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/durable-native-memory-journal.mjs")).href)};
const journal=await createDurableNativeMemoryJournal(90001,${JSON.stringify(abruptFile)});
journal.setPhase('synthetic-abrupt-control',Date.now());
const timestamp=new Date().toISOString();
journal.consume({overflow:false,observerCpuMs:1,samples:[{sequence:1,timestamp,completedAt:timestamp,nativeElapsedMs:1,sampleError:null,privateBytes:1234567,rssBytes:2345678,processes:[{pid:90001,parentPid:1,creationFileTime:'133444444444444444',createdAt:'2023-01-01T00:00:00.000Z',privateBytes:1234567,rssBytes:2345678}]}]});
await journal.flush();process.exit(19);`;
  proof.abruptControl = { syntheticSamplesOnly: true, completed: false,
    executedFixture: { sha256: sha(fixture), preimage: Buffer.from(fixture).toString("base64") } };
  const abrupt = launch(["--input-type=module", "-e", fixture]);
  // Short abrupt-exit fixture may finish before CIM; rely on its owned ChildProcess
  // close event, never kill a PID or pretend a missing birth was sampled.
  const ended = await abrupt.closed; proof.abruptControl.childExit = ended; proof.abruptControl.stderr = abrupt.stderr.snapshot();
  assert.deepEqual(ended, { code: 19, signal: null, error: null }, Buffer.from(proof.abruptControl.stderr.tailBase64, "base64").toString());
  const recovered = await retain(abruptFile, "abrupt");
  assert.equal(recovered.value.status, "observer-live-not-terminal-acceptance"); assert.equal(recovered.value.coverageThroughSequence, 1);
  assert.equal(recovered.value.native.phases.find(row => row.phase === "synthetic-abrupt-control").peak[3], 1234567);
  assert.equal(recovered.value.baseline, null); assert.equal(recovered.value.completeRunCoverageProven, false);
  proof.abruptControl = { ...proof.abruptControl, completed: true, closedJournalBeforeExit: false,
    checkpointRecoveredAfterChildAbruptExit: true, archive: recovered.archive,
    executedFixture: { sha256: sha(fixture), preimage: Buffer.from(fixture).toString("base64") },
    unavailableBirthIdentityNotInvented: true, primaryAcceptance: false };
} catch (error) { proof.failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally {
  try {
    if (observer) { try { observer.setPhase("finally-cleanup"); } finally { await observer.stop(); } }
    if (child) { child.stdin.end(); await childClosed; }
    proof.cleanup.ownedBirthChecks = await Promise.all(owned.map(async identity => {
      const checked = await observeOwnedProcessExit(identity); assert.equal(checked.status, "owned-identity-absent"); return checked;
    }));
    proof.cleanup.rawCheckpointsRemoved = [];
    for (const file of files) {
      let info; try { info = await lstat(file); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
      assert.ok(info.isFile() && !info.isSymbolicLink()); assert.equal(path.dirname(file), path.join(root, "outputs/reports"));
      await unlink(file); await assert.rejects(access(file), { code: "ENOENT" }); proof.cleanup.rawCheckpointsRemoved.push(path.relative(root, file));
      await assert.rejects(access(file + ".next"), { code: "ENOENT" });
    }
    await runtime.close(); proof.cleanup.runtimeRemoved = true; await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    proof.postSourcePins = Object.fromEntries(await Promise.all(sources.map(async file => [file, sha(await read(file))])));
    assert.deepEqual(proof.postSourcePins, Object.fromEntries(Object.entries(sourcePreimages).map(([file, row]) => [file, row.sha256])));
  } catch (error) { proof.failure = `${proof.failure ?? ""}\nCleanup: ${error.stack ?? error}`.slice(0, 12288); process.exitCode = 1; }
}
if (!proof.failure) proof.status = "durable-native-checkpoint-windows-and-synthetic-abrupt-controls-pass-not-browser-acceptance";
proof.recordedAt = new Date().toISOString(); const output = `evidence/${stamp}-durable-native-checkpoint-control.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, failure: proof.failure, realOsSamples: proof.nativeControl?.observedSamples ?? null,
  abruptCheckpointRecovered: proof.abruptControl?.checkpointRecoveredAfterChildAbruptExit ?? false, noBrowserConversion: true }));
assert.equal(proof.failure, null);
