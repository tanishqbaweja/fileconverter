// Exact private source derivatives. Original executed sources are never edited.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha=source=>createHash("sha256").update(source).digest("hex");
function transform(source,patches){
  let result=source;
  for(const [before,after] of patches){assert.equal(result.split(before).length,2,before);result=result.replace(before,after);}
  let reversed=result;for(const [before,after] of patches.toReversed())reversed=reversed.replace(after,before);
  assert.equal(reversed,source);return {generated:result,originalSha256:sha(source),generatedSha256:sha(result),patches};
}
export function makeSplitCopyFrameBridge(source){
  return transform(source,[
    ["function copyValidated(sourceHeap, targetHeap, source, target) {","function copyValidated(sourceHeap, targetHeap, source, target, kernel = null) {"],
    ['  // All three layouts are validated before the first write. Copy active pixels',
      `  // Both full layouts have already passed the unchanged native allocation guards.
  if (kernel !== null) {
    if (!kernel || typeof kernel.copyPlane !== "function") throw new Error("Invalid private copy kernel");
    for (let index = 0; index < 3; index++) kernel.copyPlane(sourceHeap, targetHeap, source.planes[index], target.planes[index]);
    return source.frameBytes;
  }
  // All three layouts are validated before the first write. Copy active pixels`],
    ["export function copyMpeg2SplitPixels(decoder, encoder, source, destination) {","export function copyMpeg2SplitPixels(decoder, encoder, source, destination, kernel = null) {"],
    ["    snapshotLayout(source, sourceHeap.length), snapshotLayout(destination, targetHeap.length));",
      "    snapshotLayout(source, sourceHeap.length), snapshotLayout(destination, targetHeap.length), kernel);"],
  ]);
}
export function makeSplitCopySession(source){
  return transform(source,[
    ["  let { encoder, isCancelled } = options;","  let { encoder, isCancelled } = options;\n  let getCopyKernel = options.getCopyKernel;\n  if (typeof getCopyKernel !== \"function\") throw new Error(\"Private copy kernel getter required\");"],
    ["copyMpeg2SplitPixels({ HEAPU8: heap }, encoder, from, to)","copyMpeg2SplitPixels({ HEAPU8: heap }, encoder, from, to, getCopyKernel())"],
    ["encoder = isCancelled = decoderBuffer = initialEncoderHeap = null;","encoder = isCancelled = decoderBuffer = initialEncoderHeap = getCopyKernel = null;"],
  ]);
}
export function exposeSplitCodecMemory(source){
  return transform(source,[["maximum:INITIAL_MEMORY/65536,shared:true})}updateMemoryViews()}",
    'maximum:INITIAL_MEMORY/65536,shared:true});Module["withinSplitMemory"]=wasmMemory}updateMemoryViews()}']]);
}
export function makeSplitCopyAdapter(source){
  return transform(source,[
    ['import {createMpeg2SplitSession} from "/engines/remux/mpeg2-split-session.mjs";',
      'import {createMpeg2SplitSession} from "/engines/remux/mpeg2-split-session.mjs";\nimport {createSplitCopyKernel} from "/engines/remux/split-copy-kernel.mjs";'],
    ["  let encoder, session, core, maximumMediaAvioWriteBytes = 0;","  let encoder, session, core, copyKernel = null, maximumMediaAvioWriteBytes = 0;"],
    ["createMpeg2SplitSession({ encoder, isCancelled: options.withinBridge.cancelled })",
      'createMpeg2SplitSession({ encoder, isCancelled: options.withinBridge.cancelled, getCopyKernel: () => { if (!copyKernel) throw new Error("Native copy kernel not initialized"); return copyKernel; } })'],
    ['    if (core.HEAPU8.byteLength !== 33554432) throw new Error("Actual decoder heap mismatch");',
      `    if (core.HEAPU8.byteLength !== 33554432) throw new Error("Actual decoder heap mismatch");
    const kernelResponse = await fetch("/engines/remux/_private_split_copy.wasm");
    if (!kernelResponse.ok) throw new Error("Private copy kernel fetch failed");
    const kernelBytes = await kernelResponse.arrayBuffer(); //142-byte static engine, NEVER user media.
    if (kernelBytes.byteLength !== 142) throw new Error("Private copy kernel size mismatch");
    const kernelDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", kernelBytes));
    const kernelHash = [...kernelDigest].map(byte => byte.toString(16).padStart(2,"0")).join("");
    if (kernelHash !== "d666446d70374e2ee7dffba3459b01aa81523a5b9434cf8427a56311fb30c893") throw new Error("Private copy kernel hash mismatch");
    const kernelModule = await WebAssembly.compile(kernelBytes);
    copyKernel = await createSplitCopyKernel(kernelModule, core.withinSplitMemory, encoder.withinSplitMemory);`],
    ["JSON.stringify({...session.metrics(),maximumMediaAvioWriteBytes})",
      "JSON.stringify({...session.metrics(),maximumMediaAvioWriteBytes,copyKernel:(copyKernel?.close(),copyKernel?.metrics()??null)})"],
    ["finally { encoder = null; }","finally { copyKernel?.close(); copyKernel = null; encoder = null; }"],
  ]);
}
