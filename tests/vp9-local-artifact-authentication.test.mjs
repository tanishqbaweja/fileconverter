// Explicit local qualification: a missing retained trace or native byte must fail.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { authenticateVp9PackedArtifacts } from "../media/ffmpeg/vp9-token-packed-artifacts.mjs";

const read = file => readFile(new URL("../" + file, import.meta.url));
const json = async file => JSON.parse(await read(file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const label = "2026-11-06-vp9-token-packed-http-qualification-42244170876";

for (const [suffix, property, traceSuffix] of [["", "failureTrace", "-failure"], ["-attempt2", "boundedDiagnosticTrace", "-attempt2-bounded-trace"]]) {
  test(`retained VP9 HTTP ${property} ZIP matches its exact byte and SHA-256 pins`, async () => {
    const trace = (await json(`evidence/${label}${suffix}.json`))[property];
    const file = `output/playwright/${label}${traceSuffix}.zip`;
    assert.equal(trace.path.replaceAll("\\", "/"), file);
    const bytes = await read(file);
    assert.equal(bytes.length, trace.bytes);
    assert.equal(sha(bytes), trace.sha256);
  });
}

test("all retained real native/source bytes and final packed provenance authenticate without instantiating the codec", async () => {
  const n = await json("evidence/2026-11-06-vp9-original-width-native-42244170876.json");
  assert.equal(n.retainedDirectory, "work/vp9-duration-input-42244170876");
  const readNative = file => {
    assert.match(file, /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/);
    return read(`${n.retainedDirectory}/${file}`);
  };
  for (const [file, pin] of Object.entries(n.nativeContract.artifacts)) {
    const bytes = await readNative(file);
    assert.equal(bytes.length, pin.bytes, file);
    assert.equal(sha(bytes), pin.sha256, file);
  }
  const stems = { "vp9/encoder/vp9_tokenize.h": "vp9_tokenize.header", "vp9/encoder/vp9_tokenize.c": "vp9_tokenize.producer", "vp9/encoder/vp9_bitstream.c": "vp9_bitstream.packer" };
  const preimages = {};
  for (const [file, stem] of Object.entries(stems)) preimages[file] = (await readNative(stem + ".base.c")).toString();
  const actual = await authenticateVp9PackedArtifacts(readNative, preimages);
  assert.deepEqual(actual, n.nativeContract.candidate.tokenPacked);
  for (const [file, digest] of Object.entries(actual.sourceSha256s)) assert.equal(n.nativeContract.candidate.compiledVendorSources[file], digest);
  assert.equal(n.nativeContract.artifacts["within-remux.wasm"].sha256, "436db67db8c5c21aa862c4fb71de6fc1e2bc1344ee31c8beb084b102065118c5");
});
