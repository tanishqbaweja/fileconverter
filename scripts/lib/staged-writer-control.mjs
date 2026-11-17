import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";
import archived from "../../fixtures/source/staged-save-before-held-writer-2026-11-17.json" with { type: "json" };
const sha = value => createHash("sha256").update(value).digest("hex");
export const STAGED_WRITER_CONTROL = Object.freeze({ bytes: 256 * 1048576 - 17, chunkBytes: 524288,
  order: Object.freeze(["baseline","candidate","candidate","baseline","baseline","candidate"]),
  minimumMedianImprovement: .05, primaryLimitMiB: 250, cleanupLimitMiB: 96 });
function exact(source,before,after) { assert.equal(source.split(before).length,2);return source.replace(before,()=>after); }
export function heldWriterSource(previous) {
  const edits = [
    ['  let finalWritable: FileSystemWritableFileStream | null = null;',
      '  let finalWritable: FileSystemWritableFileStream | null = null;\n  let finalWriter: WritableStreamDefaultWriter<FileSystemWriteChunkType> | null = null;\n  const releaseWriter = () => { const writer = finalWriter; finalWriter = null; writer?.releaseLock(); };'],
    ['    await finalWritable.truncate(0); readAccess = await stagingHandle.createSyncAccessHandle!();',
      '    await finalWritable.truncate(0);\n    // The convenience stream.write() acquires/releases a writer per chunk.\n    // Hold one lock across the bounded copy instead; every write is still awaited.\n    finalWriter = finalWritable.getWriter();\n    void finalWriter.closed.catch(() => {}); // Awaited write/close reports the actual failure below.\n    readAccess = await stagingHandle.createSyncAccessHandle!();'],
    ['            await finalWritable.write(value);','            await finalWriter.write(value);'],
    ['        await finalWritable.close();','        await finalWriter.close();\n    releaseWriter();'],
    ['    readAccess = null;\n    try { await finalWritable?.abort(error);',
      '    readAccess = null;\n    try { releaseWriter(); } catch { /* Continue abort/stage cleanup; preserve the first failure. */ }\n    try { await finalWritable?.abort(error);'],
  ];
  let source=previous;for(const [before,after]of edits)source=exact(source,before,after);
  let restored=source;for(const [before,after]of edits.toReversed())restored=exact(restored,after,before);assert.equal(restored,previous);
  return {source,edits};
}
export async function buildStagedWriterControl(root) {
  const previous=gunzipSync(Buffer.from(archived.gzipBase64,"base64"),{maxOutputLength:16384});
  assert.equal(previous.length,6991);assert.equal(sha(previous),"6c5c885fdb7094cae6728de9ea4cc55365a160bf81aa2d122002c24147bfcc8e");
  assert.equal(archived.sha256,sha(previous));
  const current=await readFile(path.join(root,"workers/staged-save-runtime.ts")),candidate=Buffer.from(heldWriterSource(previous.toString()).source);
  assert.ok(sha(current)===sha(previous)||sha(current)===sha(candidate),"Only exact baseline or reviewed proposal may be compared");
  const arms={};
  for(const [name,source]of [["baseline",previous],["candidate",candidate]]){
    let hits=0;
    const result=await build({absWorkingDir:root,entryPoints:["workers/staged-save.worker.ts"],bundle:true,platform:"browser",format:"esm",minify:true,write:false,
      plugins:[{name:"one-staged-runtime-factor",setup(api){api.onLoad({filter:/[\\/]staged-save-runtime\.ts$/},()=>{assert.equal(++hits,1);return{contents:source.toString(),loader:"ts",resolveDir:path.join(root,"workers")};});}}]});
    assert.equal(hits,1);assert.equal(result.outputFiles.length,1);assert.ok(result.outputFiles[0].contents.length<32768);
    arms[name]={body:result.outputFiles[0].text,bytes:result.outputFiles[0].contents.length,sha256:sha(result.outputFiles[0].contents),runtimeSha256:sha(source)};
  }
  assert.notEqual(arms.baseline.sha256,arms.candidate.sha256);
  return {arms,proof:{sourceCommit:archived.sourceCommit,exactSingleFactor:true,baselineRuntimeSha256:sha(previous),candidateRuntimeSha256:sha(candidate),
    byteBuffersQueueSizeAndCancellationUnchanged:true,stagedOnlyNotConversionAcceptance:true}};
}
export function summarizeStagedWriterTiming(cases) {
  assert.deepEqual(cases.map(c=>c.arm),STAGED_WRITER_CONTROL.order);
  const median=values=>{assert.equal(values.length,3);assert.ok(values.every(n=>Number.isFinite(n)&&n>0));return values.toSorted((a,b)=>a-b)[1];};
  const baseline=median(cases.filter(c=>c.arm==="baseline").map(c=>c.elapsedMs)),candidate=median(cases.filter(c=>c.arm==="candidate").map(c=>c.elapsedMs));
  const improvement=1-candidate/baseline;
  return {baselineMedianMs:baseline,candidateMedianMs:candidate,relativeMedianImprovement:improvement,
    matchedCopyTimingGatePassed:improvement>=STAGED_WRITER_CONTROL.minimumMedianImprovement,
    conversionSpeedupProven:false,universalFastestClaim:false};
}
