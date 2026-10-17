// JSPI changes only suspension machinery; all codec/kernel/I/O policies survive.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "../../scripts/lib/ebml-reuse-browser-components.mjs";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeDurationDrainShellRecipe, makeDurationDrainHostedBuilder,
  makeAlignment16Builder as parentInner, makePacketCacheOuterBuilder as parentOuter,
  makePacketCacheHevcWrapper as parentHevc, makePacketCachePipelineGenerator as parentPipeline,
} from "./mpeg2-duration-drain-builder-recipe.mjs";
export const JSPI_BUILD_FILES = ["media/ffmpeg/mpeg2-jspi-builder-recipe.mjs", "media/ffmpeg/build-mpeg2-jspi.mjs",
  "scripts/lib/jspi-build-recipe.mjs", "scripts/prepare-jspi-build-branch.mjs", "scripts/collect-jspi-build.mjs", "tests/mpeg2-jspi-build.test.mjs"];
export const JSPI_IMPORTS = ["within_input_read", "within_output_write", "within_output_rotate", "within_output_truncate", "within_output_flush"];
export function makeJspiShellRecipe(source) {
  const parent = makeDurationDrainShellRecipe(source);
  const recipe = exactPatch(parent, [
    ["-sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=262144", "-sJSPI=1 -sJSPI_EXPORTS='[\"within_remux\"]'"],
    [`-sASYNCIFY_IMPORTS='${JSON.stringify(JSPI_IMPORTS)}'`, `-sJSPI_IMPORTS='${JSON.stringify(JSPI_IMPORTS)}'`],
  ]);
  return { ...recipe, parent, parentSha256: sha(parent), codecSettingsChanged: false, heapLimitsChanged: false,
    browserFlagsChanged: false, speedGainProven: false, memoryAcceptance: false, publicAcceptance: false };
}
export const makeAlignment16Builder = (source, root) => exactPatch(parentInner(source, root).generated, [
  ["media/ffmpeg/mpeg2-duration-drain-builder-recipe.mjs", "media/ffmpeg/mpeg2-jspi-builder-recipe.mjs"],
  ["makeDurationDrainShellRecipe as makeAlignedReuseRecipe", "makeJspiShellText as makeAlignedReuseRecipe"],
]);
export const makeJspiShellText = source => makeJspiShellRecipe(source).generated;
const routes = root => [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-duration-drain-builder-recipe.mjs")).href,
  pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-jspi-builder-recipe.mjs")).href]];
export const makePacketCacheOuterBuilder = (source, root) => exactPatch(parentOuter(source, root).generated, routes(root));
export const makePacketCacheHevcWrapper = (source, root) => exactPatch(parentHevc(source, root).generated, routes(root));
export const makePacketCachePipelineGenerator = parentPipeline;
export function makeJspiHostedBuilder(source, root) {
  const checks = `  const jspiGlue = (await readFile(path.join(output, "within-mpeg2-split.mjs"))).toString();
  assert.ok(jspiGlue.includes("WebAssembly.Suspending") && jspiGlue.includes("WebAssembly.promising"));
  const jspiExports = WebAssembly.Module.exports(new WebAssembly.Module(decoder));
  assert.deepEqual(jspiExports.filter(row => /asyncify_(start|stop)_(unwind|rewind)/.test(row.name)), []);
  assert.ok(jspiExports.some(row => row.name === "within_remux"));
  const jspiShell = makeJspiShellRecipe((await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")).toString());
  manifest.asyncifyStackBytesDecoder = 0;
  manifest.scope = "private-jspi-duration-drain-not-browser-acceptance";
  manifest.jspi = { mode: "stable-WebAssembly-promising-and-Suspending", generatedShell: jspiShell.generated,
    generatedShellSha256: sha(jspiShell.generated), parentShellSha256: jspiShell.parentSha256, shellEdits: jspiShell.edits,
    asyncifyInstrumentationRemoved: true, asyncifyLinearStackBytes: 0,
    engineManagedStackMemoryBytes: null, engineManagedStackIncludedInProcessTreeMeasurement: true,
    asyncImports: ${JSON.stringify(JSPI_IMPORTS)}, asyncExports: ["within_remux"], minimumChrome: 137,
    aggregateWasmMemoryBytes: 50331648, codecSettingsChanged: false, heapLimitsChanged: false,
    browserFlagsChanged: false, productionIoChanged: false, browserFidelityVerified: false,
    fullOriginalCompleted: false, speedGainProven: false, memoryAcceptance: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
`;
  const parent = makeDurationDrainHostedBuilder(source, root).generated;
  return exactPatch(parent, [
    ...routes(root),
    ['import { makePacketCacheOuterBuilder, makePacketCachePipelineGenerator, makePacketCacheHevcWrapper }',
      'import { makeJspiShellRecipe, makePacketCacheOuterBuilder, makePacketCachePipelineGenerator, makePacketCacheHevcWrapper }'],
    ["const sourceFiles = [", `const sourceFiles = [${JSPI_BUILD_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ["  const retained = JSON.parse(await readFile(manifestPath));", checks + "  const retained = JSON.parse(await readFile(manifestPath));"],
  ]);
}
