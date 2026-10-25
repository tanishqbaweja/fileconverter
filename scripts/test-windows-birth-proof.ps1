param([Parameter(Mandatory=$true)][string]$SourcePath, [Parameter(Mandatory=$true)][string]$SourceSha256)
$ErrorActionPreference = 'Stop'
$probeMonitor = $null
try {
  $sourceHash = [Security.Cryptography.SHA256]::Create()
  $sourceStream = [IO.File]::OpenRead($SourcePath)
  try { $actualHash = [BitConverter]::ToString($sourceHash.ComputeHash($sourceStream)).Replace('-', '').ToLowerInvariant() }
  finally { $sourceStream.Dispose(); $sourceHash.Dispose() }
  if ($actualHash -ne $SourceSha256) { throw 'Probe source changed' }
  Add-Type -Path $SourcePath -ReferencedAssemblies 'System.dll','System.Core.dll','System.Management.dll'
  $searcher = New-Object System.Management.ManagementObjectSearcher('root\cimv2', "SELECT ProcessId, Name, CreationDate FROM Win32_Process WHERE Name = 'csrss.exe'")
  $protected = $null
  try {
    $rows = $searcher.Get()
    try {
      foreach ($row in $rows) {
        try {
          $born = [System.Management.ManagementDateTimeConverter]::ToDateTime([string]$row['CreationDate']).ToUniversalTime().ToFileTimeUtc()
          if ($null -eq $protected -or $born -lt $protected.BirthFileTime) {
            $protected = @{ ProcessId=[uint32]$row['ProcessId']; Name=[string]$row['Name']; BirthFileTime=$born }
          }
        } finally { $row.Dispose() }
      }
    } finally { $rows.Dispose() }
  } finally { $searcher.Dispose() }
  if ($null -eq $protected) { throw 'No protected process fixture available; no proof claimed' }
  $ownBirth = [System.Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().ToFileTimeUtc()
  $interval = [WithinDiagnostics.ProcessBirthEvidence]::Query([uint32]$protected.ProcessId)
  if ($interval[1] -ge $ownBirth) { throw 'Protected fixture must actually predate this process' }
  $probeMonitor = New-Object WithinDiagnostics.WindowsTreeMonitor($PID, 100)
  $instanceFlags = [Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::NonPublic
  $staticFlags = [Reflection.BindingFlags]::Static -bor [Reflection.BindingFlags]::NonPublic
  $read = $probeMonitor.GetType().GetMethod('Read', $instanceFlags)
  $open = $probeMonitor.GetType().GetMethod('OpenProcess', $staticFlags)
  $close = $probeMonitor.GetType().GetMethod('CloseHandle', $staticFlags)
  $handle = $open.Invoke($null, @([uint32]0x1000, $false, [uint32]$protected.ProcessId))
  if ($handle -ne [IntPtr]::Zero) {
    [void]$close.Invoke($null, @($handle))
    throw 'Protected-read denial precondition unavailable; do not label fallback covered'
  }
  # Deliberately synthetic parent link using REAL protected-process timestamps.
  # This exercises exactly the stale-parent fault, not a conversion acceptance.
  $foreign = $read.Invoke($probeMonitor, @([uint32]$protected.ProcessId, [uint32]$PID, 'guard-fixture', [long]$ownBirth, [long]0))
  if ($null -ne $foreign) { throw 'Proven stale protected process was incorrectly measured' }
  $owned = $read.Invoke($probeMonitor, @([uint32]$PID, [uint32]0, 'owned-probe', [long]0, [long]$ownBirth))
  if ($null -eq $owned -or $owned.row.privateBytes -le 0) { throw 'Actual owned process missing from memory read' }
  $stillUnavailable = $false
  try {
    [void]$read.Invoke($probeMonitor, @([uint32]$protected.ProcessId, [uint32]$PID, 'guard-fixture', [long]0, [long]$interval[0]))
  } catch {
    $cause = $_.Exception
    while ($null -ne $cause.InnerException) { $cause = $cause.InnerException }
    $stillUnavailable = $cause -is [System.ComponentModel.Win32Exception] -and $cause.Message -match '^OpenProcess '
  }
  if (-not $stillUnavailable) { throw 'An unexcluded unreadable process must still fail, not disappear' }
  $checks = @(
    ([WithinDiagnostics.ProcessBirthEvidence]::ForeignReason(100,109,109,0) -eq $null),
    ([WithinDiagnostics.ProcessBirthEvidence]::ForeignReason(100,109,110,0) -eq 'predates-current-parent'),
    ([WithinDiagnostics.ProcessBirthEvidence]::ForeignReason(100,109,0,105) -eq $null),
    ([WithinDiagnostics.ProcessBirthEvidence]::ForeignReason(100,109,0,110) -eq 'previous-owned-pid-reused'),
    ([WithinDiagnostics.ProcessBirthEvidence]::ForeignReason(100,100,100,100) -eq $null)
  )
  if ($checks -contains $false) { throw 'Birth precision boundary policy failed' }
  $invalidRejected = $false
  try { [void][WithinDiagnostics.ProcessBirthEvidence]::ForeignReason(100,110,0,0) } catch { $invalidRejected = $true }
  if (-not $invalidRejected) { throw 'Birth precision cannot be invented or widened' }
  $queryUnavailable = $false
  try { [void][WithinDiagnostics.ProcessBirthEvidence]::Query(0) } catch { $queryUnavailable = $true }
  if (-not $queryUnavailable) { throw 'Invalid PID must not yield fabricated birth' }
  $proofs = $probeMonitor.Drain().ownershipProofs
  $found = @($proofs | Where-Object { $_.pid -eq $protected.ProcessId -and $_.source -eq 'Win32_Process.CreationDate' -and $_.reason -eq 'predates-current-parent' })
  if ($found.Count -ne 1) { throw 'Actual protected fallback proof missing' }
  [ordered]@{ status='passed-real-native-birth-guard-probe'; protectedPid=[int]$protected.ProcessId;
    protectedName=$protected.Name; protectedQueryActuallyDenied=$true; protectedBirthEarliest=[string]$interval[0];
    protectedBirthLatest=[string]$interval[1]; ownBirth=[string]$ownBirth; proof=$found[0];
    realOwnedMemoryRead=$true; unexcludedUnreadableStillFails=$stillUnavailable;
    microsecondIntervalBoundaries=$true; invalidBirthAndPidRejected=$true;
    syntheticParentLinkOnly=$true; conversionAcceptance=$false; noApplicationsClosed=$true
  } | ConvertTo-Json -Compress -Depth 5
} finally {
  if ($null -ne $probeMonitor) { $probeMonitor.Dispose() }
}
