// Pinned PUBLIC dependency source only, held in bounded RAM; no media/scratch copy.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";
const lifetime = process.argv[2] === "--lifetime";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && lifetime));
const root = path.resolve(import.meta.dirname, ".."), recipe = await readFile(path.join(root, "media/ffmpeg/reproduce-nondocker.sh"), "utf8");
const version = "1.16.0", expected = "7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c";
assert.ok(recipe.includes("LIBVPX_VERSION=" + version)); assert.ok(recipe.includes("LIBVPX_SHA256=" + expected));
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), url = "https://github.com/webmproject/libvpx/archive/refs/tags/v" + version + ".tar.gz";
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
if (lifetime) {
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
