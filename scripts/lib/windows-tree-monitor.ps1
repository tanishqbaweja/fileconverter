param([Parameter(Mandatory=$true)][int]$RootPid, [int]$IntervalMs=100)
$ErrorActionPreference = 'Stop'
$monitor = $null
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-tree-monitor.cs')
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
