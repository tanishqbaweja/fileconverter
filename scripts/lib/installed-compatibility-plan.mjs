import assert from "node:assert/strict";
import path from "node:path";

// Scoped installed-browser refresh, not a claim about the latest vendor release.
export const INSTALLED_COMPATIBILITY_TARGETS = Object.freeze({
  brave: Object.freeze({ launcher: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe", library: "chrome.dll", versioned: false }),
  "opera-gx": Object.freeze({ launcher: "C:\\Users\\slato\\AppData\\Local\\Programs\\Opera GX\\opera.exe", library: "opera_browser.dll", versioned: true }),
});
export function installedCompatibilityPaths(id, version) {
  assert.ok(Object.hasOwn(INSTALLED_COMPATIBILITY_TARGETS, id), "Select brave or opera-gx explicitly");
  assert.match(version, /^\d{1,4}\.\d{1,4}\.\d{1,6}\.\d{1,4}$/);
  const target = INSTALLED_COMPATIBILITY_TARGETS[id], folder = path.win32.join(path.win32.dirname(target.launcher), version);
  return { launcher: target.launcher, executable: target.versioned ? path.win32.join(folder, "opera.exe") : target.launcher,
    library: path.win32.join(folder, target.library) };
}
export const INSTALLED_COMPATIBILITY_CASES = Object.freeze([
  ["data", "csv-to-tsv", "fixtures/data/sample.csv", "csv"],
  ["document", "txt-to-docx", "fixtures/documents/sample.txt", "txt"],
  ["archive", "tar-to-zip", "fixtures/archives/sample.tar", "tar"],
  ["image", "png-to-webp", "fixtures/images/test-pattern.png", "png"],
  ["video", "mkv-to-mp4", "fixtures/media/remux-source.mkv", "mkv"],
  ["audio", "wav-to-flac", null, "wav"],
  ["subtitle", "srt-to-vtt", "fixtures/subtitles/sample.srt", "srt"],
  ["ebook", "epub-to-txt", "fixtures/ebooks/sample.epub", "epub"],
].map(([family, profileId, fixture, extension]) => Object.freeze({ family, profileId, fixture, extension })));
export const INSTALLED_COMPATIBILITY_LIMITS = Object.freeze({ inputBytes: 2097152, outputBytes: 8388608,
  readChunkBytes: 1048576, writeChunkBytes: 1048576, queuedBytes: 1048576, pendingOperations: 1,
  primaryMiB: 250, cleanupMiB: 96, samples: 3600, requests: 512, realmObservations: 256 });

export function makeCompatibilityWave() {
  const frames = 88200, bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(44100, 24); bytes.writeUInt32LE(88200, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let n = 0; n < frames; n++) bytes.writeInt16LE(((n * 257) & 65535) - 32768, 44 + 2 * n);
  return bytes;
}
export function validateCompatibilityMetrics(metrics) {
  const limits = INSTALLED_COMPATIBILITY_LIMITS;
  assert.ok(metrics && Number.isSafeInteger(metrics.outputBytes) && metrics.outputBytes > 0 && metrics.outputBytes <= limits.outputBytes);
  for (const [metric, maximum] of [["maxReadChunkBytes", limits.readChunkBytes], ["maxWriteChunkBytes", limits.writeChunkBytes],
    ["peakQueuedBytes", limits.queuedBytes], ["peakPendingOperations", limits.pendingOperations]]) {
    assert.ok(Number.isSafeInteger(metrics[metric]) && metrics[metric] > 0 && metrics[metric] <= maximum, `Unchanged bounded I/O: ${metric}`);
  }
  assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
}
export function isCompatibilityStaticPath(url, origin, assets) {
  const u = new URL(url);
  if (u.origin !== origin || u.username || u.password || u.hash) return false;
  if (u.pathname === "/") return ["", "?test=1", "?test=1&directory=1", "?test=1&fault=write"].includes(u.search);
  return u.search === "" && assets.has(u.pathname);
}
