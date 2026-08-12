// Reuse the deterministic, independently manifested stress sources already
// maintained for each decoder. Every imported generator writes only beneath
// fixtures/stress/media; category cleanup removes the media after profiling.
await Promise.all([
  import("./generate-audio-stress-fixture.mjs"),
  import("./generate-aac-stress-fixture.mjs"),
  import("./generate-alac-stress-fixture.mjs"),
  import("./generate-wma-stress-fixture.mjs"),
  import("./generate-flac-input-stress-fixtures.mjs"),
]);
