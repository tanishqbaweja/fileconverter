import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { hevcHeaderParserBuildRef, hevcMatroskaHeaderSha256, makeHevcMatroskaHeaderParser } from "../media/ffmpeg/mkv-hevc-header-parser-candidate.mjs";
import { checkMkvEditListArchive } from "../scripts/lib/mkv-edit-list-build-artifact.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("first compiled HEVC metadata candidate is a retained real safe refusal with zero output, not a fidelity/memory pass", async () => {
  const bytes = await read("evidence/2026-11-15T07-40-48-911Z-mkv-hevc-known-dts-loop-source-control.json");
  assert.equal(sha(bytes), "18b63a70a9d51a3bd98201503831926bc3462b3a88ad6ecc9212e52bd1bca9c9");
  const r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases;
  assert.equal(r.status, "failed-not-acceptance"); assert.equal(c.state, "error"); assert.equal(c.metrics.outputBytes, 0);
  assert.match(c.error, /cannot preserve unverified or non-monotonic decode timestamps/);
  assert.equal(c.metrics.peakWasmMemoryBytes, 24 * 1048576); assert.equal(c.metrics.peakQueuedBytes, 0);
  assert.equal(a.memory.cleanupAboveIdleMiB, null); assert.equal(r.publicAcceptance, false);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(a.browserCleanup.observedPids.length, 44);
  assert.ok(a.serverCleanup.ownedRootAbsent && a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
  assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.candidateBuild.build.artifacts["within-direct.wasm"].sha256, "24da64b60b52e59c66f042b09b04f50949f01cda14db93b210c1b85573dd061b");
  const packed = await read(a.archive.file); assert.equal(sha(packed), a.archive.sha256);
  assert.equal(sha(gunzipSync(packed, { maxOutputLength: 4 * 1048576 })), a.archive.decodedSha256);
});

test("header-parser derivative refuses unverified source; only exact HEVC parsing policy changes", async () => {
  assert.throws(() => makeHevcMatroskaHeaderParser(Buffer.from("unverified source")), /Exact FFmpeg8.1.2 Matroska reader/);
  assert.match(hevcMatroskaHeaderSha256, /^[a-f0-9]{64}$/);
  const source = (await read("media/ffmpeg/mkv-hevc-header-parser-candidate.mjs")).toString();
  assert.match(source, /if \(par->codec_id != AV_CODEC_ID_HEVC\)/);
  assert.match(source, /sti->need_parsing = AVSTREAM_PARSE_HEADERS/);
  assert.match(source, /generated.replace\(after, \(\) => before\), original/);
  assert.match(source, /decodedPicturesAdded: false/); assert.match(source, /wasmBoundsChanged: false/);
  const builder = (await read("media/ffmpeg/build-mkv-edit-list-candidate.mjs")).toString();
  assert.match(builder, /assert.ok\(!hevcHeaderParser \|\| hevcKnownDts\)/);
  assert.match(builder, /makeHevcMatroskaHeaderParser\(await readBounded\(directory, "matroskadec.c", 262144\)\)/);
});

test("same wrapper hash does not permit substituting the first failed native library or another branch", () => {
  const runId = "1234", head = "a".repeat(40);
  const run = { id: 1234, workflow_id: 345162646, head_sha: head, head_branch: hevcHeaderParserBuildRef,
    event: "workflow_dispatch", status: "completed", conclusion: "success" };
  const artifact = { name: "unpublished-mkv-edit-list-1234", expired: false, size_in_bytes: 1000000,
    workflow_run: { id: 1234, head_sha: head, head_branch: hevcHeaderParserBuildRef }, digest: "sha256:" + "b".repeat(64) };
  checkMkvEditListArchive({ run, artifact }, runId, head, true, true, true, true, true, true);
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, true, true, true, true, true));
  assert.throws(() => checkMkvEditListArchive({ run, artifact }, runId, head, true, true, true, true, false, true));
  assert.throws(() => checkMkvEditListArchive({ run: { ...run, status: "in_progress" }, artifact }, runId, head, true, true, true, true, true, true));
});

test("new isolated workflow retains no-Docker/static-release/bounded-runtime and extra source authentication", async () => {
  const workflow = (await read("media/ffmpeg/mkv-edit-list-nondocker.yml")).toString();
  assert.ok(workflow.includes(`refs/heads/${hevcHeaderParserBuildRef}`)); assert.match(workflow, /WITHIN_MKV_HEVC_HEADER_PARSER:/);
  assert.match(workflow, /mkv-hevc-header-parser-candidate.test.mjs/);
  const loader = (await read("scripts/lib/mkv-edit-list-build-artifact.mjs")).toString();
  assert.match(loader, /sha256\(content\["matroskadec.c"\]\), hevcMatroskaHeaderSha256/);
  assert.match(loader, /proof.source.hevcHeaderParser.decodedPicturesAdded, false/);
  assert.match(loader, /"matroskadec.c": 262144/);
});
