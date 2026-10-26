// Read-only independent validation of a finished browser output, never native
// conversion. Bind an actual logical OPFS entry to its unique physical backing
// using size plus three sampled ranges (or EVERY byte of a <=12KiB output,
// in <=4KiB nonoverlapping chunks). No converted copy, full buffer, or
// filename-based guess. Existing full-output/audio/image validators still run.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { decodeBoundedValidationChunk } from "./bounded-validation-chunk.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
const identity = info => Object.fromEntries(["dev", "ino", "size", "birthtimeNs", "mtimeNs"].map(key => [key, String(info[key])]));
export const OPFS_VALIDATION_BACKING_LIMITS = Object.freeze({ sampleBytes: 4096, sampleRanges: 3, entries: 256, depth: 10, matchingSizeFiles: 8 });

export function bindOpfsOutputValidationBacking(page, profileDirectory, entryName, expectedBytes) {
  return bindFinishedOutput(page, profileDirectory, entryName, expectedBytes, 8 * 1048576);
}
// Separate finite stress scope: only the caller's already-finished browser file
// grows. Probe buffers/ranges/queues/identity and full validators do not change.
export function bindLargeAudioOutputValidationBacking(page, profileDirectory, entryName, expectedBytes) {
  return bindFinishedOutput(page, profileDirectory, entryName, expectedBytes, 256 * 1048576);
}
async function bindFinishedOutput(page, profileDirectory, entryName, expectedBytes, maximumBytes) {
  const root = path.resolve(import.meta.dirname, "../.."), work = path.join(root, "work"), limits = OPFS_VALIDATION_BACKING_LIMITS;
  profileDirectory = path.resolve(profileDirectory);
  const relative = path.relative(work, profileDirectory); assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(await realpath(profileDirectory), profileDirectory); const directoryInfo = await lstat(profileDirectory);
  assert.ok(directoryInfo.isDirectory() && !directoryInfo.isSymbolicLink());
  assert.ok(typeof entryName === "string" && entryName.startsWith("within-test-") && entryName.length <= 240 && !/[\\/]/.test(entryName));
  assert.ok(Number.isSafeInteger(expectedBytes) && expectedBytes > 0 && expectedBytes <= maximumBytes);
  const completeSmallOutput = expectedBytes <= limits.sampleRanges * limits.sampleBytes;
  const ranges = completeSmallOutput ? Array.from({ length: Math.ceil(expectedBytes / limits.sampleBytes) }, (_, index) => index * limits.sampleBytes)
    : [0, Math.floor((expectedBytes - limits.sampleBytes) / 2), expectedBytes - limits.sampleBytes];
  const browser = await page.evaluate(async ({ name, size, ranges, sampleBytes }) => {
    const directory = await navigator.storage.getDirectory(), entries = [];
    for await (const [entry, handle] of directory.entries()) {
      if (entries.length >= 16) throw new Error("Unexpected OPFS validation inventory");
      entries.push({ name: entry, kind: handle.kind });
    }
    if (entries.length !== 1 || entries[0].name !== name || entries[0].kind !== "file") throw new Error("Output must be the unique logical OPFS file");
    const file = await (await directory.getFileHandle(name)).getFile();
    if (file.size !== size) throw new Error("Logical output size changed");
    const samples = [];
    for (const offset of ranges) samples.push({ offset,
      encoded: window.__WITHIN_AUDIO_VALIDATION_CHUNK__(new Uint8Array(await file.slice(offset, offset + sampleBytes).arrayBuffer())) });
    return { bytes: file.size, samples };
  }, { name: entryName, size: expectedBytes, ranges, sampleBytes: limits.sampleBytes });
  assert.equal(browser.bytes, expectedBytes); assert.equal(browser.samples.length, ranges.length); assert.ok(ranges.length <= limits.sampleRanges);
  const samples = browser.samples.map((sample, index) => {
    assert.equal(sample.offset, ranges[index]); const bytes = decodeBoundedValidationChunk(sample.encoded);
    assert.equal(bytes.length, Math.min(limits.sampleBytes, expectedBytes - sample.offset));
    return { offset: sample.offset, bytes: bytes.length, sha256: sha(bytes) };
  });
  let visited = 0, sizeCandidates = 0; const matches = [], buffer = Buffer.alloc(limits.sampleBytes);
  const scan = async (directory, depth = 0) => {
    assert.ok(depth <= limits.depth); const entries = await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });
    for (const entry of entries) {
      assert.ok(++visited <= limits.entries); assert.equal(entry.isSymbolicLink(), false);
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await scan(file, depth + 1); continue; }
      if (!entry.isFile()) continue;
      const info = await lstat(file, { bigint: true }); if (Number(info.size) !== expectedBytes) continue;
      assert.ok(++sizeCandidates <= limits.matchingSizeFiles); assert.equal(await realpath(file), file);
      const reader = await open(file, "r");
      try {
        const before = await reader.stat({ bigint: true }); assert.deepEqual(identity(before), identity(info));
        let matchesAll = true;
        for (const sample of samples) {
          let used = 0;
          while (used < sample.bytes) { const count = (await reader.read(buffer, used, sample.bytes - used, sample.offset + used)).bytesRead; assert.ok(count > 0); used += count; }
          if (sha(buffer.subarray(0, sample.bytes)) !== sample.sha256) { matchesAll = false; break; }
        }
        assert.deepEqual(identity(await reader.stat({ bigint: true })), identity(before));
        if (matchesAll) matches.push({ file, identity: identity(before) });
      } finally { await reader.close(); }
    }
  };
  for (const name of ["File System", "WebStorage"]) await scan(path.join(profileDirectory, "Default", name));
  assert.equal(matches.length, 1, "A unique, size-and-byte-bound OPFS backing is required; never guess or weaken output validation");
  const match = matches[0];
  return { file: match.file, proof: { scope: "read-only-independent-validation-of-finished-browser-OPFS-output",
    physicalFile: path.relative(root, match.file).replaceAll(path.sep, "/"), logicalBytes: expectedBytes, physicalIdentity: match.identity,
    samples, totalBrowserSampleBytes: samples.reduce((total, sample) => total + sample.bytes, 0), maximumBrowserSampleBytes: Math.max(...samples.map(sample => sample.bytes)),
    bindingMode: completeSmallOutput ? "every-output-byte-in-bounded-nonoverlapping-chunks" : "three-fixed-sampled-ranges",
    allOutputBytesCompared: completeSmallOutput,
    maximumHostProbeBufferBytes: buffer.length, inspectedEntries: visited, sizeCandidates,
    uniqueLogicalEntry: true, uniquePhysicalMatch: true, convertedCopyCreated: false, nativeConversionUsed: false,
    fullContentAndFidelityValidationStillRequired: true } };
}

export async function assertOpfsOutputValidationBackingUnchanged(binding) {
  const info = await lstat(binding.file, { bigint: true }); assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.equal(await realpath(binding.file), binding.file); assert.deepEqual(identity(info), binding.proof.physicalIdentity);
}
