import assert from "node:assert/strict";
// Generated source only, never a native conversion of user media. Bitexact mux
// metadata prevents random container identifiers from spoiling paired hashes.
export function mpeg2ControlFixtureArguments(destination) {
  assert.ok(typeof destination === "string" && destination.endsWith(".mkv"));
  return ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=4", "-map", "0:v", "-map", "1:a",
    "-c:v", "libx265", "-preset", "ultrafast", "-crf", "18", "-threads:v", "1", "-x265-params",
    "pools=none:frame-threads=1:wpp=0:bframes=2:keyint=48:scenecut=0:log-level=error", "-c:a", "aac", "-b:a", "128k",
    "-metadata", "title=MPEG-2 café 音楽", "-metadata:s:a:0", "language=eng", "-avoid_negative_ts", "make_zero",
    "-fflags", "+bitexact", destination];
}
