import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { provenSourceSha } from "./helpers/nondocker-workflow-provenance.mjs";

test("Historical build workflow provenance reverses only two unit artifact lines", async () => {
  const file = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
  const old = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
  const bytes = await readFile(new URL(`../${file}`, import.meta.url));
  const line = "            work/mpeg2-candidate-output/refstruct-diagnostic-smoke.json\n";
  const accessory = "            work/mpeg2-candidate-output/mpeg2-accessory-smoke.json\n";
  assert.equal(provenSourceSha(file, bytes, old), old);
  assert.equal(provenSourceSha(file, Buffer.from(bytes.toString().replace(line, "").replace(accessory, "")), old), old);
  assert.throws(() => provenSourceSha(file, Buffer.from(bytes.toString().replace(line, "")), old));
  assert.throws(() => provenSourceSha(file, Buffer.from(bytes.toString().replace(accessory, "")), old));
  assert.throws(() => provenSourceSha(file, Buffer.concat([bytes, Buffer.from("# changed build\n")]), old));
  assert.throws(() => provenSourceSha(file, Buffer.concat([bytes, Buffer.from(line)]), old));
  assert.throws(() => provenSourceSha(file, Buffer.concat([bytes, Buffer.from(accessory)]), old));
  assert.notEqual(provenSourceSha("unrelated", bytes, old), old);
  const readerOnly = "8442e48304e6ba448cad205f1e6dfd5757a41e25f6b20be4a50c611957a1f767";
  assert.equal(provenSourceSha(file, bytes, readerOnly), readerOnly);
  assert.equal(provenSourceSha(file, Buffer.from(bytes.toString().replace(accessory, "")), readerOnly), readerOnly);
  assert.throws(() => provenSourceSha(file, Buffer.concat([bytes, Buffer.from("# changed build\n")]), readerOnly));
  assert.throws(() => provenSourceSha(file, Buffer.concat([bytes, Buffer.from(accessory)]), readerOnly));
});
test("Private allocator workflow selector reverses exactly and rejects incomplete/default/other changes", async () => {
  const file = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
  const old = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
  const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  assert.equal(provenSourceSha(file, Buffer.from(text), old), old);
  assert.throws(() => provenSourceSha(file, Buffer.from(text.replace("        default: emmalloc", "        default: dlmalloc")), old));
  assert.throws(() => provenSourceSha(file, Buffer.from(text.replace("      mpeg2_allocator:", "      changed_allocator:")), old));
  assert.throws(() => provenSourceSha(file, Buffer.from(text.replace("WITHIN_MPEG2_ALLOCATOR=", "CHANGED_MPEG2_ALLOCATOR=")), old));
  assert.throws(() => provenSourceSha(file, Buffer.from(text + "# unrelated change\n"), old));
});
test("Private plane attribution selector reverses exactly and rejects changed defaults or unpaired additions", async () => {
  const file = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
  const old = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
  const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  assert.equal(provenSourceSha(file, Buffer.from(text), old), old);
  for (const [from, to] of [["      mpeg2_frame_allocation_diagnostic:", "      other_plane_diagnostic:"],
    ["WITHIN_MPEG2_FRAME_ALLOCATION_DIAGNOSTIC=", "OTHER_MPEG2_FRAME_DIAGNOSTIC="],
    ["Private scalar plane attribution only, never acceptance", "Changed plane description"],
    ["inputs.mpeg2_frame_allocation_diagnostic || '0'", "inputs.mpeg2_frame_allocation_diagnostic || '1'"]])
    assert.throws(() => provenSourceSha(file, Buffer.from(text.replace(from, to)), old));
  assert.throws(() => provenSourceSha(file, Buffer.from(text + "      mpeg2_frame_allocation_diagnostic:\n"), old));
});
test("Additional private decoder selector preserves exact broad default and historical workflow bytes", async () => {
  const file = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
  const old = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
  const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  assert.equal(provenSourceSha(file, Buffer.from(text), old), old);
  for (const [from, to] of [["        default: wide", "        default: hevc-mpeg4"],
    ["      mpeg2_decoder_set:", "      other_decoder_set:"],
    ["WITHIN_MPEG2_DECODER_SET=", "OTHER_MPEG2_DECODER_SET="],
    ["Additional private decoder module, broad default retained", "Changed description"]])
    assert.throws(() => provenSourceSha(file, Buffer.from(text.replace(from, to)), old));
  assert.throws(() => provenSourceSha(file, Buffer.from(text + "      mpeg2_decoder_set:\n"), old));
});
