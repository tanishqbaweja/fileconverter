// Rebind actual native identity/types/layout, preserving the qualified encoder.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function deriveLtoBrowserNativeSource(source,root){
  const relocated=source.replace(/from "(\.[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",file)).href)}`);
  const uri=pathToFileURL(path.join(root,"media/ffmpeg/mpeg2-lto-builder-recipe.mjs")).href;
  return exactPatch(source,[[source,relocated],
    ['export const JSPI_DECODER_SHA256 = "4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57";',
      'export const JSPI_DECODER_SHA256 = "49e8229f4bbfb43fb93c0c59ebfa2fac9f3574944f50c58078d6d1dd00925c2d";'],
    ['export const JSPI_NATIVE_PROOF = "evidence/jspi-native-sources-39072949964.json";',
      `import {makeLtoShellRecipe} from ${JSON.stringify(uri)};\nexport const JSPI_NATIVE_PROOF = "evidence/lto-native-sources-39279724223.json";`],
    ['assert.equal(proof.sourceCount, 132);',
      'assert.equal(proof.sourceCount, 138);assert.equal(proof.onlyDecoderLibraryCompileLinkFlagsChanged,true);\n  const ltoRecipe=makeLtoShellRecipe((await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")).toString());\n  assert.deepEqual(build.manifest.libraryLto,ltoRecipe.libraryLto);assert.equal(build.manifest.jspi.generatedShell,ltoRecipe.generated);'],
    ['[126, 6]', '[126, 12]'],
    ['"work/mpeg2-jspi-39072949964"', '"work/mpeg2-lto-39279724223"'],
    ['"work/mpeg2-duration-drain-38678806473/within-mpeg2-split.wasm"', '"work/mpeg2-jspi-39072949964/within-mpeg2-split.wasm"'],
    ['"e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e"', '"4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57"'],
    ['  assert.deepEqual(proof.layout, { _gm_: { address: 1786904, bytes: 496 }, within_allocator_attempt_words: { address: 1918992, bytes: 64 },\n    within_realloc_attempt_words: { address: 1919056, bytes: 64 }, within_refstruct_abort_words: { address: 1919120, bytes: 64 } });',
      '  assert.deepEqual(proof.layout, { _gm_: { address: 408936, bytes: 496 }, within_allocator_attempt_words: { address: 541024, bytes: 64 },\n    within_realloc_attempt_words: { address: 541088, bytes: 64 }, within_refstruct_abort_words: { address: 1913344, bytes: 64 } });'],
    ['sourceCount: 132,', 'sourceCount: 138,'],
    ['manifest.scope = "private-jspi-decoder-with-qualified-plane-encoder-not-public-acceptance";',
      'manifest.scope = "private-library-lto-jspi-decoder-with-qualified-plane-encoder-not-public-acceptance";'],
    ['manifest.jspi = structuredClone(native.build.manifest.jspi);',
      'manifest.jspi = structuredClone(native.build.manifest.jspi);\n  manifest.libraryLto = structuredClone(native.build.manifest.libraryLto);'],
  ]);
}
const root=path.resolve(import.meta.dirname,"../.."),recipe=deriveLtoBrowserNativeSource(await readFile(path.join(root,"scripts/lib/jspi-browser-native.mjs"),"utf8"),root);
const components=await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
export const ltoBrowserNativeDerivation=recipe;
export const loadLtoBrowserNative=components.loadJspiBrowserNative;
export const makeLtoBrowserComposition=components.makeJspiBrowserComposition;
export const copyLtoBrowserCandidate=components.copyJspiBrowserCandidate;
export const verifyLtoBrowserCandidate=components.verifyJspiBrowserCandidate;
assert.equal(components.JSPI_DECODER_SHA256,"49e8229f4bbfb43fb93c0c59ebfa2fac9f3574944f50c58078d6d1dd00925c2d");
