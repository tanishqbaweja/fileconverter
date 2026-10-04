import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { patchSadSource, verifySadProof } from "../scripts/lib/openh264-sad-patch.mjs";
import { candidateDirectory } from "../scripts/lib/h264-candidate-selection.mjs";
const proof = JSON.parse(await readFile(new URL("../evidence/openh264-sad-arithmetic-2026-10-04.json", import.meta.url)));
const helper = await readFile(new URL("../media/ffmpeg/openh264-sad-simd.h", import.meta.url));

test("private SAD delegate requires the completed exact-helper compiled proof and refuses drift", () => {
  assert.equal(verifySadProof(proof, helper).cases, 529564);
  assert.throws(() => verifySadProof(proof, Buffer.concat([helper, Buffer.from("drift")])), /actually proven SAD helper/);
  const incomplete = structuredClone(proof); incomplete.report.totalCases--;
  assert.throws(() => verifySadProof(incomplete, helper));
  const stale = structuredClone(proof); stale.report.nodeVersion = "invented";
  assert.throws(() => verifySadProof(stale, helper));
  const running = structuredClone(proof); running.run.status = "in_progress";
  assert.throws(() => verifySadProof(running, helper), /Completed compiled SAD proof/);
  assert.throws(() => patchSadSource(Buffer.from("unexpected source")), /Pinned OpenH264 SAD/);
});
test("SAD opt-in build records proof and corresponding source without combining rejected experiments", async () => {
  const read = async (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const recipe = await read("media/ffmpeg/build-h264-candidate.sh"), manifest = await read("media/ffmpeg/h264-candidate-manifest.mjs");
  assert.match(recipe, /export WITHIN_H264_SAD_SIMD="\$\{WITHIN_H264_SAD_SIMD:-0\}"/);
  assert.match(recipe, /scripts\/apply-sad-simd.mjs/);
  assert.match(recipe, /cp sad-simd-patch.json source-bundle/);
  assert.match(recipe, /Do not combine rejected VAA SIMD/);
  assert.match(manifest, /openh264SadSimd: sadSimd === "1"/);
  assert.match(manifest, /openh264SadSimdProvenance: sadPatch/);
  assert.match(await read("scripts/apply-sad-simd.mjs"), /await realpath\(sourcePath\) !== sourcePath/);
  assert.match(candidateDirectory("owned-root", "h264-sad-candidate-output"), /h264-sad-candidate-output$/);
  assert.throws(() => candidateDirectory("owned-root", "../../unowned"));
});
