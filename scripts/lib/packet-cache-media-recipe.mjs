// Genuine short conversion + same-page recovery with qualified diagnostic core.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeEncoderPlaneRecoveryBrowserRecipe, inspectRecoveryDiagnostic } from "./encoder-plane-recovery-browser-recipe.mjs";
import { inspectBitrateDiagnostic } from "./encoder-plane-bitrate-browser-recipe.mjs";
import { makeLateAllocatorAbortAdapter } from "./mpeg2-late-allocator-abort-adapter.mjs";
import { makeFullBitrateAbortAdapter } from "./encoder-plane-bitrate-full-recipe.mjs";
import { makeCompositeAllocationAbortAdapter } from "./packet-cache-composite-abort-adapter.mjs";
import { createAttemptPlaneCandidate } from "./packet-cache-candidate.mjs";
import { ENCODER_PLANE_SLOT } from "./encoder-plane-browser-recipe.mjs";
function exact(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) { assert.ok(before && after); assert.equal(generated.split(before).length - 1, count, before.slice(0, 160)); generated = generated.replaceAll(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replaceAll(after, before);
  assert.equal(reverse, source, "Only listed identity/observer/evidence edits, all correctness/IO/cleanup gates retained");
  return { generated, edits, generatedSha256: sha(generated) };
}
export async function makeAttemptMediaBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  const old = makeEncoderPlaneRecoveryBrowserRecipe(sources, root, runtime, stamp, branch, build);
  const read = file => readFile(path.join(root, file)), text = async file => (await read(file)).toString(), json = async file => JSON.parse(await read(file));
  const prior = makeLateAllocatorAbortAdapter({ stager: sources["scripts/stage-mpeg2-split-direct.mjs"],
    stackHelper: await text("scripts/lib/bounded-wasm-abort-capture.mjs"), snapshotHelper: await text("scripts/lib/late-refstruct-abort-snapshot.mjs"),
    poolHelper: await text("scripts/lib/late-pool-abort-capture.mjs"), allocatorHelper: await text("scripts/lib/late-pool-allocator-abort-capture.mjs"),
    freeHeaderHelper: await text("scripts/lib/dlmalloc-free-header-inspection.mjs"), controlProof: await json("evidence/late-pool-abort-control-2026-10-08.json"),
    allocatorControlProof: await json("evidence/late-pool-allocator-abort-control-2026-10-08.json"), layoutProof: await json("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json") }).adapter;
  const composite = makeCompositeAllocationAbortAdapter({ previousAdapter: makeFullBitrateAbortAdapter(prior).adapter,
    attemptHelper: await text("scripts/lib/packet-cache-attempt-abort-capture.mjs"), compositeHelper: await text("scripts/lib/packet-cache-composite-abort-capture.mjs"),
    controlProofBytes: await read("evidence/2026-10-12T05-30-34-367Z-packet-cache-abort-control.json") });
  const candidateName = path.basename(runtime), identityEdits = source => {
    const edits = [];
    for (const [before, after] of [[JSON.stringify(ENCODER_PLANE_SLOT), JSON.stringify(candidateName)],
      [`/^${ENCODER_PLANE_SLOT}$/`, `/^${candidateName}$/`]]) {
      const count = source.split(before).length - 1; if (count) edits.push([before, after, count]);
    }
    return edits;
  };
  assert.match(candidateName, /^packet-cache-media-[A-Za-z0-9]+$/);
  const start = old.stage.indexOf("for (const [file, digest] of Object.entries(manifest.sources))"),
    endMarker = 'assert.equal(Object.hasOwn(manifest.sources, ".github/workflows/reproduce-ffmpeg-nondocker.yml"), false);';
  const end = old.stage.indexOf(endMarker); assert.ok(start > 0 && end > start);
  const block = old.stage.slice(start, end + endMarker.length);
  const adapterStart = old.stage.indexOf("const adapter = `"), adapterEnd = old.stage.indexOf("`;\nconst replacing = ", adapterStart);
  assert.ok(adapterStart > end && adapterEnd > adapterStart);
  const adapterBlock = old.stage.slice(adapterStart, adapterEnd + 2);
  const stageRecipe = exact(old.stage, [...identityEdits(old.stage),
    ['import assert from "node:assert/strict";', `import { verifyAttemptPlaneCandidate } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/packet-cache-candidate.mjs")).href)};\nimport assert from "node:assert/strict";`],
    [block, "await verifyAttemptPlaneCandidate(root, source);"],
    [adapterBlock, `const adapter = ${JSON.stringify(composite.adapter)};`]]);
  const specRecipe = exact(old.spec, identityEdits(old.spec)), driverRecipe = exact(old.driver, identityEdits(old.driver));
  const filter = ',maxFailures:1,grep:/private split MPEG2 (propagates direct output write failure|cancels after genuine direct output)/';
  const configRecipe = exact(old.config, [[filter, ',maxFailures:1,grep:/private split MPEG2 (hevc to mp4 via direct:|propagates direct output write failure|cancels after genuine direct output)/']]);
  const composition = await createAttemptPlaneCandidate(root, runtime);
  return { ...old, stage: stageRecipe.generated, spec: specRecipe.generated, driver: driverRecipe.generated, config: configRecipe.generated,
    integrationRecipes: { stage: stageRecipe, spec: specRecipe, driver: driverRecipe, config: configRecipe },
    candidateName, composition, compositeAdapter: { bytes: composite.adapterBytes, sha256: composite.adapterSha256 }, publicAcceptance: false };
}
export function inspectAttemptMediaReport(report, baseline, build) {
  const firstFailure = report.rows.findIndex(row => row.kind === "direct-write-failure"); assert.ok(firstFailure > 0);
  const normal = inspectBitrateDiagnostic({ ...report, rows: report.rows.slice(0, firstFailure) }, baseline, build, 4000000);
  assert.equal(normal.caseStatus, "passed"); assert.ok(normal.ordinalSsim >= 0.98);
  const recovery = inspectRecoveryDiagnostic(report, baseline, build);
  for (const result of recovery.results) { assert.deepEqual(result.analysis.input, normal.input); assert.equal(result.analysis.outputBytes, normal.outputBytes); }
  assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"], "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
  return { normal, recovery, genuineValidatedConversions: 3, completeChromiumMemoryAcceptance: false, fullOriginalAcceptance: false, publicAcceptance: false, speedImprovementProven: false };
}
export function makeAttemptMediaCaller(source, root) {
  assert.equal(sha(source), "fcbaf80c2ac563e6bfa8eb9db5a1c7ab71aa68e90d3170fdf22d5d1386d78c04");
  const edits = [
    ['const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));', `const root = ${JSON.stringify(root)}, read = file => readFile(path.join(root, file));`],
    ['import { makeEncoderPlaneBrowserRecipe as makeSingleIdleBrowserRecipe, verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence,\n  verifyEncoderPlaneGoldenReport as verifySingleIdleGoldenReport, FROZEN_BROWSER_SOURCES,',
      'import { makeAttemptMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectAttemptMediaReport as verifySingleIdleGoldenReport } from "./lib/packet-cache-media-recipe.mjs";\nimport { attemptMediaSourceFiles } from "./lib/packet-cache-candidate.mjs";\nimport { verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence, FROZEN_BROWSER_SOURCES,'],
    ['const sources = {}, sourcePins = {};', 'const sources = {}, sourcePins = {};\nconst extraSourceFiles = await attemptMediaSourceFiles(root);'],
    ['new Set([...Object.keys(build.manifest.sources),', 'new Set([...extraSourceFiles, ...Object.keys(build.manifest.sources),'],
    ['createOwnedRuntimeScratch("encoder-plane-browser-goldens-")', 'createOwnedRuntimeScratch("packet-cache-media-")'],
    ['generated = makeSingleIdleBrowserRecipe(', 'generated = await makeSingleIdleBrowserRecipe('],
    ['-${SINGLE_IDLE_SLOT}-direct-artwork.json', '-${generated.candidateName}-direct-artwork.json', 2],
    ['if (!rawRecord) {', 'if (!rawRecord && generated) {'],
    ['${stamp}-encoder-plane-${suffix}.gz', '${stamp}-packet-cache-media-${suffix}.gz'],
    ['${stamp}-encoder-plane-browser-goldens.json', '${stamp}-packet-cache-media.json'],
    ['five-headless-goldens-byte-exact-and-recovery-passed', 'three-headless-attempt-core-conversions-and-recovery-passed-not-full-acceptance'],
  ];
  const first = exact(source, edits), imports = [];
  for (const match of first.generated.matchAll(/from "(\.\/lib\/[^"\r\n]+)";/g))
    imports.push([match[0], `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", match[1])).href)};`]);
  return { ...exact(first.generated, imports), initialEdits: edits, previousCallerSha256: sha(source) };
}
