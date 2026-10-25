param([Parameter(Mandatory=$true)][string]$SourcePath,
  [Parameter(Mandatory=$true)][string]$SourceSha256,
  [Parameter(Mandatory=$true)][int]$RootPid, [int]$IntervalMs=100)
$ErrorActionPreference = 'Stop'
$monitor = $null
try {
  $sourceHash = [Security.Cryptography.SHA256]::Create()
  $sourceStream = [IO.File]::OpenRead($SourcePath)
  try { $actualHash = [BitConverter]::ToString($sourceHash.ComputeHash($sourceStream)).Replace('-', '').ToLowerInvariant() }
  finally { $sourceStream.Dispose(); $sourceHash.Dispose() }
  if ($actualHash -ne $SourceSha256) { throw 'Observer source changed' }
  Add-Type -Path $SourcePath -ReferencedAssemblies 'System.dll','System.Core.dll','System.Management.dll'
  $monitor = New-Object WithinDiagnostics.WindowsTreeMonitor($RootPid, $IntervalMs)
  [Console]::Out.WriteLine('{"ready":true}')
  while ($null -ne ($request = [Console]::ReadLine())) {
    if ($request -eq 'quit') { break }
    if ($request -ne 'drain') { throw 'Unknown monitor request' }
    [Console]::Out.WriteLine(($monitor.Drain() | ConvertTo-Json -Compress -Depth 6))
  }
} finally {
  if ($null -ne $monitor) { $monitor.Dispose() }
}
