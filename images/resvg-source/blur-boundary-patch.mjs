// Private boundary-only candidate. No public binary writes or accepted fidelity claim.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { pins, sha } from "./source-pins.mjs";
export const blurBoundaryPatch = Object.freeze({ revision: pins.resvg, sourceFile: "crates/resvg/src/filter/box_blur.rs",
  originalSha256: "a06d3873a14dc70471ca5cd022fc0def099fa72a911e9dcd4ac285e03acf098f",
  entrySha256: "80b16fcc4f45de174e5d804b5515c144f7b5b32ff9e52c525af97a63fdfd5a10",
  patchedSha256: "c21f5eb8dd43515068ec39421e8112060403373e74f50b4576916b7d910641a7",
  maximumWasmBytesUnchanged: 100663296, kernelWeightsRoundingOrPassCountChanged: false,
  nativeSourceRecipeIntegrated: false, browserFidelityProven: false, publicPromotion: false });
const before = `pub fn apply(sigma_x: f64, sigma_y: f64, mut src: ImageRefMut) {
    let boxes_horz = create_box_gauss(sigma_x as f32);
    let boxes_vert = create_box_gauss(sigma_y as f32);
    let mut backbuf = src.data.to_vec();
    let mut backbuf = ImageRefMut::new(src.width, src.height, &mut backbuf);

    for (box_size_horz, box_size_vert) in boxes_horz.iter().zip(boxes_vert.iter()) {
        let radius_horz = ((box_size_horz - 1) / 2) as usize;
        let radius_vert = ((box_size_vert - 1) / 2) as usize;
        box_blur_impl(radius_horz, radius_vert, &mut backbuf, &mut src);
    }
}
`;
export function patchPinnedBlurBoundary(bytes, entryBytes) {
  assert.ok(bytes.length <= 32768); assert.equal(sha(bytes), blurBoundaryPatch.originalSha256);
  assert.equal(sha(entryBytes), blurBoundaryPatch.entrySha256);
  const original = bytes.toString(), entry = entryBytes.toString().replace(/^(?:\/\/[^\n]*\n)+/, "");
  assert.equal(original.split(before).length, 2); assert.ok(entry.startsWith("pub fn apply("));
  const source = original.replace(before, entry);
  assert.equal(source.split(entry).length, 2); assert.equal(source.replace(entry, before), original);
  assert.equal(sha(source), blurBoundaryPatch.patchedSha256);
  return { bytes: Buffer.from(source), proof: { ...blurBoundaryPatch, originalBytes: bytes.length,
    patchedBytes: Buffer.byteLength(source), entireOriginalSourceRestoredByRemovingOnlyPatch: true,
    zeroHaloComputedFromExistingKernelSupport: true, allKernelAndRoundingFunctionsRetained: true,
    croppedBackToOriginalDimensions: true, additionalExpandedTemporaryBuffers: 2 } };
}
export async function readPinnedBoxBlurPreimage() {
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/resvg-box-blur-3495d870-preimage.json", import.meta.url)));
  assert.equal(archive.schemaVersion, 1); assert.equal(archive.revision, pins.resvg);
  assert.equal(archive.path, blurBoundaryPatch.sourceFile); assert.equal(archive.encoding, "gzip-base64");
  const bytes = gunzipSync(Buffer.from(archive.gzipBase64, "base64"), { maxOutputLength: 32768 });
  assert.equal(bytes.length, archive.bytes); assert.equal(sha(bytes), archive.sha256);
  assert.equal(archive.sha256, blurBoundaryPatch.originalSha256); return bytes;
}
