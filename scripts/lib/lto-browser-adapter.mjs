// Only actual native identity/slot/function-map rebinding. No guard relaxation.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { loadJspiBrowserAdapter, deriveJspiBrowserStager } from "./jspi-browser-adapter.mjs";
import { loadLtoBrowserNative } from "./lto-browser-native.mjs";
export function makeLtoBrowserAdapter(source,native){
  const parentSha="4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57",nextSha=native.proof.decoder.sha256;
  assert.equal(nextSha,"49e8229f4bbfb43fb93c0c59ebfa2fac9f3574944f50c58078d6d1dd00925c2d");
  assert.equal(native.proof.parentDecoder.sha256,parentSha);assert.equal(source.split(parentSha).length,3);
  const rebound=source.replaceAll(parentSha,nextSha);assert.equal(rebound.replaceAll(nextSha,parentSha),source);
  const groups=[["__wrap_av_realloc","emscripten_builtin_realloc","emscripten_builtin_malloc","sbrk"],
    ["__wrap_av_buffer_realloc","av_buffer_realloc"],["av_buffer_allocz","av_malloc","__wrap_posix_memalign","sbrk"],
    ["av_refstruct_pool_get","av_malloc"],["mpeg2_packets","av_malloc","__wrap_posix_memalign","sbrk"]];
  const index=(functions,name)=>{const rows=functions.filter(row=>row.name===name);assert.equal(rows.length,1);return rows[0].functionIndex;};
  const indexEdits=groups.map(names=>[JSON.stringify(names.map(name=>index(native.proof.parentFunctions,name))),JSON.stringify(names.map(name=>index(native.functions,name)))]);
  const layout=native.proof.layout;
  const edits=[...indexEdits.filter(([before,after])=>before!==after),
    ['const REALLOC_ALIGNED_SLOT = 1918992;',`const REALLOC_ALIGNED_SLOT = ${layout.within_allocator_attempt_words.address};`],
    ['const REALLOC_SLOT = 1919056, REALLOC_ALLOCATOR_ROOT = 1786904;',`const REALLOC_SLOT = ${layout.within_realloc_attempt_words.address}, REALLOC_ALLOCATOR_ROOT = ${layout._gm_.address};`],
    ['const REALLOC_POOL_SLOT = 1919120;',`const REALLOC_POOL_SLOT = ${layout.within_refstruct_abort_words.address};`],
  ];
  const recipe=exactPatch(rebound,edits);
  return{...recipe,originalSha256:sha(source),identityEdits:[parentSha,nextSha],exactNativeIndices:indexEdits,
    nativeLayout:layout,nativeEnvelope:native.envelope,codecSettingsChanged:false,productionIoChanged:false,
    capturedWordGuardsChanged:false,actualRuntimeFatalRequalified:false,publicAcceptance:false};
}
export async function loadLtoBrowserAdapter(root){
  const parent=await loadJspiBrowserAdapter(root),native=await loadLtoBrowserNative(root);
  return{...parent,parent,original:parent.recipe.generated,recipe:makeLtoBrowserAdapter(parent.recipe.generated,native)};
}
export async function deriveLtoBrowserStager(source,oldName,candidateName){
  const root=path.resolve(import.meta.dirname,"../.."),adapter=await loadLtoBrowserAdapter(root);
  const parent=await deriveJspiBrowserStager(source,oldName,candidateName);
  const before=pathToFileURL(path.join(root,"scripts/lib/jspi-browser-native.mjs")).href;
  const after=pathToFileURL(path.join(root,"scripts/lib/lto-browser-native.mjs")).href;
  return{...exactPatch(parent.generated,[
    [JSON.stringify(adapter.original),JSON.stringify(adapter.recipe.generated)],
    [`import { verifyJspiBrowserCandidate as verifyEbmlMediaCandidate } from ${JSON.stringify(before)};`,
      `import { verifyLtoBrowserCandidate as verifyEbmlMediaCandidate } from ${JSON.stringify(after)};`],
  ]),adapter:{bytes:Buffer.byteLength(adapter.recipe.generated),sha256:sha(adapter.recipe.generated)},adapterRecipe:adapter.recipe};
}
