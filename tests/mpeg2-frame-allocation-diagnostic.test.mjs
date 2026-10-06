import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { instrumentFrameAllocation, reverseFrameAllocationDiagnostic, FRAME_ALLOCATION_SOURCE_SHA256 }
  from "../media/ffmpeg/mpeg2-frame-allocation-diagnostic.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";

const source = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
test("Executed source-only plane audit is hash-bound and cannot masquerade as native or browser evidence", async () => {
  const proof = JSON.parse(await source("evidence/mpeg2-frame-plane-source-audit-2026-10-06.json"));
  for (const [file, hash] of Object.entries(proof.sources))
    assert.equal(createHash("sha256").update(await source(file)).digest("hex"), hash);
  assert.equal(proof.beforeSourceSha256, FRAME_ALLOCATION_SOURCE_SHA256);
  assert.equal(proof.afterSourceSha256, "71fb08761ce7c72554ec48ec2a64dfa1973d558c21ec1731f82d62939a7f46d7");
  assert.equal(proof.byteExactReversal, true); assert.equal(proof.insertions, 3);
  assert.equal(proof.allocationCodeChanged, false); assert.equal(proof.eventCap, 192);
  assert.equal(proof.sourceArtifactAndOwnedScratchRemoved, true);
  assert.equal(proof.compiledObserverVerified, false); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.actualFailedPlane, null);
  assert.equal(proof.runtimeHeapSavingsBytes, null); assert.equal(proof.conversionSpeedGain, null);
});
test("Private plane source observer rejects unknown, malformed and already changed allocation sources", () => {
  assert.equal(FRAME_ALLOCATION_SOURCE_SHA256, "910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4");
  for (const value of [null, 1, {}, "", "x".repeat(32769), "static int video_get_buffer(AVCodecContext *s, AVFrame *pic)\n"])
    assert.throws(() => instrumentFrameAllocation(value));
  for (const value of [null, "", "x".repeat(32769)]) assert.throws(() => reverseFrameAllocationDiagnostic(value));
});
test("Actual generated default wrapper remains byte-identical; diagnostic differs only by its scalar header", async () => {
  const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("mpeg2-plane-generator-unit-");
  try {
    const rows = [];
    for (const mode of ["0", "1"]) {
      const directory = path.join(runtime.directory, `mode-${mode}`); await mkdir(directory);
      const file = path.join(directory, "within_mpeg2.c");
      await promisify(execFile)(process.execPath, [path.join(root, "media/ffmpeg/make-mpeg2-candidate.mjs"), file],
        { cwd: root, env: { ...runtime.env, WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC: "0",
          WITHIN_MPEG2_FRAME_ALLOCATION_DIAGNOSTIC: mode }, windowsHide: true });
      rows.push(await readFile(file, "utf8"));
    }
    assert.equal(createHash("sha256").update(rows[0]).digest("hex"), "5650af19401766cf941bc95c221ff6b03c87192476bc10eacd7e6e47d1e0c88d");
    const header = await source("media/ffmpeg/mpeg2-frame-allocation-diagnostic.h");
    assert.equal(rows[1].split(header + "\n").length, 2);
    assert.equal(rows[1].replace(header + "\n", ""), rows[0]);
  } finally {
    await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  }
});
test("Plane scalar emitter exposes actual request/context without addresses, heap guesses or media data", async () => {
  const header = await source("media/ffmpeg/mpeg2-frame-allocation-diagnostic.h");
  assert.match(header, /sequence >= 192/); assert.match(header, /pic->buf\[i\]->size/);
  assert.match(header, /s->coded_width, s->coded_height/);
  assert.doesNotMatch(header, /av_buffer_alloc\(|av_buffer_allocz\(|av_buffer_unref\(|malloc\(|emmalloc_|HEAP|pic->data|uintptr_t/);
  const body = header.slice(header.indexOf("  const callback"), header.indexOf("\n});"));
  const names = ["sequence", "phase", "codec_id", "encoder", "context_width", "context_height",
    "coded_width", "coded_height", "width", "height", "format", "plane", "requested_bytes", "linesize", "allocated_bytes", "success"];
  const emit = new Function("Module", ...names, body), rows = [];
  const bridge = { withinBridge: { allocatorDiagnostic: (row) => rows.push(row) } };
  const fields = [2, 1, 1920, 804, 1920, 804, 1952, 836, 0, 1, 500000, 1024, 1600000, 1];
  emit(bridge, 1, 0, ...fields); emit(bridge, 2, 1, ...fields);
  assert.equal(rows[0].succeeded, null); assert.equal(rows[1].succeeded, true);
  assert.equal(rows[0].requestedBytes, 500000); assert.equal(rows[0].plane, 1);
  assert.equal(rows[0].contextWidth, 1920); assert.equal(rows[0].height, 836);
  assert.equal(rows[0].kind, "frame-plane-allocation");
  assert.match(rows[0].scope, /not-heap-free-space-not-acceptance/);
  assert.doesNotThrow(() => emit({}, 3, 0, ...fields));
  assert.ok(JSON.stringify(rows).length < 2048);
});
test("Plane attribution is separate, off-by-default, compiled-proven and forbidden from acceptance", async () => {
  const recipe = await source("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.ok(recipe.indexOf("FRAME_ALLOCATION_DIAGNOSTIC=") < recipe.indexOf('[[ "$(uname -s)" == Linux ]]'));
  assert.match(recipe, /WITHIN_MPEG2_FRAME_ALLOCATION_DIAGNOSTIC:-0/);
  assert.match(recipe, /Plane and allocator diagnostics use separate event budgets/);
  assert.match(recipe, /mpeg2-frame-allocation-diagnostic.mjs"/);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=33554432" "-sMAXIMUM_MEMORY=33554432"/);
  const manifest = await source("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /reverseFrameAllocationDiagnostic\(actualFrameSource\)/);
  assert.match(manifest, /entry.name === "within_mpeg2_plane_emit"/);
  assert.match(manifest, /frameAllocationDiagnosticLimit: 192/);
  const gate = await source("scripts/mpeg2-protected-memory.mjs"), stage = await source("scripts/stage-mpeg2-large-candidate.mjs");
  assert.match(gate, /diagnosticOnly = stackDiagnostic \|\| manifest.allocatorDiagnostic === true \|\| manifest.frameAllocationDiagnostic === true/);
  assert.match(gate, /if \(diagnosticOnly && number > 1\) break/);
  assert.match(gate, /allocatorSamples.length === 240/);
  assert.match(gate, /assert.equal\(diagnosticOnly, false/);
  assert.match(stage, /manifest.allocatorDiagnostic \|\| manifest.frameAllocationDiagnostic/);
  const kernel = await readFile(new URL("../media/ffmpeg/mpeg2-candidate.c", import.meta.url));
  assert.equal(createHash("sha256").update(kernel).digest("hex"), "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0");
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  for (const values of [{ WITHIN_MPEG2_FRAME_ALLOCATION_DIAGNOSTIC: "invalid" },
    { WITHIN_MPEG2_FRAME_ALLOCATION_DIAGNOSTIC: "1", WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC: "1", WITHIN_MPEG2_ALLOCATOR: "emmalloc" }]) {
    await assert.rejects(promisify(execFile)(bash, ["media/ffmpeg/build-mpeg2-candidate.sh"],
      { env: { ...process.env, ...values }, windowsHide: true }), (error) => error.code === 2);
  }
});
