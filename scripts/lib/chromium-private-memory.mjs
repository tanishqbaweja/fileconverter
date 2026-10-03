import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export function summarizeTree(processes, rootPid) {
  if (!Array.isArray(processes) || !processes.some((entry) => entry.pid === rootPid) ||
      processes.some((entry) => !Number.isFinite(entry.privateBytes) || entry.privateBytes <= 0 ||
        !Number.isFinite(entry.rssBytes) || entry.rssBytes < 0)) {
    throw new Error("Incomplete or invalid Chromium process-tree sample");
  }
  return { processes, privateBytes: processes.reduce((sum, entry) => sum + entry.privateBytes, 0),
    rssBytes: processes.reduce((sum, entry) => sum + entry.rssBytes, 0) };
}

export async function sampleChromiumTree(rootPid) {
  if (process.platform !== "win32" || !Number.isSafeInteger(rootPid) || rootPid <= 0) {
    throw new Error("This private-memory sampler requires Windows and a valid owned Chromium root PID");
  }
  const script = `
$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,CreationDate,PrivatePageCount,WorkingSetSize)
$ids = New-Object 'System.Collections.Generic.HashSet[int]'
[void]$ids.Add(${rootPid})
$createdAt = @{}
foreach ($entry in $all) { $createdAt[[int]$entry.ProcessId] = [datetime]$entry.CreationDate }
do {
  $changed = $false
  foreach ($entry in $all) {
    $parentId = [int]$entry.ParentProcessId
    if ($ids.Contains($parentId) -and -not $ids.Contains([int]$entry.ProcessId) -and
        $createdAt.ContainsKey($parentId) -and [datetime]$entry.CreationDate -ge [datetime]$createdAt[$parentId]) {
      [void]$ids.Add([int]$entry.ProcessId); $changed = $true
    }
  }
} while ($changed)
@($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | ForEach-Object {
  $type = 'browser'; if ($_.CommandLine -match '--type=([^ ]+)') { $type = $Matches[1] }
  $utilitySubtype = $null; if ($_.CommandLine -match '--utility-sub-type=([^ ]+)') { $utilitySubtype = $Matches[1] }
  $sandboxType = $null; if ($_.CommandLine -match '--service-sandbox-type=([^ ]+)') { $sandboxType = $Matches[1] }
  [pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;type=$type;
    utilitySubtype=$utilitySubtype;sandboxType=$sandboxType;
    createdAt=([datetime]$_.CreationDate).ToUniversalTime().ToString('o');
    privateBytes=[double]$_.PrivatePageCount;rssBytes=[double]$_.WorkingSetSize}
}) | ConvertTo-Json -Compress
`;
  const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 5000 });
  const parsed = JSON.parse(stdout);
  return summarizeTree(Array.isArray(parsed) ? parsed : [parsed], rootPid);
}

export function stableWindow(samples, minimumElapsedMs = 8000) {
  const window = samples.slice(-5);
  if (window.length !== 5 || samples.at(-1).elapsedMs - samples[0].elapsedMs < minimumElapsedMs ||
      window.some((sample) => sample.privateBytes == null || sample.rssBytes == null)) return null;
  const median = [...window.map((sample) => sample.privateBytes)].sort((a, b) => a - b)[2];
  const spread = Math.max(...window.map((sample) => sample.privateBytes)) - Math.min(...window.map((sample) => sample.privateBytes));
  if (spread > median * 0.02) return null;
  return { stable: true, privateBytes: median, spreadBytes: spread,
    rssBytes: [...window.map((sample) => sample.rssBytes)].sort((a, b) => a - b)[2],
    firstTimestamp: window[0].timestamp, lastTimestamp: window.at(-1).timestamp,
    sampleCount: samples.length, minimumElapsedMs };
}
