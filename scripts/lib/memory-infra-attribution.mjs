import assert from "node:assert/strict";

// Chrome trace values are hexadecimal strings; unavailable values stay null.
export function traceHexBytes(value) {
  if (typeof value !== "string" || !/^(?:0x)?[0-9a-f]+$/i.test(value)) return null;
  const parsed = BigInt(/^0x/i.test(value) ? value : `0x${value}`);
  return parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : null;
}

export function summarizeMemoryInfraTrace(trace, rows) {
  const events = trace.traceEvents;
  assert.ok(Array.isArray(events) && events.length <= 100000);
  const phases = rows.filter(row => row.memoryDump?.success);
  assert.ok(phases.length > 0 && phases.length <= 16);
  const names = new Map(events.filter(event => event.name === "process_name")
    .map(event => [event.pid, event.args?.name ?? null]));
  return phases.map(row => {
    const guid = row.memoryDump.dumpGuid;
    const starts = events.filter(event => event.name === "GlobalMemoryDump" && event.ph === "b" && event.args?.dump_guid === guid);
    assert.equal(starts.length, 1, `Unique global interval required for ${guid}`);
    const start = starts[0];
    const ends = events.filter(event => event.name === "GlobalMemoryDump" && event.ph === "e" && event.pid === start.pid &&
      event.id2?.local === start.id2?.local && event.ts >= start.ts);
    assert.equal(ends.length, 1); const end = ends[0];
    // Serialized periodic_interval IDs are NOT the requestMemoryDump GUID.
    // Join using the explicit global GUID and its validated trace-time interval.
    const selected = events.filter(event => event.ph === "v" && event.ts >= start.ts && event.ts <= end.ts && event.args?.dumps);
    assert.ok(selected.length > 0);
    const processes = new Map();
    for (const event of selected) {
      assert.ok(Number.isSafeInteger(event.pid));
      let process = processes.get(event.pid);
      if (!process) {
        const os = row.processes?.find(p => p.pid === event.pid);
        process = { pid: event.pid, traceName: names.get(event.pid) ?? null,
          osType: os?.type ?? null, osPrivateBytesBeforeDump: os?.privateBytes ?? null,
          tracePrivateFootprintBytes: null, allocators: {} }; processes.set(event.pid, process);
      }
      const dump = event.args.dumps;
      if (dump.process_totals) process.tracePrivateFootprintBytes = traceHexBytes(dump.process_totals.private_footprint_bytes);
      for (const [name, allocator] of Object.entries(dump.allocators ?? {})) {
        if (name.includes("/") && !/^(?:v8\/(?:main|workers)\/heap\/code_space|blink_gc\/(?:main|workers))$/.test(name) && !name.includes("wasm")) continue;
        assert.ok(Object.keys(process.allocators).length < 64);
        process.allocators[name] = Object.fromEntries(Object.entries(allocator.attrs ?? {})
          .filter(([, attr]) => attr.type === "scalar" && attr.units === "bytes")
          .map(([key, attr]) => [key, traceHexBytes(attr.value)]));
      }
    }
    return { phase: row.phase, requestDumpGuid: guid, serializedDumpIds: [...new Set(selected.map(event => event.id))],
      traceIntervalMicroseconds: [start.ts, end.ts], processes: [...processes.values()],
      allocatorValuesOverlap: true, summedAllocatorTotal: null, acceptanceMetric: false };
  });
}
