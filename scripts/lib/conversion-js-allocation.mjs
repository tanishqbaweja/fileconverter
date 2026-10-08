// Page-isolate allocation diagnostics during REAL output growth; not acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { startBoundedJsAllocation } from "./bounded-js-allocation.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const CONVERSION_JS_THRESHOLDS = Object.freeze([1048576, 8388608, 16777216]);
export async function createConversionJsAllocation(cdp, { directory, prefix, context, origin }) {
  assert.match(prefix, /^[a-zA-Z0-9TZ-]{1,128}$/);
  assert.equal(path.dirname(directory), path.resolve(import.meta.dirname, "../../outputs"));
  assert.equal(path.basename(directory), "reports");
  const reportDirectory = await lstat(directory);
  assert.ok(reportDirectory.isDirectory() && !reportDirectory.isSymbolicLink());
  assert.equal(await realpath(directory), directory, "Diagnostic output directory must not redirect outside repository");
  const assets = new Map(), records = [], errors = [];
  let sampler = null, servedScripts = [];
  let pending = null, thresholdIndex = 0, stopped = false, stoppedSummary = null, assetBytes = 0;
  const matching = url => url.origin === origin && /^\/assets\/(?:ConverterApp|framework)-[a-zA-Z0-9_-]+\.js$/.test(url.pathname);
  const handler = async route => {
    try {
      assert.equal(route.request().method(), "GET"); assert.equal(route.request().postData(), null);
      const response = await route.fetch(); assert.equal(response.status(), 200);
      const bytes = await response.body(); assert.ok(bytes.length <= 1048576, "Static script byte cap");
      const asset = new URL(route.request().url()).pathname;
      if (assets.has(asset)) assert.equal(assets.get(asset).sha256, sha(bytes));
      else {
        assert.ok(assets.size < 2 && assetBytes + bytes.length <= 2097152);
        assetBytes += bytes.length; assets.set(asset, { bytes, sha256: sha(bytes), url: route.request().url() });
      }
      await route.fulfill({ response, body: bytes });
    } catch (error) { if (errors.length < 8) errors.push(String(error).slice(0, 512)); await route.abort("failed"); }
  };
  await context.route(matching, handler);
  const capture = (phase, state, nativeEvent = null) => {
    if (pending) return pending;
    pending = (async () => {
      const capturedAt = new Date().toISOString();
      try {
        assert.ok(!stopped && records.length < 5, "Five bounded JS allocation records only");
        const value = await sampler.sample(phase);
        const bundleBindings = value.summary.topCallsites.slice(0, 16).filter(row => row.callFrame.url).map(row => {
          const frame = row.callFrame, asset = assets.get(new URL(frame.url).pathname);
          if (!asset) return { callFrame: frame, estimatedSelfBytes: row.estimatedSelfBytes,
            servedSha256: null, servedBytes: null, context: null, unavailable: "Outside two-script bounded capture scope" };
          const line = asset.bytes.toString("utf8").split("\n")[frame.lineNumber];
          assert.ok(line && frame.columnNumber <= line.length);
          return { callFrame: frame, estimatedSelfBytes: row.estimatedSelfBytes, servedSha256: asset.sha256,
            servedBytes: asset.bytes.length, context: line.slice(Math.max(0, frame.columnNumber - 60), frame.columnNumber + 220) };
        });
        const record = { phase, capturedAt, state, nativeEvent, ...value, bundleBindings };
        const bytes = Buffer.from(JSON.stringify(record)); assert.ok(bytes.length <= 1048576);
        const compressed = gzipSync(bytes, { level: 9 }), file = path.join(directory, `${prefix}-js-${phase}.json.gz`);
        await writeFile(file, compressed, { flag: "wx" });
        const summary = { ...value.summary }; delete summary.topCallsites;
        records.push({ phase, capturedAt, state, nativeEvent, status: "captured", summary, bundleBindings,
          archive: { path: file, bytes: compressed.length, sha256: sha(compressed), restoredBytes: bytes.length, restoredSha256: sha(bytes) } });
        return records.at(-1);
      } catch (error) {
        const detail = String(error).slice(0, 512); if (errors.length < 8) errors.push(detail);
        const unavailable = { phase, capturedAt, status: "unavailable", error: detail, state, nativeEvent, summary: null, archive: null };
        if (records.length < 5) records.push(unavailable); return unavailable;
      }
    })().finally(() => { pending = null; });
    return pending;
  };
  const stop = async () => {
    if (pending) await pending;
    if (!stopped) {
      stopped = true;
      try {
        const value = sampler ? await sampler.stop() : null;
        if (!value) return;
        stoppedSummary = { serializedBytes: value.serializedBytes, nodeCount: value.nodeCount,
          sampleCount: value.sampleCount, estimatedSelfBytes: value.estimatedSelfBytes };
      } catch (error) { if (errors.length < 8) errors.push(String(error).slice(0, 512)); }
    }
  };
  return {
    async beforeConversion(state) {
      assert.equal(records.length, 0); assert.equal(stopped, false);
      sampler = await startBoundedJsAllocation(cdp);
      return capture("before-real-conversion", state);
    },
    async progress(state) {
      if (stopped || pending || thresholdIndex >= CONVERSION_JS_THRESHOLDS.length || state?.jobState !== "running") return;
      const outputBytes = state.metrics?.outputBytes;
      assert.ok(Number.isSafeInteger(outputBytes) && outputBytes >= 0);
      if (outputBytes >= CONVERSION_JS_THRESHOLDS[thresholdIndex]) {
        const threshold = CONVERSION_JS_THRESHOLDS[thresholdIndex++];
        await capture(`output-${threshold}`, state);
      }
    },
    async failureBeforeCancellation(state, event) {
      if (pending) await pending;
      if (!stopped) await capture("native-failure-before-cancel", state,
        { sequence: event.after.sequence, acquiredAt: event.after.timestamp, privateBytes: event.after.privateBytes,
          incrementalPrivateMiB: event.incrementalPrivateMiB });
      await stop();
    },
    async close() {
      await stop(); await context.unroute(matching, handler);
      servedScripts = [...assets].map(([asset, value]) => ({ asset, url: value.url,
        bytes: value.bytes.length, sha256: value.sha256, actualServedBytesCaptured: true }));
      assets.clear();
    },
    report: () => ({ scope: "page-isolate-actual-conversion-progress-and-pre-cancel-JS-only", records, errors,
      stopped, stoppedSummary, servedScripts,
      thresholds: CONVERSION_JS_THRESHOLDS, workersAllocationProfiled: false, realmHeapsMeasuredSeparately: true,
      profilerPerturbsMemory: true, includesNaturallyCollectedObjects: true, nativeAllocationCauseProven: false,
      primaryMemoryAcceptance: false, conversionSpeedAcceptance: false, publicAcceptance: false, forcedGcUsed: false }),
  };
}
