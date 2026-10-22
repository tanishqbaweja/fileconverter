// Initial real-volume/geometry stage, not a replacement for near10GiB scaling.
export function vpxScalePlan(value) {
  if (value === undefined || value === "0") return null;
  if (value !== "1080p-128m") throw new TypeError("Unknown explicit VPX scaling stage");
  return Object.freeze({ name: value, width: 1920, height: 1080, durationSeconds: 40, frameRate: 24,
    minimumSourceBytes: 128 * 1024 ** 2, maximumSourceBytes: 256 * 1024 ** 2,
    fixtureBitRate: "40M", nativeDeadlineMs: 600000, browserDeadlineMs: 600000, near10GiBAcceptance: false });
}
