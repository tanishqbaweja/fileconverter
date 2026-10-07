// Read-only bounded identity observation, never kill or assume failed queries=0.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function queryProcessIdentity(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  const script = `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | ForEach-Object { @{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`;
  const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 3000, maxBuffer: 16384 });
  const rows = JSON.parse(stdout); assert.ok(Array.isArray(rows) && rows.length <= 1);
  for (const row of rows) assert.ok(row.pid === pid && Number.isSafeInteger(row.parentPid) && Number.isFinite(Date.parse(row.createdAt)));
  return rows[0] ?? null;
}
export async function observeOwnedProcessExit(identity, { query = queryProcessIdentity, now = Date.now,
  pause = delay, maximumMs = 10000, maximumQueries = 10 } = {}) {
  assert.ok(Number.isSafeInteger(identity?.pid) && identity.pid > 0 && Number.isSafeInteger(identity.parentPid));
  assert.ok(Number.isFinite(Date.parse(identity.createdAt)));
  assert.ok(maximumMs > 0 && maximumMs <= 10000 && maximumQueries > 0 && maximumQueries <= 10);
  const startedAt = now(), observations = [];
  for (let i = 0; i < maximumQueries && now() - startedAt <= maximumMs; i++) {
    let current = null, unavailable = null;
    try {
      current = await query(identity.pid);
      assert.ok(current === null || (current.pid === identity.pid && Number.isSafeInteger(current.parentPid) &&
        Number.isFinite(Date.parse(current.createdAt))), "Unavailable or invalid identity is not absence");
    }
    catch (error) { unavailable = String(error).slice(0, 512); }
    const sameBirth = current && current.pid === identity.pid &&
      Math.abs(Date.parse(current.createdAt) - Date.parse(identity.createdAt)) < 1;
    const sameParent = current?.parentPid === identity.parentPid;
    observations.push({ acquiredAt: new Date(now()).toISOString(), current, unavailable,
      ownedIdentityPresent: unavailable ? null : Boolean(sameBirth), sameParent: current ? sameParent : null });
    if (!unavailable && (!current || (Number.isFinite(Date.parse(current.createdAt)) && !sameBirth)))
      return { status: "owned-identity-absent", identity, observations, pidReused: Boolean(current),
        elapsedMs: now() - startedAt, noProcessesKilled: true, unavailableIsNotZero: true };
    await pause(100);
  }
  return { status: "owned-identity-not-proven-absent", identity, observations, pidReused: false,
    elapsedMs: now() - startedAt, noProcessesKilled: true, unavailableIsNotZero: true };
}
