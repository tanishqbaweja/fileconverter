// Explicit native prerequisite, never silently skipped based on local artifact presence.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root=process.cwd(),read=file=>readFile(path.join(root,file));
const proof=JSON.parse(await read("evidence/lto-native-sources-39279724223.json"));
test("local private composition verifies actual new decoder and preserves qualified plane encoder; no browser acceptance",async()=>{
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT="evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  const {loadLtoBrowserNative,makeLtoBrowserComposition,ltoBrowserNativeDerivation}=await import("../scripts/lib/lto-browser-native.mjs");
  const native=await loadLtoBrowserNative(root);assert.equal(native.envelope.sourceCount,138);
  assert.equal(native.proof.layout._gm_.address,408936);assert.equal(native.functions.length,11);
  const composition=await makeLtoBrowserComposition(root);
  assert.equal(composition.files["split-encoder.wasm"].sha256,proof.browserCompositionMustKeepEncoderSha256);
  assert.equal(composition.files["within-mpeg2-split.wasm"].sha256,proof.decoder.sha256);
  assert.equal(composition.manifest.libraryLto.onlyDecoderLibrariesChanged,true);
  let restored=ltoBrowserNativeDerivation.generated;
  for(const [before,after]of ltoBrowserNativeDerivation.edits.toReversed())restored=restored.replace(after,before);
  assert.equal(restored,(await read("scripts/lib/jspi-browser-native.mjs")).toString());
});
