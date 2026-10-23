// Lossless instrumentation data only, never media input/output. Reuses the
// existing bounded simultaneous-tree peak/graph tracker instead of replacing it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { createGzip, createGunzip } from "node:zlib";
import { createNativeMemoryPeaks } from "./native-memory-peaks.mjs";
import { validateNativeBatch } from "./persistent-chromium-memory.mjs";

export const LOSSLESS_NATIVE_LIMITS = Object.freeze({ recordBytes: 262144, readChunkBytes: 65536,
  fileBytes: 8 * 1024 ** 3, batchSamples: 256, pendingAppends: 1, encodedRecords: 1 });
const root = path.resolve(import.meta.dirname, "../.."), canonical = value => process.platform === "win32" ? value.toLowerCase() : value;
const identity = stat => Object.fromEntries(["dev", "ino", "birthtimeNs", "mtimeNs"].map(key => [key, String(stat[key])]));
async function checkedFile(file, existing = false) {
  file = path.resolve(file); const parent = path.dirname(file), work = path.join(root, "work"), reports = path.join(root, "output/playwright");
  assert.ok(canonical(parent) === canonical(reports) || canonical(path.dirname(parent)) === canonical(work), "Journal must be repository-local approved report or owned runtime data");
  assert.match(path.basename(file), /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,150}\.ndjson(?:\.gz)?$/);
  assert.equal(canonical(await realpath(parent)), canonical(parent));
  const directory = await lstat(parent); assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
  if (existing) { const stat = await lstat(file); assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(canonical(await realpath(file)), canonical(file)); }
  return file;
}
const sampleKeys = new Set(["sequence", "timestamp", "completedAt", "sampleError", "nativeElapsedMs", "privateBytes", "rssBytes", "processes", "phase", "elapsedMs"]);
const processKeys = new Set(["pid", "parentPid", "createdAt", "creationFileTime", "executableName", "privateBytes", "rssBytes", "type", "utilitySubtype", "sandboxType"]);
function boundedSample(sample) {
  assert.ok(sample && Object.getPrototypeOf(sample) === Object.prototype && Object.keys(sample).every(key => sampleKeys.has(key)));
  assert.match(sample.phase, /^[a-z0-9-]{1,64}$/);
  for (const key of ["timestamp", "completedAt"]) assert.ok(typeof sample[key] === "string" && sample[key].length <= 64);
  assert.ok(sample.sampleError == null || (typeof sample.sampleError === "string" && sample.sampleError.length <= 1024));
  if (sample.elapsedMs !== undefined) assert.ok(Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= 0);
  assert.ok(sample.processes === null || (Array.isArray(sample.processes) && sample.processes.length <= 128));
  for (const row of sample.processes ?? []) {
    assert.ok(Object.getPrototypeOf(row) === Object.prototype && Object.keys(row).every(key => processKeys.has(key)));
    for (const key of ["createdAt", "creationFileTime", "executableName", "type", "utilitySubtype", "sandboxType"])
      assert.ok(row[key] == null || (typeof row[key] === "string" && row[key].length <= 512));
  }
}
function tracker(rootPid) {
  const history = createNativeMemoryPeaks(rootPid), phaseNames = new Set();
  let previousPhase, rootBirth, count = 0, previousAt = null, maximumGapMs = null;
  return {
    consume(sample, observerCpuMs) {
      boundedSample(sample); const at = Date.parse(sample.timestamp);
      if (previousAt !== null) maximumGapMs = Math.max(maximumGapMs ?? 0, at - previousAt);
      previousAt = at;
      if (sample.phase !== previousPhase) { history.setPhase(sample.phase, at); previousPhase = sample.phase; phaseNames.add(sample.phase); }
      history.consume({ overflow: false, observerCpuMs, samples: [sample] });
      if (sample.processes) {
        const birth = sample.processes.find(row => row.pid === rootPid).creationFileTime;
        rootBirth ??= birth; assert.equal(birth, rootBirth, "Native journal root PID reused");
      }
      count++;
    },
    summary: () => ({ count, maximumAcquisitionGapMs: maximumGapMs, rootCreationFileTime: rootBirth ?? null, native: history.report() }),
    peaksExcept: excluded => history.peaks([...phaseNames].filter(phase => !excluded.includes(phase))),
  };
}

/** @param {number} rootPid @param {string} file
 * @param {{writeOverride?: (bytes: Buffer, write: () => Promise<void>) => Promise<void>}} options */
export async function createLosslessNativeMemoryJournal(rootPid, file, { writeOverride } = {}) {
  assert.ok(Number.isSafeInteger(rootPid) && rootPid > 0); file = await checkedFile(file); assert.ok(file.endsWith(".ndjson"));
  const handle = await open(file, "wx"), born = identity(await handle.stat({ bigint: true }));
  const digest = createHash("sha256"), state = tracker(rootPid);
  let bytes = 0, sequence = 0, pending = null, closing = null, closed = false, failure = null, maximumRecordBytes = 0;
  const healthy = () => { if (failure) throw failure; };
  return {
    file, healthy,
    appendBatch(batch) {
      healthy(); assert.equal(closed, false); assert.equal(closing, null); assert.equal(pending, null, "Only one journal append may be pending; no queue/coalescing/dropped rows");
      const operation = Promise.resolve().then(async () => {
        try {
          validateNativeBatch(batch, rootPid, sequence);
          for (const sample of batch.samples) {
            boundedSample(sample); const encoded = Buffer.from(JSON.stringify({ observerCpuMs: batch.observerCpuMs, sample }) + "\n");
            assert.ok(encoded.length <= LOSSLESS_NATIVE_LIMITS.recordBytes); assert.ok(bytes + encoded.length <= LOSSLESS_NATIVE_LIMITS.fileBytes);
            state.consume(sample, batch.observerCpuMs);
            const write = async () => { let offset = 0;
              while (offset < encoded.length) { const result = await handle.write(encoded, offset, encoded.length - offset, bytes + offset);
                assert.ok(result.bytesWritten > 0); offset += result.bytesWritten; } };
            if (writeOverride) await writeOverride(encoded, write); else await write();
            digest.update(encoded); bytes += encoded.length; sequence = sample.sequence; maximumRecordBytes = Math.max(maximumRecordBytes, encoded.length);
          }
        } catch (error) { failure ??= error; throw error; }
      });
      pending = operation; operation.then(() => { pending = null; }, () => { pending = null; }); return operation;
    },
    peaksExcept(excluded) { healthy(); return state.peaksExcept(excluded); },
    summary() { healthy(); return state.summary(); },
    async failedReceipt() {
      assert.ok(closed && failure, "Only a closed failed journal can be retained as incomplete evidence");
      await checkedFile(file, true); const stat = await lstat(file, { bigint: true }), current = identity(stat);
      for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(current[key], born[key]);
      assert.ok(stat.size <= BigInt(LOSSLESS_NATIVE_LIMITS.fileBytes));
      const hash = createHash("sha256"); for await (const chunk of createReadStream(file, { highWaterMark: 65536 })) hash.update(chunk);
      return { file, rootPid, bytes: Number(stat.size), sha256: hash.digest("hex"), identity: current,
        records: null, summary: null, complete: false, conversionAcceptance: false, failure: String(failure).slice(0, 2048) };
    },
    close() {
      closing ??= (async () => {
        try {
          if (pending) await pending; healthy(); await handle.sync();
        } finally { await handle.close(); closed = true; }
        await checkedFile(file, true); const stat = await lstat(file, { bigint: true });
        const current = identity(stat); for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(current[key], born[key], "Owned journal path replaced");
        assert.equal(Number(stat.size), bytes, "Journal bytes were not fully written");
        return { file, rootPid, bytes, sha256: digest.digest("hex"), records: state.summary().count, identity: current,
          summary: state.summary(), limits: LOSSLESS_NATIVE_LIMITS, maximumRecordBytes, complete: true, conversionAcceptance: false, readbackVerified: false };
      })().catch(error => { failure ??= error; throw error; });
      return closing;
    },
  };
}

// Fully stream raw or gzip data; never readFile a long journal. Keep at most
// one64KiB read chunk, one256KiB record, and the existing bounded peak tracker.
export async function replayLosslessNativeMemoryJournal(receipt) {
  assert.notEqual(receipt.complete, false, "Incomplete journal is failure evidence, never a complete native replay");
  assert.ok(Number.isSafeInteger(receipt.rootPid) && receipt.rootPid > 0);
  const file = await checkedFile(receipt.file, true); assert.ok(Number.isSafeInteger(receipt.bytes) && receipt.bytes >= 0 && receipt.bytes <= LOSSLESS_NATIVE_LIMITS.fileBytes);
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
  const input = createReadStream(file, { highWaterMark: LOSSLESS_NATIVE_LIMITS.readChunkBytes });
  const zipped = file.endsWith(".gz"), stream = zipped ? input.pipe(createGunzip({ chunkSize: LOSSLESS_NATIVE_LIMITS.readChunkBytes })) : input;
  const state = tracker(receipt.rootPid), digest = createHash("sha256"), compressedHash = createHash("sha256");
  let compressedBytes = 0, bytes = 0, pending = "", maximumReadBytes = 0, maximumRecordBytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  if (zipped) input.on("data", chunk => { compressedBytes += chunk.length; compressedHash.update(chunk); });
  const inputError = error => stream.destroy(error); if (zipped) input.on("error", inputError);
  try {
    for await (const chunk of stream) {
      assert.ok(chunk.length <= LOSSLESS_NATIVE_LIMITS.readChunkBytes); maximumReadBytes = Math.max(maximumReadBytes, chunk.length);
      bytes += chunk.length; assert.ok(bytes <= receipt.bytes, "Journal exceeds its exact expected size"); digest.update(chunk);
      pending += decoder.decode(chunk, { stream: true }); let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        const length = Buffer.byteLength(line) + 1; assert.ok(length <= LOSSLESS_NATIVE_LIMITS.recordBytes); maximumRecordBytes = Math.max(maximumRecordBytes, length);
        const row = JSON.parse(line); assert.deepEqual(Object.keys(row).sort(), ["observerCpuMs", "sample"]); state.consume(row.sample, row.observerCpuMs);
      }
      assert.ok(Buffer.byteLength(pending) < LOSSLESS_NATIVE_LIMITS.recordBytes);
    }
    pending += decoder.decode(); assert.equal(pending, "", "Truncated journal record / missing final newline");
    assert.equal(bytes, receipt.bytes); assert.equal(digest.digest("hex"), receipt.sha256); assert.equal(state.summary().count, receipt.records);
    if (zipped) { assert.equal(compressedBytes, receipt.archiveBytes); assert.equal(compressedHash.digest("hex"), receipt.archiveSha256); }
    assert.deepEqual(state.summary(), receipt.summary, "Replayed native peaks/counts/coverage differ");
    return { verified: true, records: receipt.records, bytes, maximumReadBytes, maximumRecordBytes, summary: state.summary(), conversionAcceptance: false };
  } finally { input.destroy(); if (zipped) { input.off("error", inputError); stream.destroy(); } }
}

export async function compactLosslessNativeMemoryJournal(receipt) {
  const file = await checkedFile(receipt.file, true); assert.ok(file.endsWith(".ndjson"));
  const before = await lstat(file, { bigint: true }); assert.deepEqual(identity(before), receipt.identity); assert.equal(Number(before.size), receipt.bytes);
  const archive = await checkedFile(file + ".gz"), output = await open(archive, "wx"), archiveIdentity = identity(await output.stat({ bigint: true }));
  let complete = false;
  try {
    const input = createReadStream(file, { highWaterMark: 65536 }), gzip = createGzip({ level: 9, chunkSize: 65536 });
    const fail = error => gzip.destroy(error); input.on("error", fail); let at = 0;
    try {
      // Do not bind a FileHandle to a non-auto-closing WriteStream: its live
      // stream reference can make FileHandle.close wait forever. One explicit
      // bounded write at a time also makes compression backpressure auditable.
      for await (const chunk of input.pipe(gzip)) {
        assert.ok(chunk.length <= 65536); let offset = 0;
        while (offset < chunk.length) { const written = await output.write(chunk, offset, chunk.length - offset, at + offset);
          assert.ok(written.bytesWritten > 0); offset += written.bytesWritten; }
        at += chunk.length;
      }
      await output.sync();
    } finally { input.off("error", fail); input.destroy(); gzip.destroy(); await output.close(); }
    const hash = createHash("sha256"); let archiveBytes = 0;
    for await (const chunk of createReadStream(archive, { highWaterMark: 65536 })) { archiveBytes += chunk.length; hash.update(chunk); }
    const retained = { ...receipt, file: archive, archiveBytes, archiveSha256: hash.digest("hex"), rawFile: file, rawIdentity: receipt.identity,
      identity: identity(await lstat(archive, { bigint: true })), rawRemoved: false, readbackVerified: true };
    if (receipt.complete === false) {
      // Preserve partial/error evidence byte-for-byte without pretending that
      // a truncated record or missing sequence is a valid native replay.
      const hash = createHash("sha256"), input = createReadStream(archive, { highWaterMark: 65536 }), gunzip = createGunzip({ chunkSize: 65536 }); let count = 0;
      const fail = error => gunzip.destroy(error); input.on("error", fail);
      try { for await (const chunk of input.pipe(gunzip)) { count += chunk.length; assert.ok(count <= receipt.bytes); hash.update(chunk); } }
      finally { input.off("error", fail); input.destroy(); gunzip.destroy(); }
      assert.equal(count, receipt.bytes); assert.equal(hash.digest("hex"), receipt.sha256);
    } else await replayLosslessNativeMemoryJournal(retained);
    const current = await lstat(file, { bigint: true }); assert.deepEqual(identity(current), receipt.identity); assert.equal(Number(current.size), receipt.bytes);
    await unlink(file); complete = true; retained.rawRemoved = true; return retained;
  } finally {
    if (!complete) {
      // This exact failed archive is disposable; the complete raw journal stays.
      const current = await lstat(archive, { bigint: true }).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
      if (current) { for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(String(current[key]), archiveIdentity[key]); await unlink(archive); }
    }
  }
}
