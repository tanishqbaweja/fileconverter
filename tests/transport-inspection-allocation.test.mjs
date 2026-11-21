import assert from "node:assert/strict";
import test from "node:test";
import { inspectMediaSource } from "../lib/media-source-inspection.ts";
import {
  countTransportPrefixAllocations,
  observedTransportBlob,
  transportInspectionFixtures,
} from "../scripts/lib/transport-inspection-fixtures.mjs";

test("repeated MPEG-TS program maps require only one scratch prefix per consumed stream", async () => {
  const [genuine, repeated] = await transportInspectionFixtures();
  for (const fixture of [genuine, repeated]) {
    const source = observedTransportBlob(fixture.bytes);
    const { inspection, allocations } = await countTransportPrefixAllocations(inspectMediaSource, source);
    assert.equal(allocations, 2, fixture.name);
    assert.deepEqual(source.reads, [[0, 65_536], [source.size - 65_536, source.size]]);
    assert.equal(inspection.inspectedBytes, 131_072);
    assert.deepEqual(inspection.streams.map(({ codec }) => codec), ["H.264/AVC", "AAC"]);
    assert.equal(inspection.width, 640);
    assert.equal(inspection.height, 360);
    assert.equal(inspection.streams[1].sampleRateHz, 48_000);
    // Inserting PMT packets shifts which video timestamps fit in the head
    // window. The A/B benchmark compares identical bytes for each layout.
    assert.equal(inspection.frameRate, fixture === genuine ? 24 : 23.976);
  }
});

test("MPEG-TS stream descriptions survive a program map with no elementary packets", async () => {
  const [, , fixture] = await transportInspectionFixtures();
  const source = observedTransportBlob(fixture.bytes);
  const { inspection, allocations } = await countTransportPrefixAllocations(inspectMediaSource, source);
  assert.equal(allocations, 0);
  assert.deepEqual(inspection.streams.map(({ codec }) => codec), ["H.264/AVC", "AAC"]);
  assert.equal(inspection.width, null);
  assert.equal(inspection.streams[1].sampleRateHz, null);
  assert.deepEqual(source.reads, [[0, 564]]);
});
