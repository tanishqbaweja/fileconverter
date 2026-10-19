// Private decoder-library compilation experiment. No codec/heap/I/O policy edit.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "../../scripts/lib/ebml-reuse-browser-components.mjs";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeJspiShellRecipe, makeJspiHostedBuilder,
  makeAlignment16Builder as parentInner, makePacketCacheOuterBuilder as parentOuter,
  makePacketCacheHevcWrapper as parentHevc, makePacketCachePipelineGenerator } from "./mpeg2-jspi-builder-recipe.mjs";
export { makePacketCachePipelineGenerator };
export { JSPI_IMPORTS } from "./mpeg2-jspi-builder-recipe.mjs";
export const LTO_BUILD_FILES = ["media/ffmpeg/mpeg2-lto-builder-recipe.mjs", "media/ffmpeg/build-mpeg2-lto.mjs",
  "scripts/lib/lto-build-recipe.mjs", "scripts/prepare-lto-build-branch.mjs", "scripts/collect-lto-build.mjs", "tests/mpeg2-lto-build.test.mjs"];
const libraryEdits = [
  ['--extra-cflags="-O3 -fno-math-errno -msimd128 -pthread -I${PREFIX}/include"', '--extra-cflags="-O3 -flto -fno-math-errno -msimd128 -pthread -I${PREFIX}/include"'],
  ['--extra-ldflags="-O3 -pthread -L${PREFIX}/lib"', '--extra-ldflags="-O3 -flto -pthread -L${PREFIX}/lib"'],
];
export function makeLtoShellRecipe(source) {
  const parent = makeJspiShellRecipe(source), flags = exactPatch(parent.generated, libraryEdits);
  // Disjoint transformations must commute. JSPI provenance still describes its
  // exact two suspension edits, now applied to the LTO-enabled Asyncify parent.
  const ltoAsyncify = exactPatch(parent.parent, libraryEdits), jspi = exactPatch(ltoAsyncify.generated, parent.edits);
  if (jspi.generated !== flags.generated) throw new Error("LTO and JSPI edits must commute exactly");
  return { ...parent, ...jspi, parent: ltoAsyncify.generated, parentSha256: sha(ltoAsyncify.generated),
    libraryLto: { parentJspiShellSha256: sha(parent.generated), generatedShellSha256: sha(flags.generated),
      libraryEdits: flags.edits, compileAndLinkFlags: "-flto", onlyDecoderLibrariesChanged: true,
      separateEncoderChanged: false, codecSettingsChanged: false, heapLimitsChanged: false,
      stackGuardsChanged: false, speedGainProven: false, browserAcceptance: false } };
}
export const makeLtoShellText = source => makeLtoShellRecipe(source).generated;
const routes = root => [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-jspi-builder-recipe.mjs")).href,
  pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-lto-builder-recipe.mjs")).href]];
export const makeAlignment16Builder = (source, root) => exactPatch(parentInner(source, root).generated, [
  ["media/ffmpeg/mpeg2-jspi-builder-recipe.mjs", "media/ffmpeg/mpeg2-lto-builder-recipe.mjs"],
  ["makeJspiShellText as makeAlignedReuseRecipe", "makeLtoShellText as makeAlignedReuseRecipe"],
]);
export const makePacketCacheOuterBuilder = (source, root) => exactPatch(parentOuter(source, root).generated, routes(root));
export const makePacketCacheHevcWrapper = (source, root) => exactPatch(parentHevc(source, root).generated, routes(root));
export function makeLtoHostedBuilder(source, root) {
  const parent = makeJspiHostedBuilder(source, root).generated;
  return exactPatch(parent, [
    ...routes(root),
    ['import { makeJspiShellRecipe, makePacketCacheOuterBuilder', 'import { makeLtoShellRecipe as makeJspiShellRecipe, makePacketCacheOuterBuilder'],
    ['const sourceFiles = [', `const sourceFiles = [${LTO_BUILD_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ['  const retained = JSON.parse(await readFile(manifestPath));',
      '  manifest.libraryLto = jspiShell.libraryLto;\n  manifest.scope = "private-jspi-library-lto-not-browser-acceptance";\n  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+"\\n");\n  const retained = JSON.parse(await readFile(manifestPath));'],
  ]);
}
