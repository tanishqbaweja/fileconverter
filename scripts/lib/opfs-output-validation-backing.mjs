// Read-only independent validation of a finished browser output, never native
// conversion. Bind an actual logical OPFS entry to its unique physical backing
// using size plus three sampled ranges. No converted copy, full buffer, or
// filename-based guess. Existing full-output/audio/image validators still run.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { decodeBoundedValidationChunk } from "./bounded-validation-chunk.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
const identity = info => Object.fromEntries(["dev", "ino", "size", "birthtimeNs", "mtimeNs"].map(key => [key, String(info[key])]));
export const OPFS_VALIDATION_BACKING_LIMITS = Object.freeze({ sampleBytes: 4096, sampleRanges: 3, entries: 256, depth: 10, matchingSizeFiles: 8 });

export async function bindOpfsOutputValidationBacking(page, profileDirectory, entryName, expectedBytes) {
  const root = path.resolve(import.meta.dirname, "../.."), work = path.join(root, "work"), limits = OPFS_VALIDATION_BACKING_LIMITS;
  profileDirectory = path.resolve(profileDirectory);
  const relative = path.relative(work, profileDirectory); assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(await realpath(profileDirectory), profileDirectory); const directoryInfo = await lstat(profileDirectory);
  assert.ok(directoryInfo.isDirectory() && !directoryInfo.isSymbolicLink());
  assert.ok(typeof entryName === "string" && entryName.startsWith("within-test-") && entryName.length <= 240 && !/[\\/]/.test(entryName));
  assert.ok(Number.isSafeInteger(expectedBytes) && expectedBytes >= 3 * limits.sampleBytes && expectedBytes <= 8 * 1048576);
  const ranges = [0, Math.floor((expectedBytes - limits.sampleBytes) / 2), expectedBytes - limits.sampleBytes];
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
  assert.equal(browser.bytes, expectedBytes); assert.equal(browser.samples.length, limits.sampleRanges);
  const samples = browser.samples.map((sample, index) => {
    assert.equal(sample.offset, ranges[index]); const bytes = decodeBoundedValidationChunk(sample.encoded); assert.equal(bytes.length, limits.sampleBytes);
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
          while (used < buffer.length) { const count = (await reader.read(buffer, used, buffer.length - used, sample.offset + used)).bytesRead; assert.ok(count > 0); used += count; }
          if (sha(buffer) !== sample.sha256) { matchesAll = false; break; }
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
    samples, totalBrowserSampleBytes: limits.sampleBytes * limits.sampleRanges, maximumBrowserSampleBytes: limits.sampleBytes,
    maximumHostProbeBufferBytes: buffer.length, inspectedEntries: visited, sizeCandidates,
    uniqueLogicalEntry: true, uniquePhysicalMatch: true, convertedCopyCreated: false, nativeConversionUsed: false,
    fullContentAndFidelityValidationStillRequired: true } };
}

export async function assertOpfsOutputValidationBackingUnchanged(binding) {
  const info = await lstat(binding.file, { bigint: true }); assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.equal(await realpath(binding.file), binding.file); assert.deepEqual(identity(info), binding.proof.physicalIdentity);
}
