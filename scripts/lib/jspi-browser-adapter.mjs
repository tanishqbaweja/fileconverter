import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveUpdatedChromeFullStager } from "./updated-chrome-full-recipe.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { JSPI_DECODER_SHA256, loadJspiBrowserNative } from "./jspi-browser-native.mjs";
export function makeJspiBrowserAdapter(source, native) {
  const oldSha = "e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e";
  assert.equal(source.split(oldSha).length, 3);
  const rebound = source.replaceAll(oldSha, JSPI_DECODER_SHA256); assert.equal(rebound.replaceAll(JSPI_DECODER_SHA256, oldSha), source);
  const groups = [["__wrap_av_realloc", "emscripten_builtin_realloc", "emscripten_builtin_malloc", "sbrk"],
    ["__wrap_av_buffer_realloc", "av_buffer_realloc"], ["av_buffer_allocz", "av_malloc", "__wrap_posix_memalign", "sbrk"],
    ["av_refstruct_pool_get", "av_malloc"], ["mpeg2_packets", "av_malloc", "__wrap_posix_memalign", "sbrk"]];
  const index = (functions, name) => { const rows = functions.filter(row => row.name === name); assert.equal(rows.length, 1); return rows[0].functionIndex; };
  const indexEdits = groups.map(names => [JSON.stringify(names.map(name => index(native.proof.parentFunctions, name))), JSON.stringify(names.map(name => index(native.functions, name)))]);
  // Equal mappings need no textual edit, but still derive from both actual binaries.
  const changedIndices = indexEdits.filter(([before, after]) => before !== after);
  const recipe = exactPatch(rebound, [...changedIndices,
    ['export default async function(options) {', 'export default async function(options) {\n  if(typeof WebAssembly.Suspending!=="function"||typeof WebAssembly.promising!=="function")throw new Error("This private decoder requires stable JSPI support");'],
    ['asyncifyStackBytes:262144,', 'asyncifyStackBytes:0,suspensionMode:"jspi",engineManagedStackBytes:null,'],
    ['    const call = core.ccall.bind(core);', '    let jspiCalls=0,jspiPending=0,jspiPeak=0,jspiFailed=0;\n    const call = core.ccall.bind(core);'],
    ['      try { return await call(name,type,mapped.map(()=>"number"),mapped,settings); }',
      '      if(jspiPending!==0)throw new Error("One active JSPI entry only");\n      jspiCalls++;jspiPending++;jspiPeak=Math.max(jspiPeak,jspiPending);\n      try { return await call(name,type,mapped.map(()=>"number"),mapped,settings); }\n      catch(error){jspiFailed++;throw error;}'],
    ['        try { try { console.debug("WITHIN_ASYNCIFY_STORAGE_FINAL "+JSON.stringify(core.withinAsyncifyStorageClose())); } finally { session.close(); } console.debug("WITHIN_MPEG2_SPLIT_FINAL "+JSON.stringify({...session.metrics(),maximumMediaAvioWriteBytes})); }',
      '        jspiPending--;\n        try { try { console.debug("WITHIN_JSPI_LIFECYCLE_FINAL "+JSON.stringify({mode:"jspi",calls:jspiCalls,activeCalls:jspiPending,maximumActiveCalls:jspiPeak,failedCalls:jspiFailed,asyncifyLinearStackBytes:0,engineManagedStackMemoryBytes:null,engineManagedStackIncludedInProcessTreeMeasurement:true})); } finally { session.close(); } console.debug("WITHIN_MPEG2_SPLIT_FINAL "+JSON.stringify({...session.metrics(),maximumMediaAvioWriteBytes})); }'],
  ]);
  return { ...recipe, originalSha256: sha(source), exactNativeIndices: indexEdits, decoderSha256: JSPI_DECODER_SHA256,
    nativeEnvelope: native.envelope, codecSettingsChanged: false, productionIoChanged: false, publicAcceptance: false };
}
export async function loadJspiBrowserAdapter(root) {
  const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-16T16-41-46-137Z-updated-chrome-media.json")));
  const zipped = await readFile(path.join(root, proof.sourceArchive.path)); assert.equal(sha(zipped), proof.sourceArchive.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(raw), proof.sourceArchive.restoredSha256);
  const archive = JSON.parse(raw), stage = archive.recipe.generated.stage;
  const match = stage.match(/^const adapter = ("[^\r\n]+");$/m); assert.ok(match);
  const original = JSON.parse(match[1]), native = await loadJspiBrowserNative(root);
  return { recipe: makeJspiBrowserAdapter(original, native), original, stage, archive };
}
export async function deriveJspiBrowserStager(source, oldName, candidateName) {
  const root = path.resolve(import.meta.dirname, "../.."), adapter = await loadJspiBrowserAdapter(root);
  const parent = deriveUpdatedChromeFullStager(source, oldName, candidateName);
  return { ...exactPatch(parent.generated, [
    [JSON.stringify(adapter.original), JSON.stringify(adapter.recipe.generated)],
    [`import { verifyEbmlMediaCandidate } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/duration-drain-media-recipe.mjs")).href)};`,
      `import { verifyJspiBrowserCandidate as verifyEbmlMediaCandidate } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/jspi-browser-native.mjs")).href)};`],
  ]), adapter: { bytes: Buffer.byteLength(adapter.recipe.generated), sha256: sha(adapter.recipe.generated) }, adapterRecipe: adapter.recipe };
}
