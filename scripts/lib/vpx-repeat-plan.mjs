// Exactly three real repetitions of each codec/settings variant. Not a stress
// surrogate, codec mock, or an unbounded command-line repeat count.
export function makeVpxRepeatPlan(flag) {
  if (flag === undefined || flag === "0") return [];
  if (flag !== "1") throw new TypeError("VPX repeat qualification flag must be0 or1");
  return ["vp8", "vp9"].flatMap(codec => ["default", "controls"].flatMap(settings =>
    [1, 2, 3].map(repetition => Object.freeze({ codec, settings, repetition }))));
}
