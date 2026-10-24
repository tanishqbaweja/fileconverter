// Unit select-event doubles only; these do not establish browser conversion.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectMpeg2UiControls } from "../scripts/lib/mpeg2-ui-controls.mjs";
function fixture(unsupportedCodec = false) {
  const values = { "format-select": "mkv-to-mp4-mpeg2", "video-codec-select": "automatic", "video-width-select": "0", "video-bitrate-select": "0",
    "video-frame-rate-select": "0", "video-quality-select": "automatic" }, events = [];
  const page = { getByTestId(id) { return { inputValue: async () => values[id], isDisabled: async () => true,
    locator: () => ({ count: async () => unsupportedCodec ? 2 : 1, innerText: async () => "MPEG-2 (fixed)" }),
    selectOption: async value => { events.push([id, value]); values[id] = value; },
    innerText: async () => id === "media-plan-stream-1" ? "COPY AAC" : id === "video-encoding-options" ? "Qualification-only controls" : "MPEG-2 encoding plan" }; },
    waitForFunction: async () => {} };
  return { page, events };
}
test("private UI selection uses four real select events and checks codec lock and readback", async () => {
  const f = fixture(), selected = { codec: "automatic", maxWidth: 320, bitRateBps: 1000000, frameRateFps: 15, quality: "higher" };
  const r = await selectMpeg2UiControls(f.page, selected); assert.deepEqual(r.selected, selected); assert.equal(f.events.length, 4);
  assert.equal(r.realSelectEvents, true); assert.equal(r.publicAcceptance, false);
  await assert.rejects(selectMpeg2UiControls(fixture(true).page, selected));
});
test("actual UI gate uses the real Convert observer, deterministic input and original independent validators", async () => {
  const driver = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  const ui = await readFile(new URL("../scripts/lib/mpeg2-ui-job.mjs", import.meta.url), "utf8");
  assert.match(driver, /const ui = flags.has\("--ui"\) \|\| uiControls/);
  assert.match(driver, /page.evaluate\(runMpeg2UiJob, selectedUiOptions\)/); assert.match(driver, /selectMpeg2UiControls\(page, testCase.videoOptions\)/);
  assert.match(driver, /ui && !uiControls \? 12 : 4/); assert.match(driver, /mpeg2ControlFixtureArguments\(fixture\)/);
  assert.match(ui, /button.click\(\)/); assert.match(ui, /Actual form options differ/); assert.doesNotMatch(ui, /runQualificationJob\(/);
  assert.match(driver, /assert.ok\(ssim >= 0.98/); assert.match(driver, /report.memory.incrementalPrivateMiB <= 250/);
});
