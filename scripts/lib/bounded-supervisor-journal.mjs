import assert from "node:assert/strict";
import { open, rename, unlink } from "node:fs/promises";

// Drain continuously; retain only a fixed tail, never all command output.
export function boundedTail(limit = 65536) {
  assert.ok(Number.isSafeInteger(limit) && limit > 0 && limit <= 65536);
  let tail = Buffer.alloc(0), totalBytes = 0;
  return {
    append(chunk) {
      assert.ok(Buffer.isBuffer(chunk)); totalBytes += chunk.length;
      assert.ok(Number.isSafeInteger(totalBytes));
      if (chunk.length >= limit) tail = Buffer.from(chunk.subarray(chunk.length - limit));
      else tail = Buffer.concat([tail.subarray(Math.max(0, tail.length + chunk.length - limit)), chunk]);
    },
    snapshot() { return { totalBytes, retainedBytes: tail.length, limit, tailBase64: tail.toString("base64") }; },
  };
}

// One serialized writer, atomic replacement, bounded bytes, durable file flush.
export function supervisorJournal(file, maximumBytes = 262144) {
  assert.ok(Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 262144);
  let pending = Promise.resolve();
  return state => {
    const bytes = Buffer.from(JSON.stringify(state, null, 2) + "\n");
    assert.ok(bytes.length <= maximumBytes, "Supervisor journal exceeds its fixed cap");
    pending = pending.then(async () => {
      const next = file + ".next";
      let handle;
      try {
        handle = await open(next, "wx"); await handle.writeFile(bytes); await handle.sync();
        await handle.close(); handle = null; await rename(next, file);
      } finally {
        if (handle) await handle.close();
        await unlink(next).catch(error => { if (error.code !== "ENOENT") throw error; });
      }
    });
    return pending;
  };
}
