// Small headless evidence files and scalar UI states, never DOM/file histories.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";
const approved = path.resolve(import.meta.dirname, "../../output/playwright");
const MAX_CAPTURES = 5, MAX_IMAGE_BYTES = 4 * 1048576, MAX_TOTAL_BYTES = 16 * 1048576;
const nativeState = state => state?.jobState === "running" && state.phase === "Encoding MPEG-2 MP4" &&
  state.wasmMemoryBytes === 50331648 && state.inputBytes > 0 && state.outputBytes > 0;
async function scalarState(page) {
  return page.evaluate(() => {
    const state = window.__WITHIN_TEST__?.getState();
    if (!state) throw new Error("Real application state unavailable");
    return { jobState: state.jobState, phase: String(state.phase).slice(0, 160), workerStatus: state.workerStatus,
      inputBytes: state.metrics?.inputBytes ?? null, outputBytes: state.metrics?.outputBytes ?? null,
      wasmMemoryBytes: state.metrics?.wasmMemoryBytes ?? null };
  });
}
export async function createBoundedVisualObserver({ page, directory, maximumCaptures = MAX_CAPTURES,
  maximumImageBytes = MAX_IMAGE_BYTES, maximumTotalBytes = MAX_TOTAL_BYTES }) {
  assert.ok(Number.isInteger(maximumCaptures) && maximumCaptures > 0 && maximumCaptures <= MAX_CAPTURES);
  assert.ok(Number.isInteger(maximumImageBytes) && maximumImageBytes > 0 && maximumImageBytes <= MAX_IMAGE_BYTES);
  assert.ok(Number.isInteger(maximumTotalBytes) && maximumTotalBytes > 0 && maximumTotalBytes <= MAX_TOTAL_BYTES);
  directory = path.resolve(directory);
  assert.ok(directory.startsWith(approved + path.sep), "Visual evidence must stay in approved repository directory");
  assert.equal(await realpath(path.dirname(directory)), path.dirname(directory));
  await mkdir(directory); const directoryIdentity = await lstat(directory, { bigint: true });
  const captures = [], unavailable = []; let attempts = 0, totalBytes = 0, busy = false;
  const capture = async (label, observedNativeState = null) => {
    assert.match(label, /^[a-z][a-z0-9-]{0,63}$/); assert.equal(busy, false, "Only one screenshot may be active; no capture queue");
    assert.ok(attempts < maximumCaptures, "Bounded screenshot count exhausted"); attempts++; busy = true;
    const file = path.join(directory, `${String(attempts).padStart(2, "0")}-${label}.png`);
    let identity;
    try {
      const current = await lstat(directory, { bigint: true });
      assert.equal(current.ino, directoryIdentity.ino); assert.equal(current.dev, directoryIdentity.dev);
      assert.equal(await realpath(directory), directory); assert.equal(current.isSymbolicLink(), false);
      const viewport = page.viewportSize();
      assert.ok(viewport && viewport.width > 0 && viewport.height > 0 && viewport.width <= 1280 && viewport.height <= 844 && viewport.width * viewport.height <= 1280 * 720);
      const reservation = await open(file, "wx"); try { identity = await reservation.stat({ bigint: true }); } finally { await reservation.close(); }
      const before = await scalarState(page), startedAt = new Date().toISOString();
      await page.screenshot({ path: file, type: "png", fullPage: false, scale: "css", timeout: 5000 });
      const after = await scalarState(page), info = await lstat(file, { bigint: true });
      assert.equal(info.dev, identity.dev); assert.equal(info.ino, identity.ino); assert.equal(info.isSymbolicLink(), false);
      assert.ok(info.size > 24n && info.size <= BigInt(maximumImageBytes), "Screenshot exceeds fixed byte budget");
      assert.ok(totalBytes + Number(info.size) <= maximumTotalBytes, "Screenshot total exceeds fixed byte budget");
      const handle = await open(file, "r"), header = Buffer.alloc(24);
      try { assert.equal((await handle.read(header, 0, 24, 0)).bytesRead, 24); } finally { await handle.close(); }
      assert.equal(header.subarray(0, 8).toString("hex"), "89504e470d0a1a0a"); assert.equal(header.toString("ascii", 12, 16), "IHDR");
      assert.equal(header.readUInt32BE(16), viewport.width); assert.equal(header.readUInt32BE(20), viewport.height);
      const hash = createHash("sha256"); for await (const bytes of createReadStream(file, { highWaterMark: 65536 })) hash.update(bytes);
      const record = { label, file: path.relative(path.resolve(approved, "../.."), file).replaceAll(path.sep, "/"),
        bytes: Number(info.size), sha256: hash.digest("hex"), viewport, startedAt, finishedAt: new Date().toISOString(),
        before, after, observedNativeState, nativeStateAroundScreenshot: nativeState(before) && nativeState(after) };
      totalBytes += record.bytes; captures.push(record); return structuredClone(record);
    } catch (error) {
      try { if (identity) {
        const current = await lstat(file, { bigint: true }); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
        assert.equal(current.isSymbolicLink(), false); await unlink(file);
      } } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Visual capture and owned-file cleanup both failed"); }
      throw error;
    } finally { busy = false; }
  };
  return {
    capture,
    async observeNativeWork(label, signal) {
      assert.match(label, /^[a-z][a-z0-9-]{0,63}$/);
      const deadline = Date.now() + 60000;
      while (!signal.aborted && Date.now() < deadline) {
        const state = await scalarState(page);
        if (!signal.aborted && nativeState(state)) return capture(label, state);
        if (!signal.aborted) await new Promise(resolve => setTimeout(resolve, 50));
      }
      const record = { label, reason: signal.aborted ? "job-ended-before-capture" : "native-observation-deadline", nativeWorkObserved: false };
      assert.ok(unavailable.length < MAX_CAPTURES); unavailable.push(record); return structuredClone(record);
    },
    summary() { return { scope: "Bounded real-state headless evidence, not full UI/manual or profile qualification",
      maximumCaptures, maximumImageBytes, maximumTotalBytes, attempts, totalBytes, captures: structuredClone(captures),
      unavailable: structuredClone(unavailable), maximumConcurrentCaptures: 1, queuesRetained: 0, domHandlesRetained: 0,
      continuousScreenshots: false, continuousDomSnapshots: false, noForcedGcOrConversionDelays: true, publicAcceptance: false }; },
  };
}
