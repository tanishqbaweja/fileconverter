import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { patchVaaSource, verifyVaaProof } from "../scripts/lib/openh264-vaa-patch.mjs";
const evidence = JSON.parse(await readFile(new URL("../evidence/openh264-vaa-arithmetic-2026-10-04.json", import.meta.url), "utf8"));
const helper = await readFile(new URL("../media/ffmpeg/openh264-vaa-simd.h", import.meta.url));

test("private VAA patch requires actual completed scalar-equivalence proof for exactly this helper", () => {
  assert.equal(verifyVaaProof(evidence, helper).cases, 132101);
  assert.throws(() => verifyVaaProof(evidence, Buffer.concat([helper, Buffer.from("drift")])), /actually proven SIMD helper/);
  const incomplete = structuredClone(evidence);
  incomplete.attempts[1].report.totalCases = 132100;
  assert.throws(() => verifyVaaProof(incomplete, helper));
  assert.throws(() => verifyVaaProof({ attempts: [evidence.attempts[0]] }, helper), /Completed compiled/);
  assert.throws(() => patchVaaSource(Buffer.from("unexpected dependency source")), /Pinned OpenH264/);
});
test("opt-in native delegate and proof are included in private manifest and corresponding-source bundle", async () => {
  const recipe = await readFile(new URL("../media/ffmpeg/build-h264-candidate.sh", import.meta.url), "utf8");
  const manifest = await readFile(new URL("../media/ffmpeg/h264-candidate-manifest.mjs", import.meta.url), "utf8");
  assert.match(recipe, /source-bundle\/scripts\/lib/);
  assert.match(recipe, /cp vaa-simd-patch.json source-bundle/);
  assert.match(manifest, /openh264VaaSimd: vaaSimd === "1"/);
  assert.match(manifest, /openh264VaaSimdProvenance: vaaPatch/);
  const applier = await readFile(new URL("../scripts/apply-vaa-simd.mjs", import.meta.url), "utf8");
  assert.match(applier, /await realpath\(sourcePath\) !== sourcePath/);
  assert.match(applier, /proofEvidenceSha256: sha\(rawProof\)/);
});
