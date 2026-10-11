import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { validateMatroskaMp4StreamTitle } from "../scripts/lib/matroska-mp4-stream-title.mjs";
test("exact Unicode stream titles survive the MP4 name representation", () => {
  for (const title of ["Primary café — 音楽", "First café", "Second 音楽", "HDHub4u.Ag"])
    assert.equal(validateMatroskaMp4StreamTitle({ title }, { name: title }).value, title);
});
test("absent, changed, generic or contradictory stream names cannot pass", () => {
  for (const output of [{}, { handler_name: "VideoHandler" }, { name: "wrong" },
    { name: "expected", title: "wrong" }, { title: "expected" }])
    assert.throws(() => validateMatroskaMp4StreamTitle({ title: "expected" }, output));
  assert.throws(() => validateMatroskaMp4StreamTitle({}, {}));
  assert.throws(() => validateMatroskaMp4StreamTitle({ title: "" }, { name: "" }));
});
test("retained genuine browser outputs preserve audio titles as MP4 track names", () => {
  const proof = JSON.parse(readFileSync("evidence/2026-10-10T10-17-44-886Z-encoder-plane-browser-goldens.json"));
  const raw = JSON.parse(gunzipSync(readFileSync(proof.report.archive.path), { maxOutputLength: 2097152 }));
  const probes = raw.rows.filter(row => row.kind === "independent-pre-assertion-probes");
  assert.equal(probes.length, 3);
  for (const row of probes) {
    const source = row.sourceProbe.streams.filter(s => s.codec_type === "audio");
    const output = row.outputProbe.streams.filter(s => s.codec_type === "audio");
    assert.equal(source.length, 2); assert.equal(output.length, 2);
    for (let i = 0; i < 2; i++) {
      assert.equal(output[i].tags.title, undefined);
      assert.equal(validateMatroskaMp4StreamTitle(source[i].tags, output[i].tags).exactTextPreserved, true);
    }
  }
});
