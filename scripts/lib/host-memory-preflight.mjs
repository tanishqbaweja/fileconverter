// Read-only LOCAL stress-harness safety, not a browser profile's250MiB metric.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
export const STRESS_HOST_MINIMUM_BYTES = 2 * 1024 ** 3;
export function checkStressHostMemory(value) {
  assert.ok(value && Number.isSafeInteger(value.freePhysicalKiB) && value.freePhysicalKiB > 0 &&
    Number.isSafeInteger(value.freeVirtualKiB) && value.freeVirtualKiB > 0,
  "Available host memory is unavailable; never assume failed queries=zero or enough");
  const physicalBytes = value.freePhysicalKiB * 1024, virtualBytes = value.freeVirtualKiB * 1024;
  assert.ok(Number.isSafeInteger(physicalBytes) && Number.isSafeInteger(virtualBytes));
  return { acquiredAt: value.acquiredAt ?? null, freePhysicalBytes: physicalBytes,
    freeVirtualBytes: virtualBytes, requiredPhysicalBytes: STRESS_HOST_MINIMUM_BYTES,
    requiredVirtualBytes: STRESS_HOST_MINIMUM_BYTES,
    safeToStart: physicalBytes >= STRESS_HOST_MINIMUM_BYTES && virtualBytes >= STRESS_HOST_MINIMUM_BYTES,
    primaryConversionLimitMiB: 250, primaryMemoryFormulaChanged: false, noProcessesKilled: true };
}
export async function inspectStressHostMemory() {
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference = 'Stop'; $conversionHostMemory = Get-CimInstance Win32_OperatingSystem; @{ freePhysicalKiB = [long]$conversionHostMemory.FreePhysicalMemory; freeVirtualKiB = [long]$conversionHostMemory.FreeVirtualMemory; acquiredAt = [datetime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress"],
  { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
  return checkStressHostMemory(JSON.parse(stdout));
}
