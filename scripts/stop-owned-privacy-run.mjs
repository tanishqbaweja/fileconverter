// Explicit recovery for one failed, birth-verified owned Playwright run only.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
const execute = promisify(execFile), root = path.resolve(import.meta.dirname, ".."), work = path.join(root, "work");
const [pidText, parentText, birth, configArgument] = process.argv.slice(2);
assert.equal(process.argv.length, 6); assert.equal(process.platform, "win32");
const pid = Number(pidText), parentPid = Number(parentText), config = path.resolve(configArgument);
assert.ok(Number.isSafeInteger(pid) && pid > 0 && Number.isSafeInteger(parentPid) && parentPid > 0);
assert.ok(Number.isFinite(Date.parse(birth)));
assert.equal(path.dirname(path.dirname(config)), work);
assert.match(path.basename(path.dirname(config)), /^privacy-validation-[a-zA-Z0-9]{6}$/);
assert.equal(path.basename(config), "playwright.config.mjs");
const identity = { pid, parentPid, createdAt: birth }, canonical = value => value.toLowerCase();
const report = { schemaVersion: 1, scope: "Stop one known-failed owned runner; never a conversion/acceptance pass",
  expectedIdentity: identity, config, recordedAt: new Date().toISOString(), processTree: [], profiles: [], cleanup: [], status: "inspecting" };
const reportFile = path.join(root, "evidence", new Date().toISOString().replaceAll(/[:.]/g, "-") + "-owned-privacy-stop.json");
let reportIdentity;
try {
  const current = await queryReliableProcessIdentity(pid);
  if (current === null) { report.status = "runner-already-absent-no-kill"; }
  else {
    assert.deepEqual(current, identity, "Exact launch PID/parent/birth, not merely a matching command");
    const script = `$ErrorActionPreference='Stop'; $ownedRows=Get-CimInstance Win32_Process; $ownedIds=[System.Collections.Generic.HashSet[int]]::new(); [void]$ownedIds.Add(${pid}); do {$ownedAdded=$false; foreach($ownedRow in $ownedRows){if($ownedIds.Contains([int]$ownedRow.ParentProcessId) -and $ownedIds.Add([int]$ownedRow.ProcessId)){$ownedAdded=$true}}}while($ownedAdded); ConvertTo-Json -InputObject @($ownedRows | Where-Object {$ownedIds.Contains([int]$_.ProcessId)} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');name=$_.Name;command=$_.CommandLine}}) -Compress`;
    const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 15000, maxBuffer: 262144 });
    const rows = JSON.parse(stdout); assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length < 128);
    const launch = rows.find(row => row.pid === pid); assert.equal(launch.parentPid, parentPid); assert.equal(launch.createdAt, birth);
    assert.ok(launch.command.includes(config), "Runner must use this exact owned config");
    report.processTree = rows.map(({ command: ignored, ...row }) => { assert.ok(ignored); return row; });
    for (const browser of rows.filter(row => row.name === "chrome.exe" && row.command.includes("--headless") && !row.command.includes("--type="))) {
      const match = browser.command.match(/--user-data-dir=(?:"([^"]+)"|([^"]+))/); assert.ok(match);
      const profile = path.dirname(path.resolve(match[1] ?? match[2]));
      assert.equal(canonical(path.dirname(profile)), canonical(work)); assert.match(path.basename(profile), /^po-[a-zA-Z0-9]{6}$/);
      assert.equal(canonical(await realpath(profile)), canonical(profile));
      const info = await lstat(profile, { bigint: true }); assert.ok(info.isDirectory() && !info.isSymbolicLink());
      report.profiles.push({ path: profile, dev: String(info.dev), ino: String(info.ino), browserIdentity: browser.pid });
    }
    await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    reportIdentity = await lstat(reportFile, { bigint: true });
    assert.deepEqual(await queryReliableProcessIdentity(pid), identity);
    await execute("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
    for (const row of rows) report.cleanup.push(await observeOwnedProcessExit({ pid: row.pid, parentPid: row.parentPid, createdAt: row.createdAt }));
    assert.ok(report.cleanup.every(row => row.status === "owned-identity-absent"));
    for (const profile of report.profiles) {
      let info; try { info = await lstat(profile.path, { bigint: true }); } catch (error) { if (error.code === "ENOENT") { profile.alreadyRemoved = true; continue; } throw error; }
      assert.ok(info.isDirectory() && !info.isSymbolicLink()); assert.equal(String(info.dev), profile.dev); assert.equal(String(info.ino), profile.ino);
      assert.equal(canonical(await realpath(profile.path)), canonical(profile.path));
      assert.equal(canonical(path.dirname(profile.path)), canonical(work));
      await rm(profile.path, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 }); profile.removed = true;
    }
    report.status = "failed-runner-stopped-owned-tree-absent-recorded-profiles-removed";
  }
} catch (error) { report.status = "failed-recovery"; report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString();
  if (reportIdentity) {
    const current = await lstat(reportFile, { bigint: true }); assert.ok(current.isFile() && !current.isSymbolicLink());
    assert.equal(current.dev, reportIdentity.dev); assert.equal(current.ino, reportIdentity.ino);
  }
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n", reportIdentity ? {} : { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, reportFile), status: report.status, processes: report.cleanup.length, profiles: report.profiles }));
}
