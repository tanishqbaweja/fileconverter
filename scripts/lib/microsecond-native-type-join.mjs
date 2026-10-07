// CIM timestamps here end in a zero 100ns digit, whereas the native monitor
// keeps that digit. Join at the observed CIM microsecond precision, not by PID
// alone or a millisecond tolerance. Preserve both exact original birth strings.
import assert from "node:assert/strict";
import { joinUiLargestBlinkTypes } from "./ui-largest-blink-join.mjs";
export function microsecondBirth(value) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{6,7})Z$/.exec(value ?? "");
  if (!match || !Number.isFinite(Date.parse(match[1] + "Z"))) return null;
  return match[1] + "." + match[2].slice(0, 6) + "Z";
}
export function joinMicrosecondNativeTypes(traces) {
  assert.equal(traces.length, 2); assert.ok(traces.every(t => t.status === "completed-diagnostic" && t.dumps.length === 1));
  const original = traces.map(t => t.dumps[0]);
  const [before, after] = original;
  const pairs = [];
  const rows = original.map(row => ({ ...row, processes: row.processes.map(p => ({ ...p })) }));
  for (const row of rows) assert.equal(new Set(row.processes.map(p => p.pid)).size, row.processes.length, "No ambiguous native PID rows");
  for (const current of rows[1].processes) {
    const prior = rows[0].processes.find(p => p.pid === current.pid && p.parentPid === current.parentPid);
    const a = microsecondBirth(prior?.createdAt), b = microsecondBirth(current.createdAt);
    if (!prior || !a || a !== b) continue;
    pairs.push({ pid: current.pid, parentPid: current.parentPid,
      beforeCreatedAt: prior.createdAt, afterCreatedAt: current.createdAt,
      matchedMicrosecondBirth: a, timestampsExactlyEqual: prior.createdAt === current.createdAt,
      beforeCreationFileTime: prior.creationFileTime ?? null, afterCreationFileTime: current.creationFileTime ?? null });
    // Only validated pairs get a common comparison value; originals untouched.
    prior.createdAt = a; current.createdAt = b;
  }
  const valid = new Set(pairs.map(pair => pair.pid));
  for (const row of rows) row.processes = row.processes.filter(p => valid.has(p.pid));
  const joined = joinUiLargestBlinkTypes(traces, rows);
  return joined.map(row => ({ ...row, birthPrecision: "observed-CIM-microsecond",
    birthComparison: pairs.find(pair => pair.pid === row.pid),
    beforePhase: before.phase, afterPhase: after.phase, exactOriginalBirthStringsRetained: true,
    subMicrosecondPidReuseCannotBeResolved: true, notACallsiteOrPeakSnapshot: true }));
}
