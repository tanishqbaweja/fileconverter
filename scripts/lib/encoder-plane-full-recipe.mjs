// Additive derivatives: preserve the exact executed full gate and its callers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeSingleIdleFullDriver, verifySingleIdleAbortQualification } from "./single-idle-full-recipe.mjs";
import { SINGLE_IDLE_SLOT } from "./single-idle-browser-recipe.mjs";
import { ENCODER_PLANE_SLOT, verifyEncoderPlaneBuildEvidence } from "./encoder-plane-browser-recipe.mjs";
export { verifySingleIdleAbortQualification };
export const FULL_CALLER_SHA = "b9c4a5421c76afaaba60fc90d0403eb62a599e85dcc07ded631bd1536d144d0b";
export const ABORT_STAGER_SHA = "051a8bc195108a118fe5acc98b975d2a5353512887e72d24c656eb56a30954bf";
export const encoderPlaneFullFiles = [
  "scripts/run-encoder-plane-original-full.mjs", "scripts/lib/encoder-plane-full-recipe.mjs",
  "scripts/stage-mpeg2-encoder-plane-abort.mjs", "tests/mpeg2-encoder-plane-full.test.mjs",
  "scripts/lib/encoder-plane-browser-recipe.mjs", "scripts/lib/encoder-plane-build-workflow.mjs",
  "scripts/lib/single-idle-full-recipe.mjs", "scripts/run-single-idle-original-full.mjs",
  "scripts/stage-mpeg2-single-idle-abort.mjs", "scripts/lib/single-idle-browser-recipe.mjs",
  "evidence/mpeg2-single-idle-abort-layout-2026-10-10.json",
  "evidence/mpeg2-single-idle-build-branch-2026-10-10.json",
  "evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json",
  "evidence/mpeg2-encoder-plane-build-38044000567.json",
  "evidence/2026-10-10T10-17-44-886Z-encoder-plane-browser-goldens.json",
];
function editExactly(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) {
    assert.equal(generated.split(before).length - 1, count, before);
    generated = generated.replaceAll(before, after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, source, "No hidden changes to original acceptance gates");
  return { generated, edits, generatedSha256: sha(generated) };
}
function absoluteImports(source, root) {
  const edits = [];
  for (const match of source.matchAll(/^(import[^\r\n]*from) "(\.\/lib\/[^"\r\n]+)";$/gm))
    edits.push([match[0], `${match[1]} ${JSON.stringify(pathToFileURL(path.join(root, "scripts", match[2])).href)};`]);
  return edits;
}
export function makeEncoderPlaneFullDriver(previous, root, runtime, branch) {
  const read = file => JSON.parse(readFileSync(path.join(root, file)));
  const build = read("evidence/mpeg2-encoder-plane-build-38044000567.json");
  verifyEncoderPlaneBuildEvidence(build, branch);
  const decoderBranch = read("evidence/mpeg2-single-idle-build-branch-2026-10-10.json");
  const original = makeSingleIdleFullDriver(previous, root, runtime, decoderBranch);
  const source = original.generated;
  const workflowImport = source.match(/^import \{makeSingleIdleBuildWorkflow\} from ".*?";$/m); assert.ok(workflowImport);
  const workflowBlock = source.match(/for \(const \[file, hash\] of Object\.entries\(manifest\.sources\)\) \{[\s\S]*?\n\}/); assert.ok(workflowBlock);
  const workflowAfter = `for (const [file, hash] of Object.entries(manifest.sources)) assert.equal(await shaFile(path.join(root,file)),hash,file);
assert.equal(Object.hasOwn(manifest.sources, ${JSON.stringify(branch.workflow.path)}), false);
const canonical = await readFile(path.join(root, ${JSON.stringify(branch.workflow.path)}), "utf8");
assert.equal(createHash("sha256").update(canonical).digest("hex"), ${JSON.stringify(branch.workflow.canonicalSha256)});
assert.equal(createHash("sha256").update(makeEncoderPlaneBuildWorkflow(canonical)).digest("hex"), ${JSON.stringify(branch.workflow.generatedSha256)});
assert.equal(manifest.artifacts["split-encoder.wasm"], ${JSON.stringify(build.manifest.artifacts["split-encoder.wasm"])});
assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], ${JSON.stringify(build.manifest.artifacts["within-mpeg2-split.wasm"])});
assert.equal(createHash("sha256").update(JSON.stringify(manifest)).digest("hex"), ${JSON.stringify(sha(JSON.stringify(build.manifest)))});
assert.equal(manifest.provenance.encoder.commit, ${JSON.stringify(branch.commit)});`;
  const edits = [
    [workflowImport[0], `import {makeEncoderPlaneBuildWorkflow} from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/encoder-plane-build-workflow.mjs")).href)};`],
    [workflowBlock[0], workflowAfter],
    [SINGLE_IDLE_SLOT, ENCODER_PLANE_SLOT, source.split(SINGLE_IDLE_SLOT).length - 1],
    ['assert.equal(manifest.decoderMemoryBytes, 32 * MiB);', 'assert.equal(manifest.memories.decoderMux[0].initialPages * 65536, 32 * MiB);'],
    ['assert.equal(manifest.encoderMemoryBytes, 16 * MiB);', 'assert.equal(manifest.memories.encoder[0].initialPages * 65536, 16 * MiB);'],
    ['scripts/stage-mpeg2-single-idle-abort.mjs', 'scripts/stage-mpeg2-encoder-plane-abort.mjs', 3],
    ['-private-mpeg2-single-idle-full-native-100ms', '-private-mpeg2-encoder-plane-full-native-100ms'],
    ['"mpeg2-single-idle-full-runtime-"', '"mpeg2-encoder-plane-full-runtime-"'],
    ['"mode":"single-idle-full-completion"', '"mode":"encoder-plane-full-completion"'],
    ['"privateNativeCandidate":"hevc-single-idle"', '"privateNativeCandidate":"hevc-single-idle-plus-encoder-plane"'],
    ['const sourceFiles = [', 'const sourceFiles = [' + encoderPlaneFullFiles.map(file => JSON.stringify(file) + ',').join('')],
  ];
  const derived = editExactly(source, edits);
  return { ...original, ...derived, previousSingleIdleDriverSha256: sha(source), singleIdleEdits: original.edits,
    candidateName: ENCODER_PLANE_SLOT, unchangedDecoderQualification: true, publicAcceptance: false };
}
export function makeEncoderPlaneFullCaller(source, root) {
  assert.equal(sha(source), FULL_CALLER_SHA);
  const edits = [
    ['import { makeSingleIdleFullDriver, verifySingleIdleAbortQualification, singleIdleFullFiles } from "./lib/single-idle-full-recipe.mjs";',
      'import { makeEncoderPlaneFullDriver as makeSingleIdleFullDriver, verifySingleIdleAbortQualification, encoderPlaneFullFiles as singleIdleFullFiles } from "./lib/encoder-plane-full-recipe.mjs";'],
    ['import { verifySingleIdleBuildEvidence, SINGLE_IDLE_SLOT } from "./lib/single-idle-browser-recipe.mjs";',
      'import { verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence, ENCODER_PLANE_SLOT as SINGLE_IDLE_SLOT } from "./lib/encoder-plane-browser-recipe.mjs";'],
    ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
    ['evidence/mpeg2-single-idle-build-branch-2026-10-10.json', 'evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json'],
    ['evidence/mpeg2-single-idle-build-37986418102.json', 'evidence/mpeg2-encoder-plane-build-38044000567.json'],
    ['evidence/2026-10-09T20-41-29-131Z-single-idle-browser-goldens.json', 'evidence/2026-10-10T10-17-44-886Z-encoder-plane-browser-goldens.json'],
    ['...singleIdleFullFiles, "scripts/lib/single-idle-build-workflow.mjs"', '...singleIdleFullFiles, "scripts/lib/encoder-plane-build-workflow.mjs", branch.workflow.path'],
    ['assert.equal(goldens.status, "five-headless-goldens-byte-exact-and-recovery-passed"); assert.equal(goldens.failure, null);',
      'assert.equal(goldens.status, "five-headless-goldens-byte-exact-and-recovery-passed"); assert.equal(goldens.failure, null);\nassert.equal(goldens.build.sha256, sha(buildBytes));\nassert.equal(goldens.branch.sha256, sha(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json")));'],
    ['name.endsWith("-single-idle-full-live.json")', '(name.endsWith("-single-idle-full-live.json") || name.endsWith("-encoder-plane-full-live.json"))'],
    ['"single-idle-full-wrapper-"', '"encoder-plane-full-wrapper-"'],
    ['-single-idle-full-post-cancel-partial-blink.json.gz', '-encoder-plane-full-post-cancel-partial-blink.json.gz'],
    ['...recipe, traceHelper, sourcePreimages: preimages', '...recipe, traceHelper, generatedCaller: await readFile(import.meta.filename, "utf8"), sourcePreimages: preimages'],
    ['-single-idle-full-executed-sources.json.gz', '-encoder-plane-full-executed-sources.json.gz'],
    ['-single-idle-full-live.json`', '-encoder-plane-full-live.json`'],
    ['-private-mpeg2-single-idle-full-native-100ms.json', '-private-mpeg2-encoder-plane-full-native-100ms.json'],
    ['-single-idle-full-raw.json.gz', '-encoder-plane-full-raw.json.gz'],
    ['-single-idle-original-full${', '-encoder-plane-original-full${'],
  ];
  const first = editExactly(source, edits), imports = absoluteImports(first.generated, root);
  const second = editExactly(first.generated, imports);
  return { ...second, edits: [...edits, ...imports] };
}
export function makeEncoderPlaneAbortStager(source, root) {
  assert.equal(sha(source), ABORT_STAGER_SHA);
  const edits = [
    ['import { makeSingleIdleBrowserRecipe, FROZEN_BROWSER_SOURCES, SINGLE_IDLE_SLOT } from "./lib/single-idle-browser-recipe.mjs";',
      'import { makeEncoderPlaneBrowserRecipe as makeSingleIdleBrowserRecipe, verifyEncoderPlaneBuildEvidence, FROZEN_BROWSER_SOURCES, ENCODER_PLANE_SLOT as SINGLE_IDLE_SLOT } from "./lib/encoder-plane-browser-recipe.mjs";'],
    ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
    ['"work/" + SINGLE_IDLE_SLOT + "/decoder-link.map"', 'path.dirname(qualification.binary.path) + "/decoder-link.map"'],
    ['evidence/mpeg2-single-idle-build-branch-2026-10-10.json', 'evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json'],
    ['const recipe = makeSingleIdleBrowserRecipe(sources, root, runtime.directory, "2026-10-10T00-00-00-000Z", branch);',
      'const build = JSON.parse(await read("evidence/mpeg2-encoder-plane-build-38044000567.json"));\n  verifyEncoderPlaneBuildEvidence(build, branch);\n  const recipe = makeSingleIdleBrowserRecipe(sources, root, runtime.directory, "2026-10-10T00-00-00-000Z", branch, build);'],
    ['"single-idle-abort-stager-"', '"encoder-plane-abort-stager-"'],
  ];
  const first = editExactly(source, edits), imports = absoluteImports(first.generated, root);
  const second = editExactly(first.generated, imports);
  return { ...second, edits: [...edits, ...imports] };
}
