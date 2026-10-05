import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("MPEG2 restores bounded original container provenance after one mux initialization", async () => {
  const kernel = await readFile(new URL("../media/ffmpeg/mpeg2-candidate.c", import.meta.url), "utf8");
  const bound = kernel.indexOf("bytes > 2097152 - metadata_bytes");
  const init = kernel.indexOf("result = avformat_init_output(out, &mux_options);");
  const restore = kernel.indexOf("av_dict_get(in->metadata, \"encoder\", provenance, AV_DICT_IGNORE_SUFFIX)");
  const header = kernel.indexOf("result = avformat_write_header(out, &mux_options);");
  assert.ok(bound > 0 && init > bound && restore > init && header > restore);
  assert.equal(kernel.split("avformat_init_output(out").length, 2);
  assert.match(kernel.slice(init, restore), /if \(result < 0\) goto cleanup/);
  assert.match(kernel.slice(restore, header), /provenance->key\[7\] == '\\0' \|\| provenance->key\[7\] == '-'/);
  assert.match(kernel.slice(restore, header), /av_dict_set\(&out->metadata, provenance->key, provenance->value, 0\)/);
  assert.match(kernel.slice(restore, header), /if \(result < 0\) goto cleanup/);
  assert.match(kernel, /out->flags \|= AVFMT_FLAG_BITEXACT/);
  assert.match(kernel, /"encoder", "Within FFmpeg MPEG-2"/);
  assert.equal(kernel.match(/av_dict_copy\(&out->metadata, in->metadata, 0\)/g)?.length, 1);
});

test("MPEG2 strict all-tag browser gate is retained; pinned mux diagnosis is source-hash checked", async () => {
  const browser = await readFile(new URL("../tests/browser/mpeg2-artwork-candidate.spec.ts", import.meta.url), "utf8");
  assert.match(browser, /Object.entries\(beforeTags\)/);
  assert.match(browser, /expect\(afterTags\[key\], `Preserve compatible container metadata \$\{key\}`\).toBe\(value\)/);
  assert.match(browser, /creation_time=2000-01-01T00:00:00.000000Z/);
  const verifier = await readFile(new URL("../scripts/verify-mpeg2-mov-patch.mjs", import.meta.url), "utf8");
  assert.match(verifier, /57b64d7a1d6d81d7ac05d79085e5f9b282bf1bba773b4200a64aeede6599b55a/);
  assert.match(verifier, /muxData.length <= 512 \* 1024/);
  assert.match(verifier, /runtime.close\(\)/);
});

test("MPEG2 strict metadata failure cannot be presented as full-size or speed acceptance", async () => {
  const evidence = JSON.parse(await readFile(new URL(
    "../evidence/mpeg2-low-delay-metadata-gate-2026-10-05.json", import.meta.url), "utf8"));
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.primaryMemoryAcceptance, false);
  assert.equal(evidence.speedGainClaim, null);
  assert.equal(evidence.build.runId, 37291658159);
  assert.equal(evidence.manifest.allocatorDiagnostic, false);
  assert.equal(evidence.manifest.maximumWasmMemoryBytes, 33554432);
  assert.equal(evidence.failure.field, "encoder");
  assert.equal(evidence.failure.expected, "Lavf");
  assert.equal(evidence.failure.actual, null);
  assert.equal(evidence.genuineEncode.sourceFrameCount, 48);
  assert.equal(evidence.genuineEncode.outputFrameCount, 48);
  assert.ok(evidence.genuineEncode.maxFrameTimestampErrorSeconds <= 0.001);
  assert.ok(evidence.genuineEncode.ordinalSsim >= 0.98);
  assert.equal(evidence.genuineEncode.nativeFullDecodePassed, true);
  for (const row of evidence.safety) {
    assert.equal(row.status, "passed");
    assert.equal(row.metrics.queuedBytes, 0);
    assert.equal(row.metrics.pendingOperations, 0);
    assert.deepEqual(row.partialBytes, []);
  }
  assert.equal(evidence.diagnosis.fullOriginalRunStarted, false);
  assert.equal(evidence.diagnosis.changedCandidateCompiled, false);
  assert.equal(evidence.cleanup.remainingHostedArtifacts, 0);
});
