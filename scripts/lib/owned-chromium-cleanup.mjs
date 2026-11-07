// A taskkill exit code is not proof of either live processes or clean teardown.
// Preserve it, then independently reconcile ALL observed PIDs. Never kill a
// child individually, a reused root, or anything selected by executable name.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { queryReliableProcessIdentity } from "./reliable-owned-identity.mjs";
import { boundedErrorDetails } from "./bounded-error-details.mjs";
const execute = promisify(execFile);
export async function queryObservedPidCensus(pids) {
  assert.ok(Array.isArray(pids) && pids.length > 0 && pids.length <= 512);
  assert.ok(pids.every(pid => Number.isSafeInteger(pid) && pid > 0));
  const filter = pids.map(pid => `ProcessId = ${pid}`).join(" OR ");
  const script = `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress`;
  const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 5000, maxBuffer: 262144 });
  const rows = JSON.parse(stdout);
  assert.ok(Array.isArray(rows) && rows.length <= pids.length);
  const seen = new Set();
  for (const row of rows) {
    assert.ok(pids.includes(row.pid) && !seen.has(row.pid) && Number.isSafeInteger(row.parentPid) && Number.isFinite(Date.parse(row.createdAt)));
    seen.add(row.pid);
  }
  return rows;
}
export async function cleanupOwnedChromium({ identity, observedPids, disconnect,
  queryIdentity = queryReliableProcessIdentity, census = queryObservedPidCensus,
  kill = pid => execute("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 32768 }),
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  assert.ok(Number.isSafeInteger(identity?.pid) && identity.pid > 0 && Number.isSafeInteger(identity.parentPid) && Number.isFinite(Date.parse(identity.createdAt)));
  const pids = [...new Set([...observedPids, identity.pid])];
  assert.ok(pids.length <= 512 && pids.every(pid => Number.isSafeInteger(pid) && pid > 0));
  const result = { status: "owned-observed-pids-not-proven-absent", identity, observedPids: pids,
    observations: [], commandErrors: [], rootKillAttempted: false, rootIdentityMatched: false,
    individualChildKills: false, pidReuseTreatedConservatively: true, maximumCensusQueries: 4 };
  try { await disconnect(); } catch (error) { result.disconnectErrors = boundedErrorDetails(error); }
  try {
    const current = await queryIdentity(identity.pid);
    if (current) {
      assert.deepEqual(current, identity, "Never terminate a changed/reused owned root identity");
      result.rootIdentityMatched = true; result.rootKillAttempted = true;
      try { await kill(identity.pid); } catch (error) { result.commandErrors = boundedErrorDetails(error); }
    }
  } catch (error) { result.identityErrors = boundedErrorDetails(error); }
  for (let n = 0; n < result.maximumCensusQueries; n++) {
    const row = { acquiredAt: new Date().toISOString(), current: null, unavailable: null };
    result.observations.push(row);
    try {
      const current = await census(pids);
      // Validate injected/production observers alike. Undefined is NOT absence.
      assert.ok(Array.isArray(current) && current.length <= pids.length);
      assert.ok(current.every(p => pids.includes(p.pid) && Number.isSafeInteger(p.parentPid) && Number.isFinite(Date.parse(p.createdAt))));
      row.current = current;
      if (current.length === 0) { result.status = "owned-observed-pids-absent"; return result; }
    } catch (error) { row.unavailable = boundedErrorDetails(error); }
    if (n + 1 < result.maximumCensusQueries) await pause(250);
  }
  return result;
}
