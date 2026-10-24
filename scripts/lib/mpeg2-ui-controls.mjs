import assert from "node:assert/strict";
// Real select events only; never sets React state or constructs a worker job.
export async function selectMpeg2UiControls(page, requested) {
  assert.equal(await page.getByTestId("format-select").inputValue(), "mkv-to-mp4-mpeg2");
  const expected = requested ?? { codec: "automatic", maxWidth: 0, bitRateBps: 0, frameRateFps: 0, quality: "automatic" };
  assert.equal(expected.codec, "automatic");
  const codec = page.getByTestId("video-codec-select");
  assert.equal(await codec.inputValue(), "automatic"); assert.equal(await codec.isDisabled(), true);
  assert.equal(await codec.locator("option").count(), 1); assert.match(await codec.locator("option").innerText(), /MPEG-2/);
  const fields = [["maxWidth", "video-width-select"], ["bitRateBps", "video-bitrate-select"],
    ["frameRateFps", "video-frame-rate-select"], ["quality", "video-quality-select"]];
  for (const [key, id] of fields) await page.getByTestId(id).selectOption(String(expected[key]));
  await page.waitForFunction(expected => {
    const plan = document.querySelector('[data-testid="media-plan-stream-0"]')?.textContent ?? "";
    return plan.includes("MPEG-2") && plan.includes(expected.bitRateBps ? `${expected.bitRateBps / 1000000} Mbps` : "4 Mbps") &&
      (!expected.maxWidth || plan.includes(`${expected.maxWidth}px`)) && (!expected.frameRateFps || plan.includes(`${expected.frameRateFps} fps`)) &&
      (!expected.quality || expected.quality === "automatic" || plan.includes(expected.quality));
  }, expected);
  const selected = { codec: await codec.inputValue() };
  for (const [key, id] of fields) { const value = await page.getByTestId(id).inputValue(); selected[key] = key === "quality" ? value : Number(value); }
  assert.deepEqual(selected, expected);
  assert.match(await page.getByTestId("media-plan-stream-1").innerText(), /copy.*AAC/is);
  assert.match(await page.getByTestId("video-encoding-options").innerText(), /Qualification-only controls/);
  return { selected, realSelectEvents: true, codecLockedToMpeg2: true,
    planText: (await page.getByTestId("media-plan-stream-0").innerText()).slice(0, 2048), publicAcceptance: false };
}
