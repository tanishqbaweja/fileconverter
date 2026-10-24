// Unit page doubles only; actual browser evidence requires a separate real run.
import assert from "node:assert/strict";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createBoundedVisualObserver } from "../scripts/lib/bounded-visual-observer.mjs";
const approved = fileURLToPath(new URL("../output/playwright", import.meta.url));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const active = { jobState: "running", phase: "Encoding MPEG-2 MP4", workerStatus: "ready", selectedProfileId: "mkv-to-mp4-mpeg2", inputBytes: 65536, outputBytes: 128, wasmMemoryBytes: 50331648 };
const terminal = { jobState: "complete", phase: "Saved", workerStatus: "ready", selectedProfileId: "mkv-to-mp4-mpeg2", inputBytes: 65536, outputBytes: 512, wasmMemoryBytes: 0 };
async function sandbox(run) {
  await mkdir(approved, { recursive: true }); const directory = await mkdtemp(path.join(approved, "bounded-visual-unit-"));
  const identity = await lstat(directory, { bigint: true });
  try { await run(directory); }
  finally {
    assert.equal(path.dirname(directory), approved); assert.equal(await realpath(directory), directory);
    const current = await lstat(directory, { bigint: true }); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
    assert.equal(current.isSymbolicLink(), false); await rm(directory, { recursive: true });
  }
}
function fixture(overrides = {}) {
  let state = active;
  const page = { viewportSize: () => ({ width: 1, height: 1 }), evaluate: async () => structuredClone(state),
    locator: () => ({ scrollIntoViewIfNeeded: async () => {}, boundingBox: async () => ({ x: 0, y: 0, width: 1, height: 1 }),
      locator: () => ({ innerText: async () => state.phase }) }),
    screenshot: async ({ path: file, fullPage, scale }) => { assert.equal(fullPage, false); assert.equal(scale, "css"); await writeFile(file, png); }, ...overrides };
  return { page, setState(next) { state = next; } };
}
test("captures only scalar states, viewport PNGs and bounded hash/path records", async () => sandbox(async directory => {
  const f = fixture(), observer = await createBoundedVisualObserver({ page: f.page, directory: path.join(directory, "captures"), maximumCaptures: 1 });
  const row = await observer.capture("native");
  assert.equal(row.bytes, png.length); assert.equal(row.nativeStateAroundScreenshot, true); assert.match(row.sha256, /^[a-f0-9]{64}$/);
  assert.match(row.file, /^output\/playwright\//); assert.deepEqual(Object.keys(row.before).sort(), Object.keys(active).sort());
  row.before.phase = "do not mutate records"; assert.equal(observer.summary().captures[0].before.phase, active.phase);
  await assert.rejects(observer.capture("extra"), /count exhausted/);
  assert.equal(observer.summary().maximumConcurrentCaptures, 1); assert.equal(observer.summary().domHandlesRetained, 0);
}));
test("overlapping screenshots reject instead of retaining an unbounded queue", async () => sandbox(async directory => {
  let release; const barrier = new Promise(resolve => { release = resolve; });
  const f = fixture({ screenshot: async ({ path: file }) => { await barrier; await writeFile(file, png); } });
  const observer = await createBoundedVisualObserver({ page: f.page, directory: path.join(directory, "captures") });
  const first = observer.capture("first"); await assert.rejects(observer.capture("overlap"), /Only one screenshot/);
  release(); await first; assert.equal(observer.summary().captures.length, 1);
}));
test("oversized/failed evidence is removed only by recorded identity and consumes a bounded attempt", async () => sandbox(async directory => {
  const f = fixture(), output = path.join(directory, "captures");
  const observer = await createBoundedVisualObserver({ page: f.page, directory: output, maximumImageBytes: 32 });
  await assert.rejects(observer.capture("oversized"), /fixed byte budget/); assert.deepEqual(await readdir(output), []);
  assert.equal(observer.summary().attempts, 1); assert.equal(observer.summary().totalBytes, 0);
  const failed = await createBoundedVisualObserver({ page: fixture({ screenshot: async () => { throw new Error("capture timeout"); } }).page, directory: path.join(directory, "failed") });
  await assert.rejects(failed.capture("timeout"), /capture timeout/); await assert.rejects(access(path.join(directory, "failed/01-timeout.png")), { code: "ENOENT" });
}));
test("total bytes, approved location, viewport pixels and immutable upper limits fail closed", async () => sandbox(async directory => {
  const f = fixture(), output = path.join(directory, "captures");
  const observer = await createBoundedVisualObserver({ page: f.page, directory: output, maximumTotalBytes: png.length });
  await observer.capture("first"); await assert.rejects(observer.capture("second"), /total exceeds/); assert.equal((await readdir(output)).length, 1);
  await assert.rejects(createBoundedVisualObserver({ page: f.page, directory: path.resolve("work/not-approved") }), /approved repository/);
  await assert.rejects(createBoundedVisualObserver({ page: f.page, directory: path.join(directory, "too-many"), maximumCaptures: 8 }));
  const huge = await createBoundedVisualObserver({ page: fixture({ viewportSize: () => ({ width: 9999, height: 9999 }) }).page, directory: path.join(directory, "huge") });
  await assert.rejects(huge.capture("huge")); assert.deepEqual(await readdir(path.join(directory, "huge")), []);
}));
test("a job ending during screenshot is not relabelled as active visual coverage; ended jobs never wait60s", async () => sandbox(async directory => {
  const f = fixture({ screenshot: async ({ path: file }) => { f.setState(terminal); await writeFile(file, png); } });
  const observer = await createBoundedVisualObserver({ page: f.page, directory: path.join(directory, "captures") });
  const controller = new AbortController(), row = await observer.observeNativeWork("case-native", controller.signal);
  assert.deepEqual(row.observedNativeState, active); assert.equal(row.nativeStateAroundScreenshot, false);
  assert.equal(row.nativeProgressVisuallyInViewport, false);
  controller.abort(); const missing = await observer.observeNativeWork("ended", controller.signal);
  assert.equal(missing.nativeWorkObserved, false); assert.equal(missing.reason, "job-ended-before-capture");
}));
test("bounded evidence does not remove independent content/privacy checks or lower complete-tree memory accounting", async () => {
  const driver = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(driver, /assert.ok\(ssim >= 0.98/); assert.match(driver, /compareStreamingVideoClocks\(clockReference, times\(output\)/);
  assert.match(driver, /assert.equal\(await audioHash\(output\), await audioHash\(fixture\)\)/);
  assert.match(driver, /assert.equal\(forbiddenRequests.length, 0\)/);
  assert.match(driver, /sample.phase !== "blank" && sample.privateBytes !== null/);
  assert.match(driver, /peak.privateBytes - report.blankBaseline.privateBytes/); assert.match(driver, /report.memory.incrementalPrivateMiB <= 250/);
  assert.match(driver, /Actual active native progress was not visibly verified/);
  assert.match(driver, /report.boundedVisualObservation = visualObserver.summary\(\)/);
});
test("visible progress requires the rendered native phase and an in-viewport region, not just running state", async () => sandbox(async directory => {
  const f = fixture(), observer = await createBoundedVisualObserver({ page: f.page, directory: path.join(directory, "captures") });
  const row = await observer.capture("case-native", active);
  assert.equal(row.regionInViewport, true); assert.equal(row.nativeProgressVisuallyInViewport, true);
  const wrong = fixture({ locator: () => ({ scrollIntoViewIfNeeded: async () => {}, boundingBox: async () => ({ x: 0, y: 5, width: 1, height: 1 }),
    locator: () => ({ innerText: async () => active.phase }) }) });
  const hidden = await createBoundedVisualObserver({ page: wrong.page, directory: path.join(directory, "hidden") });
  const invisible = await hidden.capture("case-native", active);
  assert.equal(invisible.nativeStateAroundScreenshot, true); assert.equal(invisible.nativeProgressVisuallyInViewport, false);
}));
test("real-form gate may use seven bounded captures without changing the default five or total byte budget", async () => sandbox(async directory => {
  const f = fixture(), panel = { scrollIntoViewIfNeeded: async () => {}, boundingBox: async () => ({ x: 0, y: 0, width: 1, height: 1 }) };
  f.page.getByTestId = id => { assert.equal(id, "video-encoding-options"); return panel; };
  const observer = await createBoundedVisualObserver({ page: f.page, directory: path.join(directory, "controls"), maximumCaptures: 7 });
  const shot = await observer.capture("case-1-options"); assert.equal(shot.focusedRegion, "video-options"); assert.equal(shot.regionInViewport, true);
  assert.equal(observer.summary().maximumCaptures, 7); assert.equal(observer.summary().maximumTotalBytes, 16 * 1048576);
  const baseline = await createBoundedVisualObserver({ page: f.page, directory: path.join(directory, "baseline") });
  assert.equal(baseline.summary().maximumCaptures, 5);
}));
