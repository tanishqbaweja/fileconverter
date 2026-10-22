// Initial real-volume/geometry stage, not a replacement for near10GiB scaling.
export function vpxScalePlan(value) {
  if (value === undefined || value === "0") return null;
  if (value !== "1080p-128m") throw new TypeError("Unknown explicit VPX scaling stage");
  return Object.freeze({ name: value, width: 1920, height: 1080, durationSeconds: 40, frameRate: 24,
    minimumSourceBytes: 128 * 1024 ** 2, maximumSourceBytes: 256 * 1024 ** 2,
    fixtureBitRate: "40M", nativeDeadlineMs: 600000, browserDeadlineMs: 600000, near10GiBAcceptance: false });
}
export function assertVpxMemoryGateCoverage({ conversionCount, independentOutputCount, crossCheckCount = 0, crossCheck = false, repeat = false, scale = false }) {
  if (!Number.isSafeInteger(conversionCount) || conversionCount < 1 || conversionCount > 64 ||
      !Number.isSafeInteger(independentOutputCount) || independentOutputCount < 1 || independentOutputCount > conversionCount)
    throw new Error("Memory-only/empty selection is not conversion qualification");
  const expected = repeat ? 12 : scale ? 2 : crossCheck ? 1 : null;
  if (expected !== null && (conversionCount !== expected || independentOutputCount !== expected))
    throw new Error("Selected conversions do not cover the explicit qualification mode");
  if (crossCheck && crossCheckCount !== 1) throw new Error("New streaming validator was not exercised exactly once");
}
