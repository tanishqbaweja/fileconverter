import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { queryProcessIdentity } from "./lib/owned-process-exit-observation.mjs";

assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = "2026-10-12T09-52-49-560Z";
const read = file => readFile(path.join(root, file)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportPath = `evidence/${stamp}-packet-cache-supervisor-probe.json`, reportBytes = await read(reportPath), report = JSON.parse(reportBytes);
const observedPath = `evidence/${stamp}-supervisor-post-launcher-exit-observation.json`, observedBytes = await read(observedPath), observed = JSON.parse(observedBytes);
assert.equal(report.mode, "--probe"); assert.equal(report.status, "command-failed-not-conversion-acceptance");
assert.equal(report.failure, null); assert.deepEqual(report.childExit, { code: 7, signal: null, error: null });
assert.equal(report.runtimeRemoved, true); await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
assert.equal(path.dirname(report.runtimeDirectory), path.join(root, "work"));
assert.equal(report.conversionAcceptance, false); assert.equal(report.nativeMemorySamplesRecovered, false);
assert.ok(Date.parse(report.finishedAt) - Date.parse(report.startedAt) >= 15000);
assert.equal(observed.report, reportPath); assert.equal(observed.journalStatusObserved, "running");
assert.deepEqual(observed.rows, [report.supervisorIdentity, report.childIdentity]);
assert.ok(!observed.rows.some(row => row.pid === report.supervisorIdentity.parentPid));
assert.equal(observed.launcherPidAbsent, true);
for (const stream of [report.stdout, report.stderr]) {
  assert.equal(stream.totalBytes, 1048576); assert.equal(stream.retainedBytes, 65536); assert.equal(stream.limit, 65536);
  assert.equal(Buffer.from(stream.tailBase64, "base64").length, 65536);
}
assert.deepEqual(Buffer.from(report.stdout.tailBase64, "base64"), Buffer.alloc(65536, 97));
assert.deepEqual(Buffer.from(report.stderr.tailBase64, "base64"), Buffer.alloc(65536, 98));
assert.ok(reportBytes.length <= 262144);
for (const [file, pin] of Object.entries(report.sourcePins)) {
  const bytes = await read(file); assert.equal(sha(bytes), pin); assert.deepEqual(bytes, Buffer.from(report.sourcePreimages[file], "base64"));
}
const exitChecks = await Promise.all([report.supervisorIdentity, report.childIdentity].map(async identity => {
  const current = await queryProcessIdentity(identity.pid);
  assert.ok(current === null || current.createdAt !== identity.createdAt, "Owned birth identity must be absent; never kill a reused PID");
  return { identity, current, ownedBirthAbsent: true };
}));
const own = "scripts/audit-packet-cache-supervisor-probe.mjs", ownBytes = await read(own);
const output = `evidence/${stamp}-packet-cache-supervisor-probe-audit.json`;
const proof = { recordedAt: new Date().toISOString(), status: "bounded-hidden-supervisor-ordinary-launcher-exit-control-pass",
  report: { path: reportPath, bytes: reportBytes.length, sha256: sha(reportBytes) }, observation: { path: observedPath, sha256: sha(observedBytes) },
  exitChecks, runtimeRemoved: true, fixedTailBytesPerStream: 65536, bytesDrainedPerStream: 1048576,
  childExitSevenExpectedFailurePreserved: true, fiveExecutedSourcePreimagesJoined: true,
  conversionAcceptance: false, appAbortSurvivalVerified: false, nativeMemoryRecoveryVerified: false,
  noProcessesKilled: true, noConversionRelaunched: true, ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, journalBytes: reportBytes.length, runtimeRemoved: true }));
