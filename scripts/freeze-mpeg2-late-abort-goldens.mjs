// Independent retained-report join/golden validation. Does not convert anything.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const envelopePath = "evidence/mpeg2-late-abort-goldens-2026-10-08.json";
const envelopeBytes = await readFile(path.join(root,envelopePath)), envelope = JSON.parse(envelopeBytes);
assert.equal(envelope.status,"browser-suite-returned-success-awaiting-independent-golden-freeze");
assert.equal(envelope.failure,null);assert.equal(envelope.pinsUnchanged,true);assert.equal(envelope.reports.length,1);
assert.deepEqual(envelope.sourcePins,envelope.postSourcePins);
for(const [file,hash] of Object.entries(envelope.sourcePins)) assert.equal(sha(await readFile(path.join(root,file))),hash);
const record=envelope.reports[0], raw=await readFile(path.join(root,record.path));
assert.equal(raw.length,record.bytes);assert.equal(sha(raw),record.sha256);assert.deepEqual(JSON.parse(raw),record.report);
const wasm=await readFile(path.join(root,"work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.wasm"));
assert.equal(sha(wasm),envelope.compiledCoreSha256);
assert.ok(!WebAssembly.Module.exports(new WebAssembly.Module(wasm)).some(row=>row.name.startsWith("control_")),"Synthetic derivative must never be used for media");
const sourcePath="scripts/freeze-mpeg2-abort-golden-regression.mjs", source=await readFile(path.join(root,sourcePath),"utf8");
const previous=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-abort-golden-regression-2026-10-08.json")));
assert.equal(sha(source),previous.sourcePins[sourcePath]);
const sourceStart=source.indexOf("const sourcePins = {};"), sourceEnd=source.indexOf("const proof = ");
assert.ok(sourceStart>0&&sourceEnd>sourceStart);
const sourceBlock=source.slice(sourceStart,sourceEnd);
const replacementPins=`const sourcePins = ${JSON.stringify(envelope.sourcePins)};\nfor(const [file,hash] of Object.entries(sourcePins)) assert.equal(sha(await readFile(path.join(root,file))),hash);\n`;
const patches=[
  ['const root = path.resolve(import.meta.dirname, ".."), sha =',`const root = ${JSON.stringify(root)}, sha =`],
  ['"output/playwright/2026-10-07T18-59-08.077Z-mpeg2-split-pipeline-37479749443-direct-artwork.json"',JSON.stringify(record.path)],
  ['"mpeg2-split-pipeline-37479749443"','"mpeg2-split-pipeline-37739125738"'],
  [sourceBlock,replacementPins],
  ["elapsedBrowserTestSeconds: 26.1","elapsedBrowserTestSeconds: 27.0"],
  ['"evidence/mpeg2-abort-golden-regression-2026-10-08.json"','"evidence/mpeg2-late-abort-golden-validation-2026-10-08.json"'],
  ['"Current files verified at freeze; legacy raw browser report does not contain executed App source pins. Candidate App identity also has independently pinned UI benchmark evidence."',
    '"Nine actual runner/stager/adapter/helper/test/App pins captured before and after browser execution, unchanged and independently rechecked. Freezer source tracked separately."'],
  ['"Same actually controlled inactive-until-abort observer staged in real production worker adapter; no synthetic malloc/native converter/debugger/GC"',
    '"Actual compiled3e744 diagnostic plus controlled64-byte failure observer in production adapter; synthetic export-only control NEVER staged/media-used. No normal JS sampling/native-at-abort calls or changed codec/heap/quality/I/O gates."'],
  ['  completeChromiumMemoryAcceptance: false,',
    `  executionEnvelope:{path:${JSON.stringify(envelopePath)},bytes:${envelopeBytes.length},sha256:${JSON.stringify(sha(envelopeBytes))}},
  freezerSourceSha256:${JSON.stringify(sha(await readFile(new URL(import.meta.url))))},
  syntheticExportControlUsedForMedia:false,originalCompiledCoreSha256:${JSON.stringify(sha(wasm))},
  completeChromiumMemoryAcceptance: false,`],
];
let generated=source;
for(const [before,after] of patches){assert.equal(generated.split(before).length,2,before.slice(0,80));generated=generated.replace(before,after);}
let reverse=generated;
for(const [before,after] of patches.toReversed()){assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);}
assert.equal(reverse,source,"Every prior byte-exact golden/frame/timing/audio/artwork/recovery/restore assertion unchanged");
const runtime=await createOwnedRuntimeScratch("mpeg2-late-golden-freeze-");
try{const target=path.join(runtime.directory,"freeze.mjs");await writeFile(target,generated,{flag:"wx"});await import(pathToFileURL(target).href);}
finally{await runtime.close();}
