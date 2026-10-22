param(
  [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$RootPid,
  [Parameter(Mandatory=$true)][ValidatePattern('^\d{17,19}$')][string]$RootCreatedFileTime
)
$ErrorActionPreference = 'Stop'
$expectedBirth = [long]$RootCreatedFileTime
$birth = [DateTime]::FromFileTimeUtc($expectedBirth)
$begin = $birth.AddMilliseconds(178000)
$end = $birth.AddMilliseconds(188000)
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
function Assert-OwnedRoot {
  $process = [Diagnostics.Process]::GetProcessById($RootPid)
  try {
    if ($process.StartTime.ToUniversalTime().ToFileTimeUtc() -ne $expectedBirth) { throw 'Owned browser PID reused' }
  } finally { $process.Dispose() }
}
Assert-OwnedRoot
[Console]::Out.WriteLine('{"event":"ready","windowStartMs":178000,"windowEndMs":188000,"maximumQueries":32}')
while ([DateTime]::UtcNow -lt $begin) {
  $remaining = [Math]::Ceiling(($begin - [DateTime]::UtcNow).TotalMilliseconds)
  if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int][Math]::Min(60000,$remaining)) }
}
$queries = 0
while ([DateTime]::UtcNow -lt $end -and $queries -lt 32) {
  Assert-OwnedRoot
  $startedAt = [DateTime]::UtcNow
  # Query only direct children of this birth-verified owned Chrome process.
  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$RootPid")
  $queries++
  foreach ($entry in $children) {
    if ($entry.CreationDate.ToUniversalTime() -lt $begin) { continue }
    $child = $null
    try {
      $child = [Diagnostics.Process]::GetProcessById([int]$entry.ProcessId)
      $actualBirth = $child.StartTime.ToUniversalTime().ToFileTimeUtc()
      $cimBirth = $entry.CreationDate.ToUniversalTime().ToFileTimeUtc()
      # CIM stores microseconds; native StartTime/FileTime stores100ns.
      if ([Math]::Truncate([decimal]$actualBirth/10) -ne [Math]::Truncate([decimal]$cimBirth/10)) { continue }
      if ($actualBirth -lt $expectedBirth) { continue }
      $key = ([string]$entry.ProcessId) + ':' + ([string]$actualBirth)
      if (-not $seen.Add($key)) { continue }
      if ($seen.Count -gt 32) { throw 'Startup child metadata row cap' }
      $commandLine = [string]$entry.CommandLine
      if ($commandLine.Length -gt 16384) { throw 'Startup child command-line cap' }
      $kind = 'unknown'; if ($commandLine -match '--type=([^ ]+)') { $kind = $Matches[1] }
      $subtype = $null; if ($commandLine -match '--utility-sub-type=([^ ]+)') { $subtype = $Matches[1] }
      $sandbox = $null; if ($commandLine -match '--service-sandbox-type=([^ ]+)') { $sandbox = $Matches[1] }
      [Console]::Out.WriteLine(([pscustomobject]@{
        event='child'; pid=[int]$entry.ProcessId; parentPid=[int]$entry.ParentProcessId;
        createdAt=[DateTime]::FromFileTimeUtc($actualBirth).ToString('o'); creationFileTime=[string]$actualBirth;
        queryStartedAt=$startedAt.ToString('o'); observedAt=[DateTime]::UtcNow.ToString('o');
        type=$kind; utilitySubtype=$subtype; sandboxType=$sandbox; commandLine=$commandLine
      } | ConvertTo-Json -Compress))
    } catch [System.ArgumentException] {
      # An already-exited short-lived child is unavailable, never a fake type.
    } finally { if ($null -ne $child) { $child.Dispose() } }
  }
  Start-Sleep -Milliseconds 150
}
[Console]::Out.WriteLine(([pscustomobject]@{event='complete';queries=$queries;rows=$seen.Count;completedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress))
