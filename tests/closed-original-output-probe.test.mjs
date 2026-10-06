import assert from "node:assert/strict";
import test from "node:test";
import { closedOutputProbe, isFinalOutputDecode, simpleWindowsNativeArguments } from "../scripts/lib/closed-original-output-probe.mjs";
const file = "H:\\Github Repositories\\fileconverter\\work\\mpeg2-static-ui-original-runtime-example\\profile\\output";
const probe = `ffprobe -v error -count_frames -show_streams -show_format -show_chapters -of json "${file}"`;
test("Only the original driver's full post-completion output probe identifies a validation window", () => {
  assert.equal(closedOutputProbe(probe), file);
  assert.equal(closedOutputProbe(probe.replace("ffprobe", '"C:\\ffmpeg\\bin\\ffprobe.exe"')), file);
  for (const changed of [probe.replace("-count_frames ", ""), probe.replace("ffprobe", "ffmpeg"),
    probe + " -read_intervals 0%+1", probe.replace("json", "csv"), probe.replace("-count_frames", "-count_packets"),
    probe.replace("-show_chapters ", ""), probe + ' "extra"']) assert.equal(closedOutputProbe(changed), null);
});
test("Native command parsing fails closed for ambiguous or escaped quotes and unbounded arguments", () => {
  assert.deepEqual(simpleWindowsNativeArguments('"C:\\Program Files\\tool.exe" -v error "file name"'), ["C:\\Program Files\\tool.exe", "-v", "error", "file name"]);
  for (const changed of ['"unterminated', '"path\\" next', 'prefix"nested"', '"path"suffix', "x ".repeat(33), "x".repeat(32769)])
    assert.throws(() => simpleWindowsNativeArguments(changed));
});
test("Supplement must stop before the driver's final full decode and SSIM/cleanup stages", () => {
  const command = `ffmpeg -v error -xerror -i "${file}" -map 0:v -map 0:a -f null -`;
  assert.equal(isFinalOutputDecode(command, file), true);
  assert.equal(isFinalOutputDecode(command.replace("ffmpeg", '"C:\\ffmpeg\\bin\\ffmpeg.exe"'), file), true);
  assert.equal(isFinalOutputDecode(command, "other-output"), false);
  assert.equal(isFinalOutputDecode(command.replace("-xerror ", ""), file), false);
  assert.equal(isFinalOutputDecode(probe, file), false);
});
