// Reuse exact validated identity/hash/reconstruction/removal checks for ONE terminal report.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const sourcePath="scripts/compact-mpeg2-quiesced-budget-terminal-report.mjs",source=await readFile(path.join(root,sourcePath),"utf8");
const previous=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-quiesced-budget-terminal-compaction-2026-10-08.json")));
assert.equal(sha(source),previous.sourcePins[sourcePath]);
const analysis=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-late-allocator-terminal-analysis-2026-10-08.json")));
assert.equal(analysis.status,"verified-terminal-whole-tree-budget-failure-with-delayed-renderer-types-not-cause");
assert.equal(analysis.actualDecoderAbortRecords,0);assert.equal(analysis.globalTraceReconstructionAndReparseVerified,true);
const patches=[
  ['const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;',`const root = ${JSON.stringify(root)}, MiB = 1048576;`],
  ["outputs/reports/2026-10-07T20-14-20-373Z-private-mpeg2-quiesced-budget-native-100ms.json",analysis.rawReport.path],
  ["evidence/mpeg2-quiesced-budget-original-2026-10-08.json","evidence/mpeg2-late-allocator-original-2026-10-08.json"],
  ["evidence/mpeg2-quiesced-budget-terminal-analysis-2026-10-08.json","evidence/mpeg2-late-allocator-terminal-analysis-2026-10-08.json"],
  ["evidence/mpeg2-quiesced-budget-terminal-compaction-2026-10-08.json","evidence/mpeg2-late-allocator-terminal-compaction-2026-10-08.json"],
  ["assert.equal(analysis.actualBinarySymbolJoinReverified, true);","assert.equal(analysis.globalTraceReconstructionAndReparseVerified, true);"],
  ["scripts/compact-mpeg2-quiesced-budget-terminal-report.mjs","scripts/compact-mpeg2-late-allocator-terminal-report.mjs"],
  ["quiesced-report-compact-","late-allocator-report-compact-"],
];
let generated=source;
for(const[before,after]of patches){assert.equal(generated.split(before).length,2,before);generated=generated.replace(before,after);}
let reverse=generated;
for(const[before,after]of patches.toReversed())reverse=reverse.replace(after,before);
assert.equal(reverse,source,"All bounded stream/hash/realpath/file-identity/gzip-reconstruction/finally checks unchanged");
generated=generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match,prefix,file)=>`${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
const runtime=await createOwnedRuntimeScratch("late-allocator-compaction-wrapper-");
try{const target=path.join(runtime.directory,"compact.mjs");await writeFile(target,generated,{flag:"wx"});await import(pathToFileURL(target).href);}
finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
