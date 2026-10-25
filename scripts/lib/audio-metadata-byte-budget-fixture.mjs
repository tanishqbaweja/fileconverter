// Deterministic bounded generated INPUTS only. Never selected-file conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseVorbisCommentBlock } from "./audio-comment-validation.mjs";
import { nativeVorbisFieldKey, nativeVorbisEntryBytes } from "./ogg-picture-comment-inspection.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const word = number => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(number); return bytes; };
export function makeGeneratedFlacByteBudget(bytes, delta) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length < 1048576); assert.equal(bytes.subarray(0, 4).toString(), "fLaC");
  assert.ok([0, 1].includes(delta));
  let at = 4;
  for (let block = 0; block < 128; block++) {
    assert.ok(at + 4 <= bytes.length); const end = at + 4 + bytes.readUIntBE(at + 1, 3), last = bytes[at] & 128; assert.ok(end <= bytes.length);
    if ((bytes[at] & 127) === 4) {
      const original = parseVorbisCommentBlock(bytes.subarray(at + 4, end)); assert.ok(original.entries.length <= 64);
      // Normalize existing aliases at fixture construction so the input itself
      // has exactly the measured native key lengths, not a guessed offset.
      const canonical = original.entries.map(entry => {
        const separator = entry.indexOf("="); return nativeVorbisFieldKey(entry.slice(0, separator)) + entry.slice(separator);
      });
      assert.ok(canonical.every(entry => !entry.startsWith("BYTE_BOUND_")));
      const target = 2097152 + delta, added = []; let remaining = target - canonical.reduce((n, entry) => n + nativeVorbisEntryBytes(entry), 0);
      for (let index = 0; index < 1024; index++) {
        const key = "BYTE_BOUND_" + String(index).padStart(4, "0"), prefix = `Valeur ${String(index).padStart(4, "0")} café 音楽 `;
        const charge = Math.floor(remaining / (1024 - index)), padding = charge - Buffer.byteLength(key) - Buffer.byteLength(prefix) - 2;
        assert.ok(padding > 0 && padding < 4096);
        const entry = key + "=" + prefix + "x".repeat(padding); assert.equal(nativeVorbisEntryBytes(entry), charge); added.push(entry); remaining -= charge;
      }
      assert.equal(remaining, 0); const entries = [...canonical, ...added]; assert.ok(entries.length < 4096);
      assert.equal(entries.reduce((n, entry) => n + nativeVorbisEntryBytes(entry), 0), target);
      const vendor = Buffer.from(original.vendor), parts = [word(vendor.length), vendor, word(entries.length)];
      for (const entry of entries) { const value = Buffer.from(entry); parts.push(word(value.length), value); }
      const body = Buffer.concat(parts); assert.ok(body.length < 2097152 + 16384);
      const header = Buffer.from(bytes.subarray(at, at + 4)); header.writeUIntBE(body.length, 1, 3);
      const generated = Buffer.concat([bytes.subarray(0, at), header, body, bytes.subarray(end)]); assert.ok(generated.length < 3 * 1048576);
      assert.ok(generated.subarray(at + 4 + body.length).equals(bytes.subarray(end)), "All later metadata and compressed audio stay byte-identical");
      return { generated, expectedAddedEntries: added, summary: { nativeDictionaryBytes: target, textEntries: entries.length, addedFields: added.length,
        addedFieldsSha256: sha(Buffer.from(added.join("\n"))), serializedCommentBytes: body.length,
        sourceSuffixSha256: sha(bytes.subarray(end)), sourceSuffixUnchanged: true, explicitlyGeneratedOneByteOver: delta === 1,
        outputAcceptance: false, publicAcceptance: false } };
    }
    at = end; if (last) break;
  }
  throw new Error("Generated FLAC fixture has no comment block");
}
export async function createAudioMetadataByteBudgetFixtures(directory) {
  const root = path.resolve(import.meta.dirname, "../.."), relative = path.relative(path.join(root, "work"), directory);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink()); assert.equal(await realpath(directory), directory);
  const source = path.join(directory, "source-repeated.flac"), before = await lstat(source, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size === 37151n);
  const bytes = await readFile(source), after = await lstat(source, { bigint: true });
  for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(before[key], after[key]);
  assert.equal(sha(bytes), "4f32dbbd37bbe08ce3d4cd2be84bc764017198b1c5ee6ac65d9a5ddfce74174b");
  const output = {};
  for (const [key, delta] of [["exact", 0], ["over", 1]]) {
    const result = makeGeneratedFlacByteBudget(bytes, delta), file = path.join(directory, "source-text-bytes-" + key + ".flac");
    await writeFile(file, result.generated, { flag: "wx" });
    output[key] = { file, bytes: result.generated.length, sha256: sha(result.generated), expectedAddedEntries: result.expectedAddedEntries, summary: result.summary };
  }
  return output;
}
