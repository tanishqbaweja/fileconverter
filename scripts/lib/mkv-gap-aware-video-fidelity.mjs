// Independent packet-copy clock checks for discontinuous/reordered source
// timelines. Matroska DefaultDuration is not an MP4 decode-sample interval.
// Keep the same 1ms clock tolerance and check each output interval against
// adjacent verified DTS, not against a nominal source frame-rate field.
import assert from "node:assert/strict";
const tick = 1000;

export async function compareMkvGapAwareVideoPackets(source, output, { sourceIndex, outputIndex, sourceReorderDepth }) {
  assert.ok(Number.isInteger(sourceReorderDepth) && sourceReorderDepth >= 0 && sourceReorderDepth <= 16);
  const a = source[Symbol.asyncIterator](), b = output[Symbol.asyncIterator]();
  const target = 2 * sourceReorderDepth + 1, startup = [];
  let packets = 0, comparableDts = 0, missingDts = 0, previous, lastSourceKnownDts = -Infinity;
  let maximumPtsDeltaUs = 0, maximumDtsDeltaUs = 0, maximumIntervalErrorUs = 0, maximumDefaultDurationDifferenceUs = 0;
  let sourceMinimumPtsUs = Infinity, outputMinimumPtsUs = Infinity, sourceEndUs = -Infinity, outputEndUs = -Infinity;
  let terminalSourceDuration, terminalOutputDuration;
  try {
    for (;;) {
      const [before, after] = await Promise.all([a.next(), b.next()]);
      assert.equal(before.done, after.done, "Video packet count changed"); if (before.done) break;
      assert.ok(++packets <= 10_000_000, "Bounded fixture packet count exceeded");
      const x = before.value, y = after.value;
      assert.equal(x.stream, sourceIndex); assert.equal(y.stream, outputIndex);
      assert.equal(x.hash, y.hash, `Video payload or decode order changed at packet ${packets}`);
      assert.ok(Number.isSafeInteger(x.pts) && Number.isSafeInteger(y.pts));
      const ptsError = Math.abs(x.pts - y.pts); assert.ok(ptsError <= tick, `Video PTS exceeds one source tick at packet ${packets}`);
      maximumPtsDeltaUs = Math.max(maximumPtsDeltaUs, ptsError);
      assert.ok(Number.isSafeInteger(y.dts), "Output DTS unavailable");
      if (x.dts === null) assert.ok(comparableDts === 0 && ++missingDts <= sourceReorderDepth, "Missing interior or excessive source DTS");
      else {
        assert.ok(Number.isSafeInteger(x.dts) && x.dts > lastSourceKnownDts, "Source DTS is invalid/nonmonotonic");
        lastSourceKnownDts = x.dts; comparableDts++;
        const error = Math.abs(x.dts - y.dts); assert.ok(error <= tick, `Video DTS exceeds one source tick at packet ${packets}`);
        maximumDtsDeltaUs = Math.max(maximumDtsDeltaUs, error);
      }
      if (startup.length < target) startup.push([x.pts, x.dts, y.dts]);
      assert.ok(Number.isSafeInteger(x.duration) && x.duration > 0 && Number.isSafeInteger(y.duration) && y.duration > 0,
        "Packet presentation/decode duration unavailable");
      if (previous) {
        assert.ok(y.dts > previous.dts, "Output DTS is nonmonotonic");
        const error = Math.abs(previous.duration - (y.dts - previous.dts));
        assert.ok(error <= tick, `Output decode interval disagrees with adjacent DTS at packet ${packets - 1}`);
        maximumIntervalErrorUs = Math.max(maximumIntervalErrorUs, error);
      }
      maximumDefaultDurationDifferenceUs = Math.max(maximumDefaultDurationDifferenceUs, Math.abs(x.duration - y.duration));
      previous = { dts: y.dts, duration: y.duration };
      sourceMinimumPtsUs = Math.min(sourceMinimumPtsUs, x.pts); outputMinimumPtsUs = Math.min(outputMinimumPtsUs, y.pts);
      assert.ok(Number.isSafeInteger(x.pts + x.duration) && Number.isSafeInteger(y.pts + y.duration));
      sourceEndUs = Math.max(sourceEndUs, x.pts + x.duration); outputEndUs = Math.max(outputEndUs, y.pts + y.duration);
      terminalSourceDuration = x.duration; terminalOutputDuration = y.duration;
    }
  } finally { await Promise.allSettled([a.return?.(), b.return?.()]); }
  assert.ok(packets > 0 && comparableDts > 0);
  assert.ok(Math.abs(terminalSourceDuration - terminalOutputDuration) <= tick, "Terminal decode duration changed");
  assert.ok(Math.abs(sourceEndUs - outputEndUs) <= tick, "Final video presentation endpoint changed");
  if (missingDts) {
    assert.equal(startup.length, target, "Insufficient verified startup timing window");
    const presentation = startup.map(row => row[0]).sort((x, y) => x - y);
    assert.ok(presentation.at(-1) - presentation[0] <= 2000000, "Startup span exceeds fixed two-second bound");
    for (let n = 1; n < presentation.length; n++) assert.ok(presentation[n] > presentation[n - 1]);
    const anchor = startup[missingDts][1]; assert.equal(anchor, presentation[0], "Missing verified startup anchor");
    for (let n = 0; n < missingDts; n++) assert.ok(Math.abs(startup[n][2] - (anchor - (presentation[missingDts] - presentation[n]))) <= tick,
      "Generated startup DTS disagrees with bounded observed cadence");
  }
  return { packets, comparableDts, unavailableSourceDts: missingDts, maximumPtsDeltaUs, maximumDtsDeltaUs, maximumIntervalErrorUs,
    maximumDefaultDurationDifferenceUs, sourceMinimumPtsUs, outputMinimumPtsUs, sourceEndUs, outputEndUs,
    generatedStartupDtsValidated: true, packetBytesIdentical: true, clockToleranceUs: tick,
    everyOutputIntervalCheckedAgainstAdjacentDts: true, sourceDefaultDurationTreatedAsDecodeCadence: false,
    maximumRetainedPacketPair: 2, maximumRetainedPreviousTimingScalars: 2, maximumStartupTimingScalars: 3 * startup.length };
}
