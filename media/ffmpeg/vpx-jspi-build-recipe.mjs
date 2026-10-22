// Reuse the exact corrected timeline builder; change only suspension machinery.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeVpxTimelineRecipe, makeVpxTimelineWorkflow } from "./vpx-aac-candidate.mjs";
export const VPX_JSPI_BUILDER_PARENT_SHA256 = "8d10f0b48a6dce0e2683fbcfcac88773ee40cf7629d98025fedb1688bc51d70e";
export const VPX_JSPI_BUILD_FILES = ["media/ffmpeg/vpx-jspi-candidate.mjs", "media/ffmpeg/vpx-jspi-build-recipe.mjs",
  "media/ffmpeg/make-vpx-jspi-candidate.mjs", "media/ffmpeg/build-vpx-jspi-candidate.mjs"];
const sha = value => createHash("sha256").update(value).digest("hex");
function exact(source, edits) {
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, source); return { generated, generatedSha256: sha(generated), edits, publicAcceptance: false };
}
export function makeVpxJspiRecipe(source) {
  const base = makeVpxTimelineRecipe(source).generated;
  const link = "  WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh\n";
  return exact(base, [[link,
    '  node "${SCRIPT_DIR}/make-vpx-jspi-candidate.mjs" "${BUILD_ROOT}/build-remux.sh"\n' + link +
    '  cp -- "${BUILD_ROOT}/build-remux.sh" "${OUTPUT_ROOT}/build-remux.vpx-jspi.sh"\n']]);
}
export function makeVpxJspiWorkflow(source) {
  const base = makeVpxTimelineWorkflow(source).generated;
  return exact(base, [
    ["WITHIN_PRIVATE_VPX_TIMELINE=1 node media/ffmpeg/build-vpx-aac-candidate.mjs", "node media/ffmpeg/build-vpx-jspi-candidate.mjs"],
    ["name: private-vpx-timeline-${{ github.run_id }}", "name: private-vpx-jspi-${{ github.run_id }}"],
    ["            work/ffmpeg-nondocker-output/config_components.h\n",
      "            work/ffmpeg-nondocker-output/config_components.h\n            work/ffmpeg-nondocker-output/build-remux.vpx-jspi.sh\n"],
  ]);
}
export function makeVpxJspiBuilder(source) {
  assert.equal(sha(source), VPX_JSPI_BUILDER_PARENT_SHA256);
  // The generated module lives at work/<owned-random>/builder.mjs, the same
  // depth as media/ffmpeg. Explicit import rewrites preserve all other logic.
  const edits = ["vpx-decoder-candidate.mjs", "vpx-preserving-candidate.mjs", "vpx-aac-candidate.mjs"].map(file =>
    [`from "./${file}";`, `from "../../media/ffmpeg/${file}";`]);
  edits.push(
    ['const root = path.resolve(import.meta.dirname, "../.."),',
      'import { makeVpxJspiRecipe } from "../../media/ffmpeg/vpx-jspi-build-recipe.mjs";\nconst root = path.resolve(import.meta.dirname, "../.."),'],
    ['const recipe = (timeline ? makeVpxTimelineRecipe : makeVpxAacRecipe)((await read("media/ffmpeg/reproduce-nondocker.sh")).toString());',
      'assert.equal(timeline, true);\nconst recipe = makeVpxJspiRecipe((await read("media/ffmpeg/reproduce-nondocker.sh")).toString());'],
    ['const sourceFiles = [', `const sourceFiles = [${VPX_JSPI_BUILD_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ['engine: timeline ? "within-remux-private-vpx-timeline" : "within-remux-private-vpx-aac-editlist",',
      'engine: "within-remux-private-vpx-jspi",'],
    ['candidate: { ...components,', 'candidate: { ...components, jspi: { suspensionOnly: true, asyncifyInstrumentationRemoved: true,\n' +
      '      engineManagedStackBytes: null, engineManagedMemoryIncludedInPrimaryMetric: true,\n' +
      '      browserFlagsChanged: false, codecSettingsChanged: false, speedGainProven: false, memoryAcceptance: false },\n' +
      '      generatedBuilderSha256: sha(await readFile(import.meta.filename)),'],
    ['  const limits = readWasmMemoryLimits(wasm);', '  assert.ok(mjs.toString().includes("WebAssembly.Suspending") && mjs.toString().includes("WebAssembly.promising"));\n' +
      '  const exports = WebAssembly.Module.exports(new WebAssembly.Module(wasm));\n' +
      '  assert.deepEqual(exports.filter(row => /asyncify_(start|stop)_(unwind|rewind)/.test(row.name)), []);\n' +
      '  const limits = readWasmMemoryLimits(wasm);'],
  );
  return exact(source, edits);
}
