import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { AIFF_ID3_SPECIALIST_EDITS, makeAiffId3SpecialistSource, PUBLISHED_AIFF_SOURCE_SHA256 } from "../media/ffmpeg/aiff-id3-specialist-source.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
test("actual private source generation applies only reversible metadata deltas to the published specialist", async () => {
  const runtime = await createOwnedRuntimeScratch("aiff-id3-source-test-");
  try {
    const source = path.join(root, "media/ffmpeg/within_remux.c");
    const baseline = path.join(runtime.directory, "within_aiff.c");
    await execute(process.execPath, ["media/ffmpeg/make-aiff-specialist.mjs", source, baseline],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000 });
    const published = await readFile(baseline, "utf8");
    assert.equal(createHash("sha256").update(published).digest("hex"), PUBLISHED_AIFF_SOURCE_SHA256);
    const candidate = makeAiffId3SpecialistSource(published);
    let reversed = candidate;
    for (const [before, after] of AIFF_ID3_SPECIALIST_EDITS.toReversed()) reversed = reversed.replace(after, before);
    assert.equal(reversed, published);
    assert.ok(candidate.includes('if (profile != 28 || video_codec != 0'));
    assert.ok(candidate.includes('if (aiff_output && !av_dict_get(output_format->metadata, "author", NULL, 0))'));
    assert.ok(candidate.includes('report_av_error("AIFF ID3 muxer option failed", result)'));
    assert.ok(candidate.includes('stream->attached_pic.size > WITHIN_ARTWORK_MAX_BYTES'));
    assert.ok(candidate.includes('artwork_packet = av_packet_clone(&artwork_input_stream->attached_pic)'));
    assert.throws(() => makeAiffId3SpecialistSource(published + "\n"), /source changed/);
    const target = path.join(runtime.directory, "candidate");
    const { mkdir } = await import("node:fs/promises"); await mkdir(target);
    const inventory = async () => (await readdir(path.join(root, "work"))).filter(name => /^aiff-id3-source-[A-Za-z0-9]{6}$/.test(name)).toSorted();
    const before = await inventory();
    const output = path.join(target, "within_aiff.c");
    await execute(process.execPath, ["media/ffmpeg/make-aiff-id3-specialist.mjs", source, output],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000 });
    assert.equal(await readFile(output, "utf8"), candidate); assert.deepEqual(await inventory(), before);
    await assert.rejects(execute(process.execPath, ["media/ffmpeg/make-aiff-id3-specialist.mjs", source, output],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000 }));
  } finally { await runtime.close(); }
});
