import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const TS_PACKET_BYTES = 188;
const FIXTURE_PMT_PID = 0x1000;

export async function transportInspectionFixtures() {
  const genuine = await readFile(new URL("../../fixtures/media/transport-source.mpegts", import.meta.url));
  const insertion = TS_PACKET_BYTES * 64;
  // Keep the fixture's AAC and H.264 packets inside the 64 KiB head window.
  const repeatCount = 96;
  const pmt = genuine.subarray(2 * TS_PACKET_BYTES, 3 * TS_PACKET_BYTES);
  const packetPid = (packet, offset = 0) => ((packet[offset + 1] & 31) << 8) | packet[offset + 2];
  assert.equal(pmt[0], 0x47);
  assert.equal(packetPid(pmt), FIXTURE_PMT_PID);
  const dense = Buffer.concat([
    genuine.subarray(0, insertion), ...Array(repeatCount).fill(pmt), genuine.subarray(insertion),
  ]);
  // The PMT section and its CRC do not change. Maintain the counter on its PID
  // after inserting repetitions; all video/audio packets are left untouched.
  let expectedContinuity = pmt[3] & 15;
  for (let offset = 0; offset + TS_PACKET_BYTES <= dense.length; offset += TS_PACKET_BYTES) {
    if (packetPid(dense, offset) !== FIXTURE_PMT_PID) continue;
    dense[offset + 3] = (dense[offset + 3] & 0xf0) | expectedContinuity;
    expectedContinuity = (expectedContinuity + 1) & 0x0f;
  }
  return [
    { name: "genuine", bytes: genuine },
    { name: "many-repeated-program-maps", bytes: dense },
    { name: "program-map-without-elementary-packets", bytes: genuine.subarray(0, 3 * TS_PACKET_BYTES) },
  ];
}

export function observedTransportBlob(bytes) {
  const blob = new Blob([bytes]);
  const reads = [];
  return {
    size: blob.size,
    reads,
    slice(start, end) {
      reads.push([start, end]);
      return blob.slice(start, end);
    },
  };
}

// Used only around a single awaited local inspection, never in the application.
export async function countTransportPrefixAllocations(inspect, source) {
  const original = globalThis.Uint8Array;
  let allocations = 0;
  globalThis.Uint8Array = new Proxy(original, {
    construct(target, args) {
      if (args[0] === 32 * 1024) allocations += 1;
      return Reflect.construct(target, args);
    },
  });
  try {
    const inspection = await inspect(source, "mpeg-ts");
    return { inspection, allocations };
  } finally {
    globalThis.Uint8Array = original;
  }
}
