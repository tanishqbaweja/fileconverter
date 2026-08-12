// Reuse the deterministic, independently manifested stress sources already
// maintained for each decoder. Every imported generator writes only beneath
// fixtures/stress/media; cleanup removes the large media after profiling while
// retaining compact tracked manifests as evidence.
await import("./generate-audio-stress-fixture.mjs");
await import("./generate-aac-stress-fixture.mjs");
await import("./generate-alac-stress-fixture.mjs");
await import("./generate-wma-stress-fixture.mjs");
await import("./generate-amr-stress-fixture.mjs");
await import("./generate-flac-input-stress-fixtures.mjs");
