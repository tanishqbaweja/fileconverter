// Parse only bounded diagnostic numbers. No missing/invalid sample becomes zero.
export function parseVp9AllocationFailure(message) {
  const missing = reason => ({ available: false, reason, site: null, width: null, height: null, border: null, alignment: null,
    frameRequestBytes: null, wasmHeapBytes: null, wasmHeapMaximumBytes: null, allocatorManagedBytes: null,
    allocatorFreeBytes: null, allocatorUnclaimedBytes: null, frameRequestIsUnderlyingMallocRequest: false,
    primaryWholeBrowserMemoryMetric: false, conversionSucceeded: false });
  if (typeof message !== "string" || message.length > 32768) return missing("Missing or oversized bounded native error");
  const rows = [...message.matchAll(/\[within-vp9-alloc\] w=(\d+) h=(\d+) b=(\d+) a=(\d+) frame=(\d+) heap=(\d+) max=(\d+) managed=(\d+) free=(\d+) unclaimed=(\d+)/g)];
  if (rows.length !== 1) return missing("One unambiguous failure-time allocation sample required");
  const values = rows[0].slice(1).map(Number);
  if (!values.every(value => Number.isSafeInteger(value) && value >= 0)) return missing("Invalid numeric allocation sample");
  const [width,height,border,alignment,frameRequestBytes,wasmHeapBytes,wasmHeapMaximumBytes,allocatorManagedBytes,allocatorFreeBytes,allocatorUnclaimedBytes] = values;
  if (!(width > 0 && width <= 32768 && height > 0 && height <= 32768 && frameRequestBytes > 0 &&
    wasmHeapBytes > 0 && wasmHeapMaximumBytes >= wasmHeapBytes && wasmHeapMaximumBytes <= 4294967296 &&
    allocatorManagedBytes <= wasmHeapBytes && allocatorFreeBytes <= allocatorManagedBytes &&
    allocatorUnclaimedBytes <= wasmHeapMaximumBytes)) return missing("Contradictory allocation statistics, not a valid heap observation");
  const sites = [...message.matchAll(/FB allocation failed site=(scale-hi|scale-lo|new-frame) w=(\d+) h=(\d+) b=(\d+) a=(\d+)/g)];
  const unique = new Set(sites.map(row => row[0]));
  const site = unique.size === 1 && sites.every(row => row.slice(2).map(Number).every((value,index) => value === values[index])) ? sites[0][1] : null;
  return { available: true, reason: null, site, width,height,border,alignment,frameRequestBytes,wasmHeapBytes,wasmHeapMaximumBytes,
    allocatorManagedBytes,allocatorFreeBytes,allocatorUnclaimedBytes,
    frameRequestIsUnderlyingMallocRequest: false, statsSampledBeforeErrorFormatting: true,
    primaryWholeBrowserMemoryMetric: false, conversionSucceeded: false };
}
