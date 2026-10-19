import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeAlignment16Workflow as parentWorkflow, makeJspiBranchCaller, makeJspiCollector } from "./jspi-build-recipe.mjs";
export const makeAlignment16Workflow = source => exactPatch(parentWorkflow(source), [
  ["node media/ffmpeg/build-mpeg2-jspi.mjs", "node media/ffmpeg/build-mpeg2-lto.mjs"],
]).generated;
export function makeLtoBranchCaller(source, root) {
  return exactPatch(makeJspiBranchCaller(source, root).generated, [
    ["codex/mpeg2-jspi-20261018", "codex/mpeg2-library-lto-20261019"],
    ["evidence/mpeg2-jspi-build-branch-2026-10-18", "evidence/mpeg2-lto-build-branch-2026-10-19"],
    ["jspi-git-index-", "lto-git-index-"],
    ['["scripts/prepare-jspi-build-branch.mjs",', '["scripts/prepare-lto-build-branch.mjs", "scripts/lib/lto-build-recipe.mjs", "scripts/prepare-jspi-build-branch.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/jspi-build-recipe.mjs")).href, pathToFileURL(path.join(root, "scripts/lib/lto-build-recipe.mjs")).href],
    ["Build private JSPI suspension with unchanged clocks/codecs/fixed heaps", "Build decoder-library LTO with unchanged JSPI/clocks/codecs/fixed heaps"],
  ]);
}
export function makeLtoCollector(source, root) {
  const checks = `  const {makeLtoShellRecipe} = await import(${JSON.stringify(pathToFileURL(path.join(root,"media/ffmpeg/mpeg2-lto-builder-recipe.mjs")).href)});
  const ltoShell=makeLtoShellRecipe((await readFile(path.join(root,"media/ffmpeg/build-mpeg2-split-pipeline.sh"))).toString());
  assert.deepEqual(manifest.libraryLto,ltoShell.libraryLto);
  assert.equal(manifest.libraryLto.onlyDecoderLibrariesChanged,true);
  assert.equal(manifest.libraryLto.separateEncoderChanged,false);
  assert.equal(manifest.libraryLto.speedGainProven,false);
`;
  return exactPatch(makeJspiCollector(source, root).generated, [
    ["work/mpeg2-jspi-${runId}", "work/mpeg2-lto-${runId}"],
    ["evidence/mpeg2-jspi-build-${runId}.json", "evidence/mpeg2-lto-build-${runId}.json"],
    ["evidence/mpeg2-jspi-build-branch-2026-10-18.json", "evidence/mpeg2-lto-build-branch-2026-10-19.json"],
    ["jspi-artifact-", "lto-artifact-"],
    ["private-jspi-duration-drain-not-browser-acceptance", "private-jspi-library-lto-not-browser-acceptance"],
    [pathToFileURL(path.join(root,"media/ffmpeg/mpeg2-jspi-builder-recipe.mjs")).href,
      pathToFileURL(path.join(root,"media/ffmpeg/mpeg2-lto-builder-recipe.mjs")).href],
    ['const { makeJspiShellRecipe, JSPI_IMPORTS }', 'const { makeLtoShellRecipe: makeJspiShellRecipe, JSPI_IMPORTS }'],
    ["  complete = true;", checks + "  complete = true;"],
    ["actual-jspi-build-unit-verified-not-browser-acceptance", "actual-library-lto-build-unit-verified-not-browser-acceptance"],
  ]);
}
