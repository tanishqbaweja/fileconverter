// Pinned PUBLIC dependency source only, held in bounded RAM; no media/scratch copy.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";
const lifetime = process.argv[2] === "--lifetime";
const utility = process.argv[2] === "--utility";
const tokens = process.argv[2] === "--tokens";
const tokenContext = process.argv[2] === "--token-context";
const tokenLifetime = process.argv[2] === "--token-lifetime";
const tokenPacked = process.argv[2] === "--token-packed";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && (lifetime || utility || tokens || tokenContext || tokenLifetime || tokenPacked)));
const root = path.resolve(import.meta.dirname, ".."), recipe = await readFile(path.join(root, "media/ffmpeg/reproduce-nondocker.sh"), "utf8");
const version = "1.16.0", expected = "7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c";
assert.ok(recipe.includes("LIBVPX_VERSION=" + version)); assert.ok(recipe.includes("LIBVPX_SHA256=" + expected));
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), url = tokenPacked
  ? "https://codeload.github.com/webmproject/libvpx/tar.gz/refs/tags/v"+version
  : "https://github.com/webmproject/libvpx/archive/refs/tags/v" + version + ".tar.gz";
const response = await fetch(url, { signal: AbortSignal.timeout(120000) }); assert.equal(response.status, 200);
const reader = response.body.getReader(), storage = Buffer.alloc(8388608); let compressedBytes = 0;
try {
  for (;;) { const item = await reader.read(); if (item.done) break;
    assert.ok(item.value.byteLength > 0 && compressedBytes + item.value.byteLength <= storage.length, "Public source archive cap8MiB");
    storage.set(item.value, compressedBytes); compressedBytes += item.value.byteLength;
  }
} finally { await reader.cancel(); }
const archive = storage.subarray(0, compressedBytes); assert.equal(sha(archive), expected);
const tar = gunzipSync(archive, { maxOutputLength: 67108864 }), rows = [], filterCallSites = [], sources = new Map();
let members = 0, totalSourceBytes = 0, cFiles = 0;
for (let at = 0; at + 512 <= tar.length;) {
  const header = tar.subarray(at, at + 512); if (header.every(byte => byte === 0)) break;
  assert.ok(++members <= 10000); const text = (offset, size) => header.subarray(offset, offset + size).toString("utf8").replace(/\0.*$/s, "");
  const sizeText = text(124, 12).trim(); assert.match(sizeText, /^[0-7]+$/); const size = Number.parseInt(sizeText, 8);
  assert.ok(Number.isSafeInteger(size) && size <= 16777216 && at + 512 + size <= tar.length);
  const checksumText = text(148, 8).trim(); assert.match(checksumText, /^[0-7]+$/);
  const sum = header.reduce((sum, byte, n) => sum + (n >= 148 && n < 156 ? 32 : byte), 0); assert.equal(sum, Number.parseInt(checksumText, 8));
  const name = [text(345, 155), text(0, 100)].filter(Boolean).join("/"), type = header[156];
  assert.ok(!name.startsWith("/") && !name.split("/").includes(".."));
  if ((type === 0 || type === 48) && /\.[ch]$/.test(name)) {
    assert.ok(name.startsWith("libvpx-" + version + "/")); assert.ok(size <= 2097152);
    const file = name.slice(("libvpx-" + version + "/").length), bytes = tar.subarray(at + 512, at + 512 + size), source = bytes.toString("utf8");
    assert.equal(Buffer.byteLength(source), bytes.length); assert.equal(sources.has(file), false); sources.set(file, source);
    cFiles++; totalSourceBytes += size;
    const matches = source.split("\n").flatMap((line, index) => /\btf_buffer\b|\bvp9_temporal_filter\s*\(/.test(line)
      ? [{ line: index + 1, text: line.trim().slice(0, 512) }] : []);
    assert.ok(matches.length <= 512);
    if (matches.length) rows.push({ file, bytes: size, sha256: sha(bytes), matches });
    for (const match of matches) if (/\bvp9_temporal_filter\s*\(cpi\s*,/.test(match.text)) filterCallSites.push({ file, ...match });
  }
  at += 512 + Math.ceil(size / 512) * 512;
}
assert.ok(cFiles > 500 && rows.length > 0 && rows.length <= 64);
const encoder = sources.get("vp9/encoder/vp9_encoder.c"); assert.ok(encoder);
const start = encoder.indexOf("static void alloc_raw_frame_buffers(VP9_COMP *cpi) {"), end = encoder.indexOf("static void alloc_util_frame_buffers", start);
assert.ok(start > 0 && end > start); const allocation = encoder.slice(start, end);
assert.ok(allocation.includes("Failed to allocate temporal filter buffer")); assert.ok(allocation.includes("// TODO(agrange) Check if ARF is enabled and skip allocation if not."));
assert.equal(filterCallSites.length, 2); assert.ok(filterCallSites.every(row => row.file === "vp9/encoder/vp9_encoder.c"));
const contexts = filterCallSites.map(row => ({ ...row, context: encoder.split("\n").slice(Math.max(0, row.line - 20), row.line + 5).join("\n") }));
assert.ok(contexts.every(row => row.context.includes("!= REALTIME")), "Both call paths must have explicit non-realtime guards");
if (tokenPacked) {
  const references=[],sentinelReferences=[],preimages={};
  for(const [file,source]of sources) {
    const lines=source.split("\n"),matches=[],sentinels=[];
    for(const [index,line]of lines.entries()) {
      const row={line:index+1,text:line.trim(),context:lines.slice(Math.max(0,index-3),index+4).join("\n")};
      if(file.startsWith("vp9/")&&(/\bTOKENEXTRA\b|(?:->|\.)token\b|\bcontext_tree\b/.test(line)))matches.push(row);
      if(/\bEOSB_TOKEN\b/.test(line))sentinels.push(row);
    }
    if(matches.length)references.push({file,sha256:sha(source),matches});
    if(sentinels.length)sentinelReferences.push({file,sha256:sha(source),matches:sentinels});
  }
  for(const file of ["vp9/encoder/vp9_tokenize.h","vp9/encoder/vp9_tokenize.c","vp9/encoder/vp9_bitstream.c",
    "vp9/encoder/vp9_encodeframe.c","vp9/common/vp9_entropy.h"]) {
    const exactSource=sources.get(file);assert.ok(exactSource);preimages[file]={sha256:sha(exactSource),exactSource};
  }
  const report={recordedAt:new Date().toISOString(),scope:"Pinned entire C/header sentinel inventory and VP9 token-field/reference audit, NOT arbitrary C alias proof or accepted packing",
    sourceUrl:url,archiveSha256:expected,cFiles,references,sentinelReferences,preimages,
    codecBuilt:false,actualMemorySavedBytes:null,browserValidated:false,publicAcceptance:false,userMediaReadOrConverted:false};
  const output=JSON.stringify(report,null,2)+"\n";assert.ok(Buffer.byteLength(output)<=1048576);
  await writeFile(path.join(root,"evidence/2026-11-06-vp9-token-packed-source-audit.json"),output,{flag:"wx"});
  console.log(JSON.stringify({cFiles,referenceFiles:references.length,tokenMatches:references.reduce((n,x)=>n+x.matches.length,0),
    sentinelFiles:sentinelReferences.map(x=>({file:x.file,matches:x.matches.map(y=>({line:y.line,text:y.text}))})),bytes:Buffer.byteLength(output),codecBuilt:false}));
} else if (tokenLifetime) {
  const references=[],wholeObjectOperations=[];
  for(const [file,source] of sources) {
    if(!file.startsWith("vp9/"))continue;
    const lines=source.split("\n"),matches=[],objectMatches=[];
    for(const [index,line] of lines.entries()) {
      const row={line:index+1,text:line.trim(),context:lines.slice(Math.max(0,index-3),index+5).join("\n")};
      if(/\bfc\b/.test(line))matches.push(row);
      if(/(?:\*\s*cm|\bcpi->common)\s*=(?!=)|\b(?:memcpy|memmove|memset|vp9_zero)\s*\(\s*(?:(?:cm|cpi)\s*[,)]|&?\s*cpi->common\s*[,)]|\*cpi\s*\))/.test(line))objectMatches.push(row);
    }
    if(matches.length)references.push({file,sha256:sha(source),matches});
    if(objectMatches.length)wholeObjectOperations.push({file,sha256:sha(source),matches:objectMatches});
  }
  const files=["vp9/common/vp9_onyxc_int.h","vp9/common/vp9_entropymode.h","vp9/common/vp9_entropy.h",
    "vp9/common/vp9_alloccommon.c","vpx/internal/vpx_codec_internal.h","vp9/encoder/vp9_encoder.h"],preimages={};
  for(const file of files){const exactSource=sources.get(file);assert.ok(exactSource,file);preimages[file]={sha256:sha(exactSource),exactSource};}
  const report={recordedAt:new Date().toISOString(),scope:"Pinned VP9 fc identifier/macro/whole-object-write inventory for manual lifetime audit; not a generic C alias proof",
    archiveSha256:expected,cFiles,references,wholeObjectOperations,preimages,
    semanticProofForArbitrarySources:false,candidateIntegrated:false,actualSavedBytes:null,publicAcceptance:false,userMediaReadOrConverted:false};
  const output=JSON.stringify(report,null,2)+"\n";assert.ok(Buffer.byteLength(output)<524288);
  await writeFile(path.join(root,"evidence/2026-11-06-vp9-token-context-lifetime-audit.json"),output,{flag:"wx"});
  console.log(JSON.stringify({cFiles,referenceFiles:references.length,matches:references.reduce((n,v)=>n+v.matches.length,0),
    objectOperationFiles:wholeObjectOperations.length,preimagePins:Object.fromEntries(Object.entries(preimages).map(([f,v])=>[f,v.sha256])),bytes:Buffer.byteLength(output)}));
} else if (tokenContext) {
  const files=["vp9/encoder/vp9_tokenize.h","vp9/encoder/vp9_tokenize.c","vp9/encoder/vp9_bitstream.c"],preimages={};
  for(const file of files){const exactSource=sources.get(file);assert.ok(exactSource);preimages[file]={sha256:sha(exactSource),exactSource};}
  const contextAssignments=[];
  for(const [file,source] of sources) {
    if(!file.startsWith("vp9/"))continue;
    const lines=source.split("\n"),matches=[];
    for(const [index,line] of lines.entries())if(/(?:\bcm->fc|\bcpi->common\.fc)\s*=(?!=)/.test(line))
      matches.push({line:index+1,context:lines.slice(Math.max(0,index-8),index+12).join("\n")});
    if(matches.length)contextAssignments.push({file,sha256:sha(source),matches});
  }
  const report={recordedAt:new Date().toISOString(),scope:"Pinned token producer/packer preimages and frame-context pointer assignment inventory, NOT accepted compaction",
    archiveSha256:expected,cFiles,preimages,contextAssignments,
    candidateImplemented:false,actualSavedBytes:null,publicAcceptance:false,userMediaReadOrConverted:false};
  const output=JSON.stringify(report,null,2)+"\n";assert.ok(Buffer.byteLength(output)<524288);
  await writeFile(path.join(root,"evidence/2026-11-06-vp9-token-context-source-audit.json"),output,{flag:"wx"});
  console.log(JSON.stringify({cFiles,preimages:Object.fromEntries(Object.entries(preimages).map(([f,v])=>[f,v.sha256])),contextAssignmentFiles:contextAssignments.length,bytes:Buffer.byteLength(output)}));
} else if (tokens) {
  const references=[];
  for(const [file,source] of sources) {
    const lines=source.split("\n"),matches=[];
    for(const [index,line] of lines.entries()) if(/\bTOKENEXTRA\b|\bcontext_tree\b|\bget_token_alloc\b|\btile_tok\b|\btok_count\b|\bcpi->tok\b/.test(line)) {
      assert.ok(matches.length<256);
      matches.push({line:index+1,text:line.trim(),context:lines.slice(Math.max(0,index-4),index+7).join("\n")});
    }
    if(matches.length) references.push({file,bytes:Buffer.byteLength(source),sha256:sha(source),matches});
  }
  const header=sources.get("vp9/encoder/vp9_tokenize.h");
  assert.equal(sha(header),"5942c93a8f07fc7e5f2b479954ec77c3672294816f3bf6d168d65fee9d40d6a7");
  assert.ok(references.length>3&&references.length<64);
  const report={recordedAt:new Date().toISOString(),scope:"Complete pinned C/header token-record reference inventory, NOT safe token removal or storage-compaction proof",
    archiveSha256:expected,cFiles,references,tokenHeader:{file:"vp9/encoder/vp9_tokenize.h",sha256:sha(header),exactSource:header},
    actualCompiledHighBitDepthConfiguration:null,actualTokenBytes:null,actualSavedBytes:null,
    candidateImplemented:false,browserValidated:false,publicAcceptance:false,
    publicSourceHeldInBoundedRamOnly:true,userMediaReadOrConverted:false};
  const output=JSON.stringify(report,null,2)+"\n";assert.ok(Buffer.byteLength(output)<=524288);
  await writeFile(path.join(root,"evidence/2026-11-06-vp9-token-storage-source-audit.json"),output,{flag:"wx"});
  console.log(JSON.stringify({cFiles,referenceFiles:references.length,matches:references.reduce((n,r)=>n+r.matches.length,0),reportBytes:Buffer.byteLength(output),candidateImplemented:false}));
} else if (utility) {
  const references=[];
  for(const [file,source] of sources) {
    const lines=source.split("\n"),matches=[];
    for(const [index,line] of lines.entries()) if(/\bscaled_source\b|\bscaled_last_source\b|\blast_frame_uf\b|\bvp9_scale_if_required\b|\binit_motion_estimation\b/.test(line)) {
      assert.ok(matches.length<128);
      matches.push({line:index+1,text:line.trim(),context:lines.slice(Math.max(0,index-7),index+12).join("\n")});
    }
    if(matches.length)references.push({file,sha256:sha(source),matches});
  }
  const functions={};
  for(const name of ["alloc_util_frame_buffers","update_initial_width","init_motion_estimation","vp9_scale_if_required"]) {
    const matches=[];
    for(const [file,source] of sources) {
      const regex=new RegExp("(?:^|\\n)(?:static )?[A-Za-z_][A-Za-z_0-9 *\\t\\r\\n]*\\b"+name+"\\(");
      const found=regex.exec(source);if(!found)continue;
      const start=found.index+(source[found.index]==="\n"?1:0),body=source.indexOf("{",start),end=source.indexOf("\n}\n",body);
      if(!(body>start&&end>body&&source.indexOf(";",start)>body))continue;
      const exactSource=source.slice(start,end+3);assert.ok(exactSource.length<=16384);
      matches.push({file,sourceSha256:sha(source),exactSource,sha256:sha(exactSource)});
    }
    assert.equal(matches.length,1,name);functions[name]=matches[0];
  }
  const report={recordedAt:new Date().toISOString(),scope:"Pinned complete reference audit and exact utility/scaling functions, NOT proof that any buffer may yet be skipped",
    archiveSha256:expected,cFiles,references,functions,publicSourceHeldInBoundedRamOnly:true,userMediaReadOrConverted:false,
    candidateImplemented:false,actualSavedBytes:null,publicAcceptance:false};
  await writeFile(path.join(root,"evidence/2026-11-06-vp9-utility-buffer-source-audit.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({cFiles,referenceFiles:references.length,functions:Object.keys(functions),candidateImplemented:false}));
} else if (lifetime) {
  const context = (file, pattern) => {
    const source = sources.get(file); assert.ok(source, file); const lines = source.split("\n"), matches = [];
    for (const [index, line] of lines.entries()) if (pattern.test(line)) {
      assert.ok(matches.length < 128); matches.push({ line: index + 1, text: line.trim(),
        context: lines.slice(Math.max(0, index - 12), index + 18).join("\n") });
    }
    assert.ok(matches.length > 0, file); return { file, sha256: sha(source), matches };
  };
  const report = { recordedAt: new Date().toISOString(), scope: "Pinned lifetime/config context inspection; not a compiled optimization or automated semantic proof",
    archiveSha256: expected, cFiles,
    encoder: context("vp9/encoder/vp9_encoder.c", /memset\(cpi|cpi = .*vpx_memalign|cpi->oxcf =|vpx_free_frame_buffer\(&cpi->tf_buffer/),
    codecInterface: context("vp9/vp9_cx_iface.c", /oxcf(?:->|\.)mode\s*=(?!=)|vp9_change_config\(|vp9_receive_raw_frame\(|vp9_get_compressed_data\(/),
    frameFree: context("vpx_scale/generic/yv12config.c", /vpx_free_frame_buffer\(/),
    allocatorFree: context("vpx_mem/vpx_mem.c", /void vpx_free\(/),
    filterCallSites: contexts, sourceCopiesOnDisk: 0, userMediaReadOrConverted: false, publicAcceptance: false };
  await writeFile(path.join(root, "evidence/2026-11-06-vp9-temporal-filter-lifetime-audit.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ lifetimeContextRecorded: true, cFiles, sourceArchiveSha256: expected, publicAcceptance: false }));
  process.exitCode = 0;
} else {
const report = { recordedAt: new Date().toISOString(), scope: "Pinned dependency allocation/call-site audit, NOT a compiled optimization or proof of actual allocation size",
  source: { version, url, archiveBytes: compressedBytes, archiveSha256: expected, uncompressedBytes: tar.length, cFiles, totalSourceBytes, members },
  references: rows, filterCallSites: contexts, allocation: { file: "vp9/encoder/vp9_encoder.c", sourceSha256: sha(encoder), exactSource: allocation },
  diagnosis: { actualFailure: "evidence/2026-11-06-vp9-original-cpu-startup-attempt3.json", unconditionalTemporalBufferAllocationObservedInPinnedSource: true,
    bothProductionCallSitesGuardedNonRealtime: true, exactFailedAllocationBytes: null, actualHeapAtFailureBytes: null,
    nextCandidate: "Investigate conditionally avoiding the temporal-filter buffer in existing REALTIME mode, with all reference/cleanup/config paths audited and bit-exact controls before any acceptance",
    candidateImplemented: false, compiled: false, browserValidated: false, memoryLimitsRaised: false },
  publicSourceHeldInBoundedRamOnly: true, generatedSourceCopiesOnDisk: 0, userMediaReadOrConverted: false, publicAcceptance: false };
await writeFile(path.join(root, "evidence/2026-11-06-vp9-temporal-filter-source-audit.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ sourceArchiveSha256: expected, cFiles, referenceFiles: rows.length, filterCallSites: filterCallSites.length,
  allProductionCallsGuardedNonRealtime: true, candidateImplemented: false, publicAcceptance: false }));
}
