// Separate prerequisite-bound inspection. Missing native tooling FAILS this
// qualification, never becomes a silently skipped portable-suite pass.
import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { bframeMkvFixture, assertBFrameMkvSource } from "../scripts/lib/mkv-complex-fidelity.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";

test("Independent bounded source inspection reproduces missing startup DTS and real reordered/VFR clocks", async () => {
  const runtime = await createOwnedRuntimeScratch("h264-bframe-unit-");
  try {
    const tool = process.env.WITHIN_FFPROBE_EXECUTABLE ?? (process.platform === "win32" ? "C:/ffmpeg/bin/ffprobe.exe" : "ffprobe");
    const { stdout } = await promisify(execFile)(tool, ["-v", "error", "-select_streams", "v:0", "-show_packets",
      "-show_entries", "packet=stream_index,pts_time,dts_time,duration_time", "-of", "json", fileURLToPath(new URL(`../${bframeMkvFixture.file}`, import.meta.url))],
    { windowsHide: true, env: runtime.env, timeout: 15000, maxBuffer: 131072 });
    const packets = JSON.parse(stdout).packets;
    assert.deepEqual(assertBFrameMkvSource({ streams: [{ codec_name: "h264", has_b_frames: 2 }] }, packets),
      { hasBFrames: 2, reorderedPresentationInDecodeOrder: true, unavailableSourceVideoDts: 2, availableSourceVideoDts: 70 });
    assert.deepEqual(packets.slice(0, 5).map(p => [p.pts_time, p.dts_time ?? null, p.duration_time]), [
      ["0.000000", null, "0.041000"], ["0.250000", null, "0.041000"],
      ["0.083000", "0.000000", "0.041000"], ["0.167000", "0.083000", "0.041000"], ["0.500000", "0.167000", "0.041000"]]);
    const clock = packets.map(p => Number(p.pts_time)).sort((a, b) => a - b);
    assert.deepEqual([...new Set(clock.slice(1).map((p, i) => Math.round((p - clock[i]) * 1000)))].sort((a, b) => a - b), [41, 42, 83, 84]);
    // DefaultDuration cannot justify replacing actual VFR clocks by CFR DTS.
    assert.equal(Math.round((Number(packets[3].dts_time) - Number(packets[2].dts_time)) * 1000), 83);
  } finally { await runtime.close(); }
});
