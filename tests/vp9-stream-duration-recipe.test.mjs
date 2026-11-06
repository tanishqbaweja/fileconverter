import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { makeVp9PacketDurationSource } from "../media/ffmpeg/vp9-packet-duration-recipe.mjs";
import { makeVp9StreamDurationSource } from "../media/ffmpeg/vp9-stream-duration-recipe.mjs";
const canonicalFile = new URL("../media/ffmpeg/within_remux.c", import.meta.url), source = await readFile(canonicalFile, "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
test("next private candidate composes exact packet fix and one VP9-only stream metadata edit, fully reversible", async () => {
  const result = makeVp9StreamDurationSource(source), packets = makeVp9PacketDurationSource(source);
  assert.equal(result.edits.length, 2); assert.equal(result.packetDurationCandidateSha256, packets.generatedSha256);
  let reversed = result.generated; for (const [before, after] of result.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); assert.equal(result.parentSha256, sha(source)); assert.equal(result.generatedSha256, sha(result.generated));
  const [before, after] = result.edits[1]; assert.equal(packets.generated.replace(before, after), result.generated);
  assert.ok(after.includes("if (encoder->codec_id == AV_CODEC_ID_VP9) {\n    output_stream->avg_frame_rate = encoder->framerate;"));
  assert.equal(await readFile(canonicalFile, "utf8"), source);
  for (const field of ["codecSettingsChanged", "ioChanged", "memoryLimitsRaised", "nativeBuildExecuted", "browserValidated", "publicAcceptance"])
    assert.equal(result[field], false);
});
test("stream metadata remains the exact existing encoder CFR, never copied from potentially different input FPS", () => {
  const result = makeVp9StreamDurationSource(source), [before, after] = result.edits[1];
  assert.equal(after.replace(/  \/\* Advertise the established CFR clock[\s\S]*?\n  }\n/, ""), before);
  assert.ok(!after.includes("output_stream->avg_frame_rate = input_stream"));
  assert.ok(after.indexOf("output_stream->avg_frame_rate = encoder->framerate;") < after.indexOf("avcodec_parameters_from_context"));
});
test("changed/duplicated CFR stream anchors cannot silently patch audio setup", () => {
  for (const text of [source.replace("encoder->framerate = frame_rate;", "encoder->framerate = unknown;"),
    source.replace("  AVStream *audio_input_stream = NULL;", "  no_marker;"),
    source.replace("encoder->framerate = frame_rate;", "encoder->framerate = frame_rate;\nencoder->framerate = frame_rate;")])
    assert.throws(() => makeVp9StreamDurationSource(text));
});
test("latest private build retains the stream candidate through its original-width composition and authenticates exact source edits", async () => {
  const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
  const generator = await read("media/ffmpeg/make-vp9-duration-source.mjs"), builder = await read("media/ffmpeg/build-vp9-duration-candidate.mjs"),
    collector = await read("scripts/collect-vp9-duration-native.mjs"), workflow = await read(".github/workflows/vp9-duration-nondocker.yml");
  for (const text of [generator, builder]) assert.ok(text.includes("makeVp9OriginalWidthSource("));
  const width = await read("media/ffmpeg/vp9-original-width-recipe.mjs"); assert.ok(width.includes("makeVp9StreamDurationSource(source)"));
  assert.ok(builder.includes('"media/ffmpeg/vp9-stream-duration-recipe.mjs"')); assert.ok(builder.includes('const privateEngine=tokenPacked?"private-vp9-token-packed":tokenContext?"private-vp9-token-context":lazyUtility?"private-vp9-lazy-utility":allocationDiagnostics?"private-vp9-allocation-diagnostic":"private-vp9-realtime-temporal"'));
  assert.ok(builder.includes("vendorAllocationGuard:"));
  assert.ok(builder.includes("{ temporalFilterGuard: true, allocationDiagnostics, lazyUtility, tokenContext, tokenPacked }"));
  assert.ok(builder.includes("wrapperEdits: candidate.edits.length")); assert.ok(collector.includes("sourceProof.edits.length, manifest.candidate.wrapperEdits"));
  assert.ok(collector.includes("streamDuration ? makeVp9StreamDurationSource : makeVp9PacketDurationSource"));
  assert.ok(workflow.includes("tests/vp9-stream-duration-recipe.test.mjs"));
});
test("candidate also applies exactly to the authenticated reconstructed general-core base without editing it", async context => {
  const base = await readFile(new URL("../work/vp9-duration-input-42020605269/within_remux.base.c", import.meta.url), "utf8")
    .catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (base === null) { context.skip("Optional local authenticated native tool is not present; canonical-source tests still mandatory"); return; }
  assert.equal(sha(base), "ff8926c995010617bcc76701f0ea75feb5a2c99dadb136d8b8d1c8703e5d6dcd");
  const result = makeVp9StreamDurationSource(base); assert.equal(result.edits.length, 2);
  assert.equal(result.packetDurationCandidateSha256, "6f9c51ce2ab944dddc76a305a8d7aa0ebb98b36f806eefb99e10963b27eb497b");
});
