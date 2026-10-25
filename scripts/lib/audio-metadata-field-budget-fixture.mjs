// Only deterministic generated INPUTS. Not a converter or an expanded parser
// policy for selected files. Deliberately create exactly one field past limits.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseVorbisCommentBlock } from "./audio-comment-validation.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const FIELD_BUDGET_FIXTURE_LIMITS = Object.freeze({ fileBytes: 6 * 1048576, commentBytes: 512 * 1024, entries: 4097, valueBytes: 1024 });
export function fieldBudgetAddedEntries(count) {
  assert.ok(Number.isInteger(count) && count >= 0 && count <= 4097);
  return Array.from({ length: count }, (_, index) => `BOUND_FIELD_${String(index).padStart(4, "0")}=Valeur ${String(index).padStart(4, "0")} café 音楽`);
}
function audioTail(bytes) {
  let at = 4;
  for (let block = 0; block < 128; block++) {
    assert.ok(at + 4 <= bytes.length); const end = at + 4 + bytes.readUIntBE(at + 1, 3); assert.ok(end <= bytes.length);
    if (bytes[at] & 128) return bytes.subarray(end); at = end;
  }
  throw new Error("Generated FLAC header chain exceeds fixture bound");
}
export function makeGeneratedFlacFieldBudget(bytes, textEntries) {
  const limits = FIELD_BUDGET_FIXTURE_LIMITS;
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= limits.fileBytes); assert.equal(bytes.subarray(0, 4).toString(), "fLaC");
  assert.ok([4095, 4096, 4097].includes(textEntries));
  let at = 4;
  for (let block = 0; block < 128; block++) {
    assert.ok(at + 4 <= bytes.length); const size = bytes.readUIntBE(at + 1, 3), end = at + 4 + size, last = bytes[at] & 128; assert.ok(end <= bytes.length);
    if ((bytes[at] & 127) === 4) {
      const body = bytes.subarray(at + 4, end); assert.ok(body.length <= limits.commentBytes);
      const parsed = parseVorbisCommentBlock(body); assert.ok(parsed.entries.length <= 64 && parsed.entries.every(entry => !entry.startsWith("BOUND_FIELD_")));
      const added = fieldBudgetAddedEntries(textEntries - parsed.entries.length), prefix = Buffer.from(body);
      prefix.writeUInt32LE(textEntries, 4 + body.readUInt32LE(0));
      const pieces = [prefix];
      for (const value of added) { const encoded = Buffer.from(value), length = Buffer.alloc(4); assert.ok(encoded.length < limits.valueBytes); length.writeUInt32LE(encoded.length); pieces.push(length, encoded); }
      const updated = Buffer.concat(pieces); assert.ok(updated.length <= limits.commentBytes);
      const header = Buffer.from(bytes.subarray(at, at + 4)); header.writeUIntBE(updated.length, 1, 3);
      const generated = Buffer.concat([bytes.subarray(0, at), header, updated, bytes.subarray(end)]); assert.ok(generated.length <= limits.fileBytes);
      assert.ok(audioTail(generated).equals(audioTail(bytes)), "Every original compressed audio byte must remain unchanged");
      return { generated, expectedAddedEntries: added, summary: { inputTextEntries: textEntries, originalTextEntries: parsed.entries.length,
        addedFields: added.length, addedFieldsSha256: sha(Buffer.from(added.join("\n"))), serializedCommentBytes: updated.length,
        originalAudioBytesUnchanged: true, originalAudioSha256: sha(audioTail(bytes)),
        explicitlyGeneratedOverLimitInput: textEntries === 4097, outputAcceptance: false, publicAcceptance: false } };
    }
    at = end; if (last) break;
  }
  throw new Error("Generated FLAC fixture has no comment block");
}
export async function createAudioMetadataFieldBudgetFixtures(directory) {
  const root = path.resolve(import.meta.dirname, "../.."), relative = path.relative(path.join(root, "work"), directory);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink()); assert.equal(await realpath(directory), directory);
  const readGenerated = async name => {
    const file = path.join(directory, name), before = await lstat(file, { bigint: true });
    assert.ok(before.isFile() && !before.isSymbolicLink() && before.size > 0n && before.size <= BigInt(FIELD_BUDGET_FIXTURE_LIMITS.fileBytes));
    const bytes = await readFile(file), after = await lstat(file, { bigint: true });
    for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(after[key], before[key]);
    return bytes;
  };
  const canonical = await readGenerated("source.flac");
  assert.equal(canonical.length, 37086); assert.equal(sha(canonical), "bceca191b7b40164857884b4c95ac5b2b78e0c4969f3fad391b7c421adcc36bc");
  const cover = await readGenerated("source-artwork-png-budget.flac");
  assert.equal(cover.length, 4231536); assert.equal(sha(cover), "301d7332823f17f346eea802409d6459199056b59a2d8d17ba8bef6c40f1f919");
  const repeated = await readGenerated("source-repeated.flac");
  assert.ok(repeated.length < 1048576); assert.ok(audioTail(repeated).equals(audioTail(canonical)));
  const output = {};
  for (const [key, source, count] of [["cover4095", cover, 4095], ["cover4096", cover, 4096], ["text4097", repeated, 4097]]) {
    const result = makeGeneratedFlacFieldBudget(source, count), file = path.join(directory, "source-fields-" + key + ".flac");
    await writeFile(file, result.generated, { flag: "wx" });
    output[key] = { file, bytes: result.generated.length, sha256: sha(result.generated), expectedAddedEntries: result.expectedAddedEntries, summary: result.summary };
  }
  return output;
}
