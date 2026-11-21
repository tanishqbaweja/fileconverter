import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { classifyPrivateRequest } from "./private-browser-request.mjs";

export const PRIVATE_MIB_LIMIT = 250;
export const CLEANUP_MIB_LIMIT = 96;
const MIB = 1048576;

export function resolveTimedTextBrowserRun(args) {
  assert.ok(args.length <= 1, "Choose one isolated container or --preflight");
  const preflightOnly = args[0] === "--preflight";
  const co64 = args[0] === "--co64-mp4";
  const match = /^--container=(mp4|mov|3gp)$/.exec(args[0] ?? "");
  assert.ok(!args.length || preflightOnly || co64 || match, "Use --container=mp4, --container=mov, --container=3gp or --co64-mp4");
  const container = match?.[1] ?? "mp4";
  return { container, profileId: `${container}-to-vtt`, preflightOnly, co64 };
}

// This inspection wraps only the real Worker boundary and never changes the
// original arguments, retains file/handle references or reads payload bytes.
export function observeTimedTextLaunches() {
  const rows = [], original = Worker.prototype.postMessage;
  window.__WITHIN_TIMED_TEXT_LAUNCHES__ = rows;
  Worker.prototype.postMessage = function (...args) {
    const message = args[0];
    if (message?.type === "start" && /^(mp4|mov|3gp)-to-vtt$/.test(message.profileId)) {
      if (rows.length === 8) throw new Error("Timed-text launch observation limit");
      const { destination } = message;
      rows.push({ jobId: message.jobId, profileId: message.profileId, sourceBytes: message.file?.size ?? null,
        trackId: message.timedTextTrackId ?? null, mode: destination?.mode ?? null,
        actualFileHandle: typeof FileSystemFileHandle === "function" && destination?.handle instanceof FileSystemFileHandle,
        fault: message.testFault ?? null });
    }
    return Reflect.apply(original, this, args);
  };
}

export function assertTimedTextLaunch(observation, fixture, trackId, fault = null) {
  assert.equal(typeof observation?.jobId, "string");
  assert.equal(observation.profileId, `${fixture.container}-to-vtt`);
  assert.equal(observation.sourceBytes, fixture.inputBytes);
  assert.equal(observation.trackId, trackId);
  assert.equal(observation.fault, fault);
  assert.equal(observation.mode, "handle");
  assert.equal(observation.actualFileHandle, true);
}

export function assertTimedTextTerminal(state, kind, expectedBytes, profileId = "mp4-to-vtt") {
  assert.equal(state.jobState, kind);
  assert.equal(state.selectedProfileId, profileId);
  assert.equal(state.opfsName, null, "Selected handle, not an intermediate OPFS conversion job");
  const m = state.metrics;
  for (const key of ["inputBytes", "maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes", "peakPendingOperations"]) {
    assert.ok(Number.isSafeInteger(m?.[key]) && m[key] > 0, `Observed ${key} is missing`);
  }
  assert.ok(Number.isSafeInteger(m.outputBytes) && m.outputBytes >= 0);
  assert.ok(m.maxReadChunkBytes <= 131072 && m.maxWriteChunkBytes <= 65536 && m.peakQueuedBytes <= 65536);
  assert.equal(m.peakPendingOperations, 1);
  assert.equal(m.pendingOperations, 0);
  assert.equal(m.queuedBytes, 0);
  assert.equal(m.peakWasmMemoryBytes, 0);
  if (kind === "complete") {
    assert.equal(state.error, null);
    assert.equal(m.outputBytes, expectedBytes);
  } else if (kind === "cancelled") {
    assert.ok(m.outputBytes >= 65536 && m.outputBytes < expectedBytes);
  } else {
    assert.equal(kind, "error");
    assert.match(state.error ?? "", /destination rejected a bounded write/i);
    assert.equal(m.outputBytes, 0, "The injected rejection cannot acknowledge a write");
  }
}

// Only the already-bound physical output is read. Never materialize it or
// create a converted copy. Require the native oracle's full byte count/hash.
export async function validateTimedTextPhysicalOutput(file, expected) {
  assert.ok(Number.isSafeInteger(expected.bytes) && expected.bytes > 0 && expected.bytes <= 4 * MIB);
  assert.match(expected.sha256, /^[a-f0-9]{64}$/);
  let bytes = 0;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 65536 })) {
    assert.ok(chunk.length <= 65536);
    bytes += chunk.length;
    assert.ok(bytes <= expected.bytes, "Physical WebVTT contains extra bytes");
    hash.update(chunk);
  }
  const sha256 = hash.digest("hex");
  assert.equal(bytes, expected.bytes, "Truncated physical WebVTT");
  assert.equal(sha256, expected.sha256, "Physical WebVTT does not match the native cue oracle");
  return { bytes, sha256, maximumReadBytes: 65536 };
}

export async function collectTimedTextStaticPaths(assetRoot) {
  const paths = new Set();
  let examined = 0;
  async function visit(directory, prefix, depth) {
    assert.ok(depth <= 8, "Static asset depth limit");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.ok(++examined <= 1024, "Static asset inventory limit");
      if (entry.name.startsWith(".") || entry.name === "_headers") continue;
      assert.ok(/^[a-zA-Z0-9._-]+$/.test(entry.name), "Noncanonical asset name");
      const url = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), url, depth + 1);
      else if (entry.isFile()) paths.add(url);
      else throw new Error("Nonregular production asset");
    }
  }
  await visit(assetRoot, "", 0);
  assert.ok(paths.size > 0);
  return paths;
}

export function classifyTimedTextBrowserRequest(request, origin, staticPaths) {
  const kind = classifyPrivateRequest(request, origin);
  if (kind !== "app-static") return kind;
  const url = new URL(request.url);
  if (url.pathname === "/") return ["", "?test=1&directory=1", "?test=1&directory=1&fault=write"].includes(url.search) ? kind : "forbidden";
  return staticPaths.has(url.pathname) && !url.search ? kind : "forbidden";
}

export function summarizeTimedTextMemory(samples, start, end, blank, loaded) {
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && end > start);
  assert.ok(blank?.stable && Number.isFinite(blank.privateBytes) && blank.privateBytes > 0);
  const rows = samples.filter(sample => {
    const at = Date.parse(sample.timestamp);
    assert.ok(Number.isFinite(at));
    return at >= start && at <= end;
  });
  const valid = rows.filter(row => row.privateBytes !== null);
  assert.ok(valid.length > 0 && valid.every(row => Number.isFinite(row.privateBytes) && row.privateBytes > 0));
  assert.ok(valid.every(row => Number.isFinite(row.rssBytes) && row.rssBytes > 0));
  const peak = valid.reduce((selected, row) => row.privateBytes > selected.privateBytes ? row : selected);
  const times = [start, ...valid.map(row => Date.parse(row.timestamp)), end];
  assert.ok(times.slice(1).every((time, i) => time >= times[i]), "Memory timestamps must be ordered");
  const maxSampleGapMs = Math.max(...times.slice(1).map((time, i) => time - times[i]));
  return { incrementalPrivateMiB: (peak.privateBytes - blank.privateBytes) / MIB, peakPrivateBytes: peak.privateBytes,
    peakRssBytes: Math.max(...valid.map(row => row.rssBytes)), validSamples: valid.length,
    unavailableSamples: rows.length - valid.length, maxSampleGapMs, peak,
    overLoadedIdleMiB: loaded ? (peak.privateBytes - loaded.privateBytes) / MIB : null };
}
